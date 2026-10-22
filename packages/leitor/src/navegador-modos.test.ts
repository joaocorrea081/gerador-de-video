import { test } from "node:test";
import assert from "node:assert/strict";
import { BloqueioError } from "./bloqueio.js";
import type { Navegador } from "./navegador.js";
import { avisoDeAgendamento, navegadorDoModo } from "./navegador-modos.js";
import { NavegadorIndisponivelError, verificarNavegadorDaPessoa, abrirNavegadorDaPessoa, type ExecBsk } from "./navegador-pessoa.js";
import { fixture } from "./teste-util.js";

const U = "https://revenda.example.com.br/estoque";

function nav(nome: string, comportamento: () => string): Navegador & { n: number; fechado: boolean } {
  const o = {
    n: 0,
    fechado: false,
    async abrirERolar() {
      o.n += 1;
      return comportamento();
    },
    async fechar() {
      o.fechado = true;
    },
  };
  void nome;
  return o;
}
const bloqueia = () => {
  throw new BloqueioError("desafio-cloudflare", U);
};

test("modo playwright: nunca chama o navegador da pessoa, mesmo com bloqueio", async () => {
  const pw = nav("pw", bloqueia);
  const pessoa = nav("pessoa", () => "ok");
  const m = navegadorDoModo("playwright", { playwright: async () => pw, pessoa: async () => pessoa });
  await assert.rejects(m.abrirERolar(U), BloqueioError);
  assert.equal(pessoa.n, 0);
});

test("modo navegador-da-pessoa: nunca abre o Playwright", async () => {
  const pw = nav("pw", () => "pw");
  const pessoa = nav("pessoa", () => "pessoa");
  const m = navegadorDoModo("navegador-da-pessoa", { playwright: async () => pw, pessoa: async () => pessoa });
  assert.equal(await m.abrirERolar(U), "pessoa");
  assert.equal(pw.n, 0);
  assert.deepEqual([...m.caminhosUsados()], ["navegador-da-pessoa"]);
});

test("modo automatico: site normal fica no Playwright; bloqueio cai para o navegador da pessoa e não martela", async () => {
  const normal = nav("pw", () => "pw");
  const pessoa1 = nav("pessoa", () => "pessoa");
  const m1 = navegadorDoModo("automatico", { playwright: async () => normal, pessoa: async () => pessoa1 });
  assert.equal(await m1.abrirERolar(U), "pw");
  assert.equal(pessoa1.n, 0);

  const barrado = nav("pw", bloqueia);
  const pessoa2 = nav("pessoa", () => "pessoa");
  const m2 = navegadorDoModo("automatico", { playwright: async () => barrado, pessoa: async () => pessoa2 });
  assert.equal(await m2.abrirERolar(U), "pessoa");
  assert.equal(await m2.abrirERolar(U + "?p=2"), "pessoa");
  assert.equal(barrado.n, 1, "depois do bloqueio, o Playwright não tenta de novo nessa origem");
  assert.deepEqual([...m2.caminhosUsados()], ["navegador-da-pessoa"]);
  await m2.fechar();
  assert.ok(barrado.fechado && pessoa2.fechado);
});

test("modo automatico: erro que não é bloqueio NÃO aciona o navegador da pessoa", async () => {
  const pw = nav("pw", () => {
    throw new Error("timeout");
  });
  const pessoa = nav("pessoa", () => "pessoa");
  const m = navegadorDoModo("automatico", { playwright: async () => pw, pessoa: async () => pessoa });
  await assert.rejects(m.abrirERolar(U), /timeout/);
  assert.equal(pessoa.n, 0);
});

test("modo automatico: bloqueio + navegador da pessoa fechado = estado claro, sem estourar feio", async () => {
  const exec: ExecBsk = async (args) =>
    args[0] === "status" ? { codigo: 0, saida: "{}", erro: "" } : { codigo: 0, saida: "[]", erro: "" }; // daemon de pé, 0 navegadores
  const m = navegadorDoModo("automatico", {
    playwright: async () => nav("pw", bloqueia),
    pessoa: () => abrirNavegadorDaPessoa(exec),
  });
  await assert.rejects(
    m.abrirERolar(U),
    (e: unknown) => e instanceof NavegadorIndisponivelError && e.motivo === "navegador-fechado" && /Abra o navegador/.test(e.message),
  );
});

test("verificarNavegadorDaPessoa: bsk ausente, daemon parado, navegador fechado, tudo certo", async () => {
  const ausente: ExecBsk = async () => ({ codigo: 1, saida: "", erro: "bsk não encontrado no PATH" });
  assert.equal((await verificarNavegadorDaPessoa(ausente)).motivo, "bsk-ausente");

  const parado: ExecBsk = async () => ({ codigo: 1, saida: "", erro: "decode IPC response: EOF" });
  const p = await verificarNavegadorDaPessoa(parado, { subirDaemon: false });
  assert.equal(p.disponivel, false);
  assert.equal(p.motivo, "daemon-parado");

  const fechado: ExecBsk = async (a) => ({ codigo: 0, saida: a[0] === "browsers" ? "[]" : "{}", erro: "" });
  assert.equal((await verificarNavegadorDaPessoa(fechado)).motivo, "navegador-fechado");

  const ok: ExecBsk = async (a) => ({
    codigo: 0,
    saida: a[0] === "browsers" ? '[{"instance_id":"a","unresponsive":false}]' : "{}",
    erro: "",
  });
  assert.equal((await verificarNavegadorDaPessoa(ok)).disponivel, true);
});

test("navegador da pessoa: navega, rola, pega o HTML e para em bloqueio (bsk falso)", async () => {
  const chamadas: string[][] = [];
  let html = fixture("generico-detalhe-1.html");
  let final = "https://revenda.example.com.br/estoque";
  const exec: ExecBsk = async (a) => {
    chamadas.push(a);
    if (a[0] === "status") return { codigo: 0, saida: "{}", erro: "" };
    if (a[0] === "browsers") return { codigo: 0, saida: '[{"unresponsive":false}]', erro: "" };
    if (a[0] === "session" && a[1] === "start") return { codigo: 0, saida: '{"session_id":"s1"}', erro: "" };
    if (a[0] === "navigate") return { codigo: 0, saida: JSON.stringify({ final_url: final }), erro: "" };
    if (a[0] === "get-html") return { codigo: 0, saida: html, erro: "" };
    return { codigo: 0, saida: "{}", erro: "" };
  };
  const n = await abrirNavegadorDaPessoa(exec);
  assert.equal(await n.abrirERolar(U), html);
  assert.deepEqual(
    chamadas.map((c) => c[0]).filter((c) => ["navigate", "evaluate", "get-html"].includes(c!)),
    ["navigate", "evaluate", "get-html"],
  );
  final = "https://revenda.example.com.br/login";
  html = fixture("bloqueio-login.html");
  await assert.rejects(n.abrirERolar(U), (e: unknown) => e instanceof BloqueioError && e.sinal === "login");
  await n.fechar();
  assert.deepEqual(chamadas.at(-1), ["session", "stop", "s1"]);
});

test("aviso de agendamento: só os modos que dependem do navegador da pessoa avisam", () => {
  assert.equal(avisoDeAgendamento("playwright"), undefined);
  assert.match(avisoDeAgendamento("navegador-da-pessoa")!, /NÃO roda sozinho/);
  assert.match(avisoDeAgendamento("automatico")!, /precisa estar aberto/);
});
