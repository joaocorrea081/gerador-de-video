// Rotas HTTP reais (servidor em 127.0.0.1, porta efêmera) das ações da Etapa 5.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { criarVideoComJob, marcarJobConcluido, migrar } from "@gerador/core";
import { criarProvedorPorEnv, type Provedor } from "@gerador/escritor";
import { executarRodada, type FonteSite } from "@gerador/leitor";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };
const SEGREDO = "sk-SEGREDO-NAO-PODE-VAZAR-123";

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
let envParaProvedor: Record<string, string | undefined> = {};
let provedorFalso: Provedor | undefined;
let fonteFalsa: FonteSite;
let agora = new Date("2026-10-21T15:00:00.000Z");

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => provedorFalso ?? criarProvedorPorEnv(envParaProvedor),
  executarRodada: (db, ag) =>
    executarRodada(db, fonteFalsa, { baseUrl: ag.siteUrl, quantidade: ag.quantidade, filtro: ag.filtro, pastaFotos: pasta }),
  relerProduto: async () => {
    throw new Error("não usado");
  },
  agora: () => agora,
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-portao-"));
  servidor = iniciarServidor(0, { deps, agendadorAutomatico: false });
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => servidor.close(() => r()));
  rmSync(pasta, { recursive: true, force: true });
});

beforeEach(() => {
  caminhoBanco = join(pasta, `t-${Math.random().toString(36).slice(2)}.db`);
  envParaProvedor = {};
  provedorFalso = undefined;
  agora = new Date("2026-10-21T15:00:00.000Z");
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(
    JSON.stringify(FICHA),
    "2026-10-21T12:00:00.000Z",
  );
  for (let i = 0; i < 3; i++) {
    db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, ?, 1024, 768, ?, ?)").run(
      `http://x/f${i}`,
      `/tmp/f${i}.jpg`,
      i,
    );
  }
  db.close();
});

async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: any; texto: string }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: "painel-idioma=pt-BR" } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(base + caminho, init);
  const texto = await r.text();
  return { status: r.status, json: texto ? JSON.parse(texto) : undefined, texto };
}

function videoPronto(): number {
  const db = abrir();
  const { video, job } = criarVideoComJob(db, {
    produtoId: 1, titulo: "Corolla 2020", corpo: "Carro bom.", fundo: "claro", ritmo: "calmo", ordemFotos: [],
  });
  marcarJobConcluido(db, job.id, video.id, "/tmp/v.mp4");
  db.close();
  return video.id;
}

function contar(tabela: string): number {
  const db = abrir();
  const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;
  db.close();
  return n;
}

test("servidor escuta só em 127.0.0.1", () => {
  assert.equal((servidor.address() as AddressInfo).address, "127.0.0.1");
});

test("POST refazer: fundo fora do cardápio -> 400 e nada enfileirado", async () => {
  const id = videoPronto();
  const r = await chamar("POST", `/api/videos/${id}/refazer`, { fundo: "neon" });
  assert.equal(r.status, 400);
  assert.match(r.json.erro, /fundo inválido/);
  assert.equal(contar("video"), 1);
});

test("POST refazer: sucesso enfileira job novo e o vídeo antigo continua lá", async () => {
  const id = videoPronto();
  const r = await chamar("POST", `/api/videos/${id}/refazer`, { fundo: "escuro", ritmo: "rapido", ordemFotos: [2, 0] });
  assert.equal(r.status, 200);
  assert.equal(r.json.job.estado, "pendente");
  assert.equal(r.json.video.fundo, "escuro");
  assert.notEqual(r.json.video.id, id);
  assert.equal(contar("video"), 2);
  assert.equal(contar("job"), 2);
});

test("POST reescrever-texto sem chave -> 503 claro, sem texto inventado e sem vazar chave", async () => {
  const id = videoPronto();
  // Outra chave no ambiente, para provar que nada de chave aparece na resposta.
  envParaProvedor = { PROVEDOR_IA: "claude", DEEPSEEK_API_KEY: SEGREDO };
  const r = await chamar("POST", `/api/videos/${id}/reescrever-texto`);
  assert.equal(r.status, 503);
  assert.equal(r.json.codigo, "chave_ausente");
  assert.match(r.json.erro, /ANTHROPIC_API_KEY/);
  assert.match(r.json.erro, /não está definida/);
  assert.ok(!r.texto.includes(SEGREDO));
  const db = abrir();
  const v = db.prepare("SELECT titulo, corpo FROM video WHERE id = ?").get(id) as { titulo: string; corpo: string };
  db.close();
  assert.deepEqual(v, { titulo: "Corolla 2020", corpo: "Carro bom." });
});

test("POST reescrever-texto com escritor: grava texto e escolhas, descarta preço do modelo", async () => {
  const id = videoPronto();
  provedorFalso = {
    gerar: async () => ({
      textoCru: JSON.stringify({
        texto: { titulo: "Corolla revisado", corpo: "Pronto pra rodar." },
        cardapio: { fundo: "gradiente", ritmo: "rapido" },
        ordemFotos: [2, 1, 0],
        preco: 1,
      }),
      tokensEntrada: 1,
      tokensSaida: 1,
    }),
  };
  const r = await chamar("POST", `/api/videos/${id}/reescrever-texto`);
  assert.equal(r.status, 200);
  assert.equal(r.json.video.titulo, "Corolla revisado");
  assert.equal(r.json.video.fundo, "gradiente");
  assert.equal(r.json.videoDesatualizado, true);
  const db = abrir();
  const p = db.prepare("SELECT dados_json FROM produto WHERE id = 1").get() as { dados_json: string };
  db.close();
  assert.equal(JSON.parse(p.dados_json).preco, 15500);
});

test("POST reescrever-texto: falha do provedor vira 502 legível, sem vazar chave", async () => {
  const id = videoPronto();
  provedorFalso = {
    gerar: async () => {
      throw new (await import("@gerador/escritor")).ErroProvedor("Claude respondeu 401 Unauthorized");
    },
  };
  const r = await chamar("POST", `/api/videos/${id}/reescrever-texto`);
  assert.equal(r.status, 502);
  assert.equal(r.json.codigo, "escritor_falhou");
});

test("POST editar-texto grava e NÃO muda preço/ano/km/modelo mesmo se vierem no corpo", async () => {
  const id = videoPronto();
  const r = await chamar("POST", `/api/videos/${id}/editar-texto`, {
    titulo: "Novo título", corpo: "Novo corpo", preco: 1, ano: 1900, km: 0, modelo: "Ferrari",
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.video.titulo, "Novo título");
  const db = abrir();
  const p = db.prepare("SELECT dados_json FROM produto WHERE id = 1").get() as { dados_json: string };
  db.close();
  assert.deepEqual(JSON.parse(p.dados_json), FICHA);
  const lista = await chamar("GET", "/api/estoque");
  assert.equal(lista.json.estoque[0].ficha.preco, 15500);
});

test("POST editar-texto sem título -> 400", async () => {
  const id = videoPronto();
  const r = await chamar("POST", `/api/videos/${id}/editar-texto`, { corpo: "x" });
  assert.equal(r.status, 400);
});

test("agendamento: ligar, ler, e rodar agora com fonte falsa (sem duplicar produto)", async () => {
  fonteFalsa = {
    listar: async () => ["http://x/1", "http://x/2"],
    detalhe: async (url) => ({ ...(url.endsWith("1") ? FICHA : { ...FICHA, marca: "Fiat", modelo: "Uno" }), fotos: [] }),
    baixarFotos: async () => ({ baixadas: [], descartadas: [] }),
  };

  const lig = await chamar("POST", "/api/agendamento", { ligado: true, intervaloMinutos: 30, filtro: { marca: "Toyota" } });
  assert.equal(lig.status, 200);
  assert.equal(lig.json.agendamento.ligado, true);
  assert.equal(lig.json.agendamento.proximaRodada, agora.toISOString());

  const r1 = await chamar("POST", "/api/agendamento/rodar-agora");
  assert.equal(r1.status, 200);
  const itens = r1.json.resumo.itens;
  assert.equal(itens.length, 2);
  // produto 1 (Toyota) já existia sem vídeo -> novo e passa no filtro; Fiat fica fora do filtro
  assert.equal(itens.find((i: any) => i.url === "http://x/1").enfileirado, true);
  assert.equal(itens.find((i: any) => i.url === "http://x/2").motivo, "fora do filtro");
  assert.equal(contar("produto"), 2);
  assert.equal(contar("video"), 1);

  const ag = (await chamar("GET", "/api/agendamento")).json.agendamento;
  assert.match(ag.ultimaRodada, /^\d{4}-\d\d-\d\dT.*Z$/);
  assert.equal(
    ag.proximaRodada,
    new Date(new Date(ag.ultimaRodada).getTime() + 30 * 60_000).toISOString(),
  );

  // Segunda rodada: nada mudou e o produto 1 já tem vídeo -> pulado, nenhum produto/vídeo duplicado.
  const r2 = await chamar("POST", "/api/agendamento/rodar-agora");
  assert.equal(r2.status, 200);
  assert.ok(r2.json.resumo.itens.every((i: any) => i.enfileirado === false));
  assert.equal(contar("produto"), 2);
  assert.equal(contar("video"), 1);
});

test("agendamento: intervalo inválido -> 400; rodar agora com site fora do ar -> 502 e registra a rodada", async () => {
  const ruim = await chamar("POST", "/api/agendamento", { intervaloMinutos: 2 });
  assert.equal(ruim.status, 400);

  fonteFalsa = {
    listar: async () => {
      throw new Error("site fora do ar");
    },
    detalhe: async () => ({ fotos: [] }),
    baixarFotos: async () => ({ baixadas: [], descartadas: [] }),
  };
  const r = await chamar("POST", "/api/agendamento/rodar-agora");
  assert.equal(r.status, 502);
  assert.match(r.json.erro, /site fora do ar/);
  const ag = (await chamar("GET", "/api/agendamento")).json.agendamento;
  assert.equal(ag.ultimoResultado.erro, "site fora do ar");
  assert.ok(ag.ultimaRodada);
});

test("GET fila/progresso e estoque, e gerar-video do estoque (com recusa quando já tem)", async () => {
  const p0 = await chamar("GET", "/api/fila/progresso");
  assert.equal(p0.status, 200);
  assert.equal(p0.json.progresso.pendentes, 0);
  assert.equal(p0.json.progresso.emExecucao, null);

  const est = await chamar("GET", "/api/estoque");
  assert.equal(est.json.estoque[0].temVideo, false);
  assert.equal(est.json.estoque[0].quantidadeFotos, 3);

  const g = await chamar("POST", "/api/estoque/1/gerar-video");
  assert.equal(g.status, 200);
  assert.equal(g.json.job.estado, "pendente");

  const g2 = await chamar("POST", "/api/estoque/1/gerar-video");
  assert.equal(g2.status, 400);

  const est2 = await chamar("GET", "/api/estoque");
  assert.equal(est2.json.estoque[0].video.estado, "rascunho");
  assert.equal((await chamar("GET", "/api/fila/progresso")).json.progresso.pendentes, 1);
});

test("POST estoque/:id/reler: produto inexistente -> 400; falha do site -> 502", async () => {
  assert.equal((await chamar("POST", "/api/estoque/99/reler")).status, 400);
  assert.equal((await chamar("POST", "/api/estoque/1/reler")).status, 502);
});
