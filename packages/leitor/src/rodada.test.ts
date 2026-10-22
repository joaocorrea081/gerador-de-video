import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FichaLida } from "./adaptador.js";
import { executarRodada, type FonteSite } from "./rodada.js";
import { NavegadorIndisponivelError } from "./navegador-pessoa.js";
import { buscarSite, cadastrarSite, definirSiteAtivo } from "./sites.js";
import { banco } from "./teste-util.js";

function fonteFalsa() {
  const listadas: { url: string; adaptador: string | undefined }[] = [];
  const fonte: FonteSite = {
    async listar(baseUrl, adaptador) {
      listadas.push({ url: baseUrl, adaptador });
      if (baseUrl.includes("quebrado")) throw new Error("site fora do ar");
      return [`${baseUrl}/carro/1`, `${baseUrl}/carro/2`];
    },
    async detalhe(url): Promise<FichaLida> {
      return { marca: "Fiat", modelo: "Argo", ano: 2021, km: 1000, preco: 50000, moeda: "BRL", fotos: [] };
    },
    async baixarFotos() {
      return { baixadas: [], descartadas: [] };
    },
  };
  return { fonte, listadas };
}

const pasta = () => mkdtempSync(join(tmpdir(), "rodada-"));

test("a rodada percorre só os sites ativos, cada um com o seu adaptador", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://a.com.br", adaptador: "autocerto" });
  const b = cadastrarSite(db, { url: "https://b.com.br", adaptador: "jsonld" });
  cadastrarSite(db, { url: "https://c.com.br", adaptador: "jsonld", ativo: false });
  const { fonte, listadas } = fonteFalsa();

  const r = await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.deepEqual(listadas, [
    { url: "https://a.com.br", adaptador: "autocerto" },
    { url: "https://b.com.br", adaptador: "jsonld" },
  ]);
  assert.equal(r.itens.length, 2); // 1 por site
  assert.deepEqual(r.sites!.map((s) => [s.siteId, s.lidos]), [["a.com.br", 1], ["b.com.br", 1]]);
  assert.ok(buscarSite(db, b.id)!.ultimaLeituraEm, "marca quando foi lido");
  assert.equal(buscarSite(db, "c.com.br")!.ultimaLeituraEm, null);

  definirSiteAtivo(db, "a.com.br", false);
  listadas.length = 0;
  await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.deepEqual(listadas.map((l) => l.url), ["https://b.com.br"]);
});

test("endereço explícito: lê só esse, ignora os cadastrados (compatibilidade)", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://a.com.br", adaptador: "jsonld" });
  const { fonte, listadas } = fonteFalsa();
  await executarRodada(db, fonte, { baseUrl: "https://outro.com.br", quantidade: 1, pastaFotos: pasta() });
  assert.deepEqual(listadas, [{ url: "https://outro.com.br", adaptador: "autocerto" }]);
});

test("endereço explícito que falha lança o erro, como antes", async () => {
  const { fonte } = fonteFalsa();
  await assert.rejects(
    executarRodada(banco(), fonte, { baseUrl: "https://quebrado.com.br", quantidade: 1, pastaFotos: pasta() }),
    /fora do ar/,
  );
});

test("um site quebrado não derruba os outros; todos quebrados vira erro da rodada", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://quebrado.com.br", adaptador: "jsonld" });
  cadastrarSite(db, { url: "https://b.com.br", adaptador: "jsonld" });
  const { fonte } = fonteFalsa();
  const r = await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.equal(r.itens.length, 1);
  assert.equal(r.erro, undefined);
  assert.match(r.sites![0]!.erro!, /fora do ar/);

  definirSiteAtivo(db, "b.com.br", false);
  const r2 = await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.match(r2.erro!, /quebrado\.com\.br/);
});

test("sem site ativo e sem endereço: erro claro, não um padrão escondido", async () => {
  const { fonte, listadas } = fonteFalsa();
  const r = await executarRodada(banco(), fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.match(r.erro!, /Nenhum site ativo/);
  assert.equal(listadas.length, 0);
});

test("relendo o mesmo carro não duplica produto", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://a.com.br", adaptador: "jsonld" });
  const { fonte } = fonteFalsa();
  await executarRodada(db, fonte, { quantidade: 2, pastaFotos: pasta() });
  await executarRodada(db, fonte, { quantidade: 2, pastaFotos: pasta() });
  assert.equal((db.prepare("SELECT COUNT(*) n FROM produto").get() as { n: number }).n, 2);
});

test("rodada agendada PULA site em modo navegador-da-pessoa, com o motivo; manual tenta", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://a.com.br", adaptador: "jsonld", modo: "navegador-da-pessoa" });
  cadastrarSite(db, { url: "https://b.com.br", adaptador: "jsonld" });
  const { fonte, listadas } = fonteFalsa();

  const r = await executarRodada(db, fonte, { quantidade: 1, agendada: true, pastaFotos: pasta() });
  assert.deepEqual(listadas.map((l) => l.url), ["https://b.com.br"]);
  assert.equal(r.sites![0]!.estado, "pulado-agendada");
  assert.match(r.sites![0]!.erro!, /navegador da pessoa aberto/);

  listadas.length = 0;
  await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.equal(listadas.length, 2);
});

test("navegador da pessoa indisponível vira estado do site, não derruba a rodada", async () => {
  const db = banco();
  cadastrarSite(db, { url: "https://a.com.br", adaptador: "jsonld", modo: "navegador-da-pessoa" });
  cadastrarSite(db, { url: "https://b.com.br", adaptador: "jsonld" });
  const { fonte } = fonteFalsa();
  const original = fonte.listar;
  fonte.listar = async (u, a, m) => {
    if (m === "navegador-da-pessoa") throw new NavegadorIndisponivelError("navegador-fechado", "Abra o navegador");
    return original(u, a, m);
  };
  const r = await executarRodada(db, fonte, { quantidade: 1, pastaFotos: pasta() });
  assert.equal(r.sites![0]!.estado, "navegador-indisponivel");
  assert.equal(r.itens.length, 1);
});
