// Testes dos controles que evitam prejuízo: carro vendido no ar, preço
// desatualizado e freio de mão. Tudo em banco de memória e fonte falsa:
// nunca toca rede nem dados/gerador.db.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  agendarPublicacao, aprovarVideo, conectarConta, criarVideoComJob, definirExigirConferencia,
  definirLeiturasParaSaida, definirValidadeConferenciaMin, gerarVideoDoEstoque, liberarParaNovaConferencia,
  listarAlertasEstoque, listarEstoque, marcarJobConcluido, marcarJobEmExecucao, marcarPublicada, obterPausa,
  obterPublicacao, pausarTudo, proximoJobPendente, publicacoesVencidas, reivindicarPublicacao, remarcarPublicacao,
  retomarTudo, ErroPublicacao, ErroPortao, produtoSaiuDoEstoque, definirAjuste,
} from "@gerador/core";
import type { FichaLida } from "./adaptador.js";
import { BloqueioError } from "./bloqueio.js";
import { conferirAntesDePublicar } from "./conferir-publicacao.js";
import { PaginaInexistenteError } from "./pagina-inexistente.js";
import { executarRodada, type FonteSite } from "./rodada.js";
import { cadastrarSite } from "./sites.js";
import { banco } from "./teste-util.js";

const HOST = "loja.com.br";
const urlDe = (n: number) => `https://${HOST}/carro/${n}`;
const pasta = () => mkdtempSync(join(tmpdir(), "controles-"));
const AGORA = new Date("2026-10-22T15:00:00.000Z");

type Detalhe = "ok" | "404" | "erro" | "bloqueio" | "vazio";

/** Fonte falsa com o "site" na mão: o que a listagem mostra e como cada página responde. */
function siteFalso() {
  const s = {
    lista: [] as string[],
    listagemFalha: undefined as Error | undefined,
    detalhe: new Map<string, Detalhe>(),
    precos: new Map<string, number | undefined>(),
    leituras: [] as string[],
  };
  const fonte: FonteSite = {
    async listar() {
      if (s.listagemFalha) throw s.listagemFalha;
      return [...s.lista];
    },
    async detalhe(url): Promise<FichaLida> {
      s.leituras.push(url);
      const modo = s.detalhe.get(url) ?? "ok";
      if (modo === "404") throw new PaginaInexistenteError(url, 404);
      if (modo === "erro") throw new Error("ECONNREFUSED");
      if (modo === "bloqueio") throw new BloqueioError("http-403", url);
      if (modo === "vazio") return { fotos: [] };
      const preco = s.precos.has(url) ? s.precos.get(url) : 50000;
      return { marca: "Fiat", modelo: "Argo", ano: 2021, km: 1000, ...(preco !== undefined ? { preco } : {}), moeda: "BRL", fotos: [] };
    },
    async baixarFotos() {
      return { baixadas: [], descartadas: [] };
    },
  };
  return { s, fonte };
}

async function rodar(db: Database.Database, fonte: FonteSite, extra: { agendada?: boolean } = {}) {
  return executarRodada(db, fonte, { quantidade: 50, pastaFotos: pasta(), ...extra });
}

function banco_com_site(urls: number[]) {
  const db = banco();
  cadastrarSite(db, { url: `https://${HOST}`, adaptador: "jsonld" });
  const { s, fonte } = siteFalso();
  s.lista = urls.map(urlDe);
  return { db, s, fonte };
}

const produtoId = (db: Database.Database, n: number) =>
  (db.prepare("SELECT id FROM produto WHERE origem_url = ?").get(urlDe(n)) as { id: number }).id;
const ausencias = (db: Database.Database, n: number) =>
  (db.prepare("SELECT ausencias_seguidas a FROM produto WHERE origem_url = ?").get(urlDe(n)) as { a: number }).a;

// ===================================================== 1. CARRO VENDIDO

test("estoque: sumir da listagem em UMA leitura NÃO marca como vendido", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), false);
  assert.equal(ausencias(db, 1), 1);
});

test("estoque: sumir em N leituras seguidas (3 por padrão) marca, com data, sem apagar nada", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  const id = produtoId(db, 1);
  const videosAntes = (db.prepare("SELECT COUNT(*) n FROM video WHERE produto_id = ?").get(id) as { n: number }).n;
  assert.ok(videosAntes >= 1);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  await rodar(db, fonte);
  await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, id), false, "2 leituras ainda não bastam");
  const r = await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, id), true);
  assert.deepEqual(r.sites![0]!.estoque!.marcados, [id]);
  const l = db.prepare("SELECT saiu_do_estoque_em s, dados_json d FROM produto WHERE id = ?").get(id) as { s: string; d: string };
  assert.ok(Date.parse(l.s) > 0, "tem data");
  assert.ok(l.d.includes("Argo"), "o produto e o dado continuam lá");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM video WHERE produto_id = ?").get(id) as { n: number }).n, videosAntes, "o histórico continua");
});

test("estoque: o número de leituras é configurável", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  definirLeiturasParaSaida(db, 2);
  await rodar(db, fonte);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), false);
  await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), true);
});

test("estoque: leituras NÃO seguidas não somam (reaparecer zera a contagem)", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.detalhe.set(urlDe(1), "404");
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  await rodar(db, fonte);
  await rodar(db, fonte);
  assert.equal(ausencias(db, 1), 2);
  s.lista = [urlDe(1), urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "ok");
  await rodar(db, fonte);
  assert.equal(ausencias(db, 1), 0);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), false);
});

test("estoque: site fora do ar, bloqueado ou com navegador caído NUNCA marca (várias rodadas)", async () => {
  for (const falha of [new Error("ECONNREFUSED"), new BloqueioError("desafio-cloudflare", "https://loja.com.br"), new BloqueioError("http-429", "x")]) {
    const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
    await rodar(db, fonte);
    s.listagemFalha = falha;
    for (let i = 0; i < 6; i++) await rodar(db, fonte);
    for (const n of [1, 2, 3, 4]) {
      assert.equal(produtoSaiuDoEstoque(db, produtoId(db, n)), false, `${falha.message}`);
      assert.equal(ausencias(db, n), 0);
    }
  }
});

test("estoque: listagem VAZIA nunca marca ninguém", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.lista = [];
  for (const n of [1, 2, 3, 4]) s.detalhe.set(urlDe(n), "404"); // até com 404 em tudo
  let ultima;
  for (let i = 0; i < 6; i++) ultima = await rodar(db, fonte);
  for (const n of [1, 2, 3, 4]) assert.equal(produtoSaiuDoEstoque(db, produtoId(db, n)), false);
  assert.match(ultima!.sites![0]!.estoque!.ignorada!, /listagem vazia/);
});

test("estoque: fora da listagem mas com a página no ar NÃO é venda (listagem paginada)", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)]; // o 1 está na página 2 da listagem, mas responde 200
  for (let i = 0; i < 5; i++) await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), false);
  assert.equal(ausencias(db, 1), 0);
});

test("estoque: fora da listagem e a página dá erro/bloqueio/ficha vazia = inconclusivo, não conta", async () => {
  for (const modo of ["erro", "bloqueio", "vazio"] as const) {
    const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
    await rodar(db, fonte);
    s.lista = [urlDe(2), urlDe(3), urlDe(4)];
    s.detalhe.set(urlDe(1), modo);
    for (let i = 0; i < 5; i++) await rodar(db, fonte);
    assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), false, modo);
    assert.equal(ausencias(db, 1), 0, modo);
  }
});

test("estoque: sumiço em massa (parece mudança no site) é ignorado", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4, 5, 6]);
  await rodar(db, fonte);
  s.lista = [urlDe(6)]; // 5 de 6 somem de uma vez
  for (const n of [1, 2, 3, 4, 5]) s.detalhe.set(urlDe(n), "404");
  let r;
  for (let i = 0; i < 5; i++) r = await rodar(db, fonte);
  for (const n of [1, 2, 3, 4, 5]) assert.equal(produtoSaiuDoEstoque(db, produtoId(db, n)), false);
  assert.match(r!.sites![0]!.estoque!.ignorada!, /de uma vez/);
});

test("estoque: o carro VOLTA a aparecer e a marcação é desfeita", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  for (let i = 0; i < 3; i++) await rodar(db, fonte);
  const id = produtoId(db, 1);
  assert.equal(produtoSaiuDoEstoque(db, id), true);
  s.lista = [urlDe(1), urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "ok");
  const r = await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, id), false);
  assert.deepEqual(r.sites![0]!.estoque!.voltaram, [id]);
  assert.equal(ausencias(db, 1), 0);
});

test("estoque: detalhe 404 de carro que AINDA está listado também conta como prova", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.detalhe.set(urlDe(1), "404"); // continua na listagem (link velho), mas a página sumiu
  for (let i = 0; i < 3; i++) await rodar(db, fonte);
  assert.equal(produtoSaiuDoEstoque(db, produtoId(db, 1)), true);
});

test("estoque: produto fora do estoque não gera vídeo, aparece no estoque e não agenda", async () => {
  const { db, s, fonte } = banco_com_site([1, 2, 3, 4]);
  await rodar(db, fonte);
  s.lista = [urlDe(2), urlDe(3), urlDe(4)];
  s.detalhe.set(urlDe(1), "404");
  for (let i = 0; i < 3; i++) await rodar(db, fonte);
  const id = produtoId(db, 1);
  assert.throws(() => gerarVideoDoEstoque(db, id), ErroPortao);
  const item = listarEstoque(db).find((e) => e.produtoId === id)!;
  assert.ok(item.saiuDoEstoqueEm);
});

test("estoque: publicação de carro vendido é travada e a já publicada vira alerta 'tirar do ar' (sem remover)", () => {
  const db = banco();
  const a = cenarioPublicacao(db, 1);
  const b = cenarioPublicacao(db, 2);
  marcarPublicada(db, a.pub.id, { idExterno: "ig-1", simulado: false, legenda: "x" }, AGORA); // já no ar
  // o carro 1 e o 2 saem do estoque
  for (const p of [a.produtoId, b.produtoId]) {
    db.prepare("UPDATE produto SET saiu_do_estoque_em = ? WHERE id = ?").run(AGORA.toISOString(), p);
  }
  assert.deepEqual(publicacoesVencidas(db, AGORA).map((p) => p.id), [], "nada novo sai");
  assert.equal(reivindicarPublicacao(db, b.pub.id, AGORA), false);
  const alertas = listarAlertasEstoque(db);
  assert.deepEqual(alertas.map((x) => [x.publicacaoId, x.situacao]).sort(), [[a.pub.id, "tirar_do_ar"], [b.pub.id, "bloqueada"]].sort());
  assert.equal(obterPublicacao(db, a.pub.id)!.estado, "publicada", "não removeu o post sozinho");
  assert.throws(() => remarcarPublicacao(db, b.pub.id, "2026-12-01T10:00:00Z", AGORA), (e: unknown) => e instanceof ErroPublicacao && e.codigo === "produto_fora_do_estoque");
});

// ============================================ 2. RELER O PREÇO ANTES

/** Produto + vídeo APROVADO com snapshot (preço 50000) + publicação vencida no Instagram. */
function cenarioPublicacao(db: Database.Database, n: number, preco = 50000) {
  const dados = JSON.stringify({ marca: "Fiat", modelo: "Argo", ano: 2021, km: 1000, preco, moeda: "BRL" });
  const r = db.prepare("INSERT INTO produto (origem_url, dados_json, lido_em) VALUES (?, ?, ?)").run(urlDe(n), dados, AGORA.toISOString());
  const pid = Number(r.lastInsertRowid);
  const { video, job } = criarVideoComJob(db, { produtoId: pid, titulo: "t", corpo: "c", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobEmExecucao(db, job.id, video.id); // grava o snapshot
  marcarJobConcluido(db, job.id, video.id, "/tmp/x.mp4");
  aprovarVideo(db, video.id);
  if (!db.prepare("SELECT 1 FROM conta_rede WHERE rede = 'instagram'").get()) conectarConta(db, "instagram", { modo: "seco" }, AGORA);
  // Cada cenário num horário diferente (3h de distância) para respeitar o espaçamento.
  const quando = new Date(AGORA.getTime() - n * 3 * 3_600_000).toISOString();
  const pub = agendarPublicacao(db, { videoId: video.id, rede: "instagram", quando }, AGORA, { permitirPassado: true });
  return { produtoId: pid, videoId: video.id, pub, url: urlDe(n) };
}

test("conferência: o snapshot do vídeo é gravado quando o render começa", () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const snap = db.prepare("SELECT dados_snapshot_json s FROM video WHERE id = ?").get(c.videoId) as { s: string };
  assert.equal(JSON.parse(snap.s).preco, 50000);
});

test("conferência: PREÇO MUDOU bloqueia a publicação e diz de quanto para quanto", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { s, fonte } = siteFalso();
  s.precos.set(c.url, 47000);
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  assert.equal(r.liberada, false);
  assert.equal(r.liberada === false && r.estado, "mudou");
  const conf = obterPublicacao(db, c.pub.id)!.conferencia!;
  assert.equal(conf.estado, "mudou");
  assert.deepEqual(conf.diferencas.map((d) => [d.campo, d.antes, d.depois]), [["preco", 50000, 47000]]);
  assert.match(conf.diferencas[0]!.descricao, /Preço: de R\$ 50\.000 para R\$ 47\.000/);
  assert.deepEqual(publicacoesVencidas(db, AGORA), [], "não é oferecida ao publicador");
  assert.equal(reivindicarPublicacao(db, c.pub.id, AGORA), false, "nem reivindicada na marra");
  const p = obterPublicacao(db, c.pub.id)!;
  assert.equal(p.estado, "agendada");
  assert.equal(p.tentativas, 0);
});

test("conferência: ano e km diferentes também bloqueiam; igual libera", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { s, fonte } = siteFalso();
  const detalhe = fonte.detalhe;
  fonte.detalhe = async (u, a, m) => ({ ...(await detalhe(u, a, m)), ano: 2022, km: 2500 });
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  assert.equal(r.liberada, false);
  assert.deepEqual(obterPublicacao(db, c.pub.id)!.conferencia!.diferencas.map((d) => d.campo), ["ano", "km"]);

  const c2 = cenarioPublicacao(db, 2);
  void s;
  const r2 = await conferirAntesDePublicar(db, siteFalso().fonte, c2.pub.id, { agora: AGORA });
  assert.equal(r2.liberada, true);
  assert.equal(obterPublicacao(db, c2.pub.id)!.conferencia!.estado, "ok");
});

test("conferência: releitura que FALHA vira 'não consegui conferir' — não publica e não é erro permanente", async () => {
  const casos: [string, (s: ReturnType<typeof siteFalso>["s"], url: string) => void, RegExp, number?][] = [
    ["site fora do ar", (s, u) => s.detalhe.set(u, "erro"), /Não consegui conferir/],
    ["bloqueio", (s, u) => s.detalhe.set(u, "bloqueio"), /Não consegui conferir/],
  ];
  for (const [nome, preparar, esperado] of casos) {
    const db = banco();
    const c = cenarioPublicacao(db, 1);
    const { s, fonte } = siteFalso();
    preparar(s, c.url);
    const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
    assert.equal(r.liberada, false, nome);
    assert.equal(r.liberada === false && r.estado, "nao_conferiu", nome);
    const p = obterPublicacao(db, c.pub.id)!;
    assert.equal(p.estado, "agendada", `${nome}: continua agendada, não virou 'falhou'`);
    assert.equal(p.tentativas, 0, nome);
    assert.equal(p.erro, null, nome);
    assert.match(p.conferencia!.motivo!, esperado);
    assert.deepEqual(publicacoesVencidas(db, AGORA), [], nome);
    assert.equal(reivindicarPublicacao(db, c.pub.id, AGORA), false, nome);
  }
});

test("conferência: tempo esgotado também é 'não consegui conferir'", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { fonte } = siteFalso();
  fonte.detalhe = () => new Promise(() => {}); // nunca responde
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA, timeoutMs: 20 });
  assert.equal(r.liberada === false && r.estado, "nao_conferiu");
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia!.codigo, "tempo_esgotado");
  assert.equal(obterPublicacao(db, c.pub.id)!.estado, "agendada");
});

test("conferência: leitura sem o preço (layout quebrou) NÃO vira 'mudou', vira não conferido", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { s, fonte } = siteFalso();
  s.precos.set(c.url, undefined);
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  assert.equal(r.liberada === false && r.estado, "nao_conferiu");
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia!.codigo, "leitura_incompleta");
});

test("conferência: vídeo antigo sem snapshot não é publicado às cegas", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  db.prepare("UPDATE video SET dados_snapshot_json = NULL WHERE id = ?").run(c.videoId);
  const r = await conferirAntesDePublicar(db, siteFalso().fonte, c.pub.id, { agora: AGORA });
  assert.equal(r.liberada, false);
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia!.codigo, "sem_referencia");
});

test("conferência: página 404 bloqueia e conta como ausência do carro", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { s, fonte } = siteFalso();
  s.detalhe.set(c.url, "404");
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  assert.equal(r.liberada, false);
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia!.codigo, "pagina_inexistente");
  assert.equal(ausencias(db, 1), 1);
  assert.equal(produtoSaiuDoEstoque(db, c.produtoId), false, "uma só leitura ainda não marca");
});

test("conferência: conferência RECENTE dispensa reler; vencida relê; 'forçar' relê", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  definirValidadeConferenciaMin(db, 10);
  const { s, fonte } = siteFalso();
  const r1 = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  assert.equal(r1.liberada && r1.dispensada, false);
  assert.equal(s.leituras.length, 1);

  const r2 = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: new Date(AGORA.getTime() + 9 * 60_000) });
  assert.equal(r2.liberada && r2.dispensada, true);
  assert.equal(s.leituras.length, 1, "não releu");

  await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: new Date(AGORA.getTime() + 11 * 60_000) });
  assert.equal(s.leituras.length, 2, "venceu a validade: releu");
  await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: new Date(AGORA.getTime() + 11 * 60_000), forcar: true });
  assert.equal(s.leituras.length, 3);
});

test("conferência: com 'exigir' ligado só publica com conferência ok e válida", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  definirExigirConferencia(db, true);
  assert.equal(reivindicarPublicacao(db, c.pub.id, AGORA), false, "sem conferir: recusa");
  await conferirAntesDePublicar(db, siteFalso().fonte, c.pub.id, { agora: AGORA });
  assert.equal(reivindicarPublicacao(db, c.pub.id, new Date(AGORA.getTime() + 3_600_000)), false, "conferência vencida: recusa");
  assert.equal(reivindicarPublicacao(db, c.pub.id, new Date(AGORA.getTime() + 60_000)), true);
});

test("conferência: pedir nova tentativa limpa o bloqueio e adia; remarcar também reconfere", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const { s, fonte } = siteFalso();
  s.detalhe.set(c.url, "erro");
  await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: AGORA });
  liberarParaNovaConferencia(db, c.pub.id, 30, AGORA);
  let p = obterPublicacao(db, c.pub.id)!;
  assert.equal(p.conferencia, null);
  assert.equal(p.proximaTentativaEm, new Date(AGORA.getTime() + 30 * 60_000).toISOString());
  assert.deepEqual(publicacoesVencidas(db, AGORA), [], "dentro da espera");
  const depois = new Date(AGORA.getTime() + 31 * 60_000);
  assert.equal(publicacoesVencidas(db, depois).length, 1, "passou a espera: volta a ser oferecida");
  s.detalhe.set(c.url, "ok");
  const r = await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: depois });
  assert.equal(r.liberada, true);

  // remarcar após "mudou" zera a conferência
  s.precos.set(c.url, 1);
  await conferirAntesDePublicar(db, fonte, c.pub.id, { agora: depois, forcar: true });
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia!.estado, "mudou");
  remarcarPublicacao(db, c.pub.id, new Date(depois.getTime() + 3 * 3_600_000).toISOString(), depois);
  assert.equal(obterPublicacao(db, c.pub.id)!.conferencia, null);
});

// ======================================================= 3. PARAR TUDO

test("pausa: impede render novo, publicação nova e leitura agendada", async () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  criarVideoComJob(db, { produtoId: c.produtoId, titulo: "t", corpo: "c", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  cadastrarSite(db, { url: `https://${HOST}`, adaptador: "jsonld" });
  const { s, fonte } = siteFalso();
  s.lista = [urlDe(1)];

  assert.ok(proximoJobPendente(db), "antes: há render a fazer");
  assert.equal(publicacoesVencidas(db, AGORA).length, 1, "antes: há publicação a fazer");

  pausarTudo(db, "joao@loja", "conferir a conta", AGORA);
  assert.equal(proximoJobPendente(db), undefined);
  assert.deepEqual(publicacoesVencidas(db, AGORA), []);
  assert.equal(reivindicarPublicacao(db, c.pub.id, AGORA), false, "nem reivindicando direto");
  const r = await rodar(db, fonte, { agendada: true });
  assert.match(r.erro!, /pausado/);
  assert.equal(s.leituras.length, 0);

  const manual = await rodar(db, fonte); // leitura manual é ato deliberado
  assert.equal(manual.erro, undefined);
  assert.equal(s.leituras.length, 1);
});

test("pausa: grava quem pausou e quando; pausar de novo não troca o autor", () => {
  const db = banco();
  assert.equal(obterPausa(db).pausado, false);
  const p = pausarTudo(db, "  Maria  ", "suspeita de erro", AGORA);
  assert.deepEqual([p.pausado, p.por, p.motivo, p.em], [true, "Maria", "suspeita de erro", AGORA.toISOString()]);
  pausarTudo(db, "Outro", "x", new Date(AGORA.getTime() + 1000));
  assert.equal(obterPausa(db).por, "Maria");
  assert.throws(() => pausarTudo(db, "  "), /quem/);
  retomarTudo(db, "João", new Date(AGORA.getTime() + 5000));
  const e = obterPausa(db);
  assert.deepEqual([e.pausado, e.retomadoPor, e.retomadoEm], [false, "João", new Date(AGORA.getTime() + 5000).toISOString()]);
});

test("pausa: NÃO interrompe publicação em andamento — ela termina e se registra", () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  assert.equal(reivindicarPublicacao(db, c.pub.id, AGORA), true); // 'publicando'
  pausarTudo(db, "Maria", undefined, AGORA);
  assert.equal(obterPublicacao(db, c.pub.id)!.estado, "publicando", "a pausa não mexe nela");
  const fim = marcarPublicada(db, c.pub.id, { idExterno: "ig-9", simulado: false, legenda: "l" }, AGORA);
  assert.equal(fim.estado, "publicada");
  assert.equal(fim.idExterno, "ig-9");
});

test("pausa: render em andamento não é cortado (só não começa o próximo)", () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  const outro = criarVideoComJob(db, { produtoId: c.produtoId, titulo: "t", corpo: "c", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobEmExecucao(db, outro.job.id, outro.video.id);
  pausarTudo(db, "Maria", undefined, AGORA);
  marcarJobConcluido(db, outro.job.id, outro.video.id, "/tmp/y.mp4"); // termina normalmente
  assert.equal((db.prepare("SELECT estado e FROM video WHERE id = ?").get(outro.video.id) as { e: string }).e, "aguardando_aprovacao");
});

test("despausar: a fila volta de onde parou, sem republicar o que já saiu", () => {
  const db = banco();
  const jaSaiu = cenarioPublicacao(db, 1);
  const naFila = cenarioPublicacao(db, 2);
  const futura = cenarioPublicacao(db, 3);
  db.prepare("UPDATE publicacao SET agendada_para = ? WHERE id = ?").run("2027-01-01T10:00:00.000Z", futura.pub.id);
  criarVideoComJob(db, { produtoId: jaSaiu.produtoId, titulo: "t", corpo: "c", fundo: "claro", ritmo: "calmo", ordemFotos: [] });

  assert.equal(reivindicarPublicacao(db, jaSaiu.pub.id, AGORA), true);
  marcarPublicada(db, jaSaiu.pub.id, { idExterno: "ig-1", simulado: false, legenda: "l" }, AGORA);

  pausarTudo(db, "Maria", undefined, AGORA);
  const depois = new Date(AGORA.getTime() + 2 * 3_600_000);
  const r = retomarTudo(db, "Maria", depois);
  assert.equal(obterPausa(db).pausado, false);

  const vencidas = publicacoesVencidas(db, depois).map((p) => p.id);
  assert.deepEqual(vencidas, [naFila.pub.id], "só a que estava na fila; a que já saiu NÃO volta");
  assert.ok(!vencidas.includes(jaSaiu.pub.id));
  assert.equal(obterPublicacao(db, jaSaiu.pub.id)!.estado, "publicada");
  assert.equal(obterPublicacao(db, jaSaiu.pub.id)!.idExterno, "ig-1");
  assert.ok(proximoJobPendente(db), "o render pendente continua lá");
  assert.equal(obterPublicacao(db, futura.pub.id)!.agendadaPara, "2027-01-01T10:00:00.000Z", "o futuro não foi mexido");
  assert.ok(Array.isArray(r.reagendadas));
});

test("despausar: o que venceu durante a pausa sai ESPAÇADO, não tudo de uma vez", () => {
  const db = banco();
  const a = cenarioPublicacao(db, 1);
  // mais duas vencidas na mesma rede, com espaçamento desligado para criar (o teste é sobre a retomada)
  definirAjuste(db, "publicacao.espacamento_minutos", "0");
  const b = cenarioPublicacao(db, 2);
  const d = cenarioPublicacao(db, 3);
  definirAjuste(db, "publicacao.espacamento_minutos", "60");
  pausarTudo(db, "Maria", undefined, AGORA);
  const depois = new Date(AGORA.getTime() + 3_600_000);
  const r = retomarTudo(db, "Maria", depois);
  const horarios = [a, b, d].map((x) => Date.parse(obterPublicacao(db, x.pub.id)!.agendadaPara)).sort((x, y) => x - y);
  assert.ok(horarios[1]! - horarios[0]! >= 3_600_000 && horarios[2]! - horarios[1]! >= 3_600_000, "uma hora entre cada");
  assert.ok(r.reagendadas.length >= 2);
  assert.ok(horarios[0]! >= depois.getTime() - 1);
});

test("a idempotência por (vídeo, rede) continua valendo", () => {
  const db = banco();
  const c = cenarioPublicacao(db, 1);
  assert.throws(
    () => db.prepare("INSERT INTO publicacao (video_id, rede, estado, agendada_para, chave_idempotencia, criado_em, atualizado_em) VALUES (?, 'instagram', 'agendada', ?, 'outra', ?, ?)")
      .run(c.videoId, AGORA.toISOString(), AGORA.toISOString(), AGORA.toISOString()),
    /UNIQUE/,
  );
});
