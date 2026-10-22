// P5 (redes como conector) e P6 (conferência de preço ligada no publicador).
// Servidor real em 127.0.0.1, banco temporário, fonte do site falsa. Nada toca rede.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  aprovarVideo, criarVideoComJob, definirExigirConferencia, exigirConferencia, marcarJobConcluido, marcarJobEmExecucao,
  migrar, obterPublicacao, REDES, type CaracteristicasMidia,
} from "@gerador/core";
import { ErroConfiguracaoProvedor } from "@gerador/escritor";
import type { FonteSite } from "@gerador/leitor";
import { CONECTORES, problemaDoConector } from "./conectores/index.js";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 69900, moeda: "BRL" };
const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
let mp4: string;
let agora = new Date("2026-10-21T15:00:00.000Z");
let precoNoSite = 69900;
let leituras = 0;
let siteFalha = false;

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const fonteFalsa: FonteSite = {
  async listar() { return []; },
  async detalhe() {
    leituras++;
    if (siteFalha) throw new Error("ECONNREFUSED");
    return { ...FICHA, preco: precoNoSite, fotos: [] };
  },
  async baixarFotos() { return { baixadas: [], descartadas: [] }; },
};

const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => { throw new ErroConfiguracaoProvedor("ANTHROPIC_API_KEY não está definida."); },
  executarRodada: async () => { throw new Error("não usado"); },
  relerProduto: async () => { throw new Error("não usado"); },
  agora: () => agora,
  lerMidia: async () => BOA,
  envPublicacao: {},
  fonteConferencia: async () => ({ fonte: fonteFalsa, fechar: async () => undefined }),
} as Dependencias;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-conf-"));
  mp4 = join(pasta, "video.mp4");
  writeFileSync(mp4, "x");
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
  agora = new Date("2026-10-21T15:00:00.000Z");
  precoNoSite = 69900;
  leituras = 0;
  siteFalha = false;
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://loja.exemplo/carro/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, 'http://x/f', 1024, 768, '/tmp/f.jpg', 0)").run();
  db.close();
});

async function api(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: "painel-idioma=pt-BR" } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(base + caminho, init);
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
async function pagina(caminho: string): Promise<string> {
  const r = await fetch(base + caminho, { headers: { cookie: "painel-idioma=pt-BR" } });
  assert.equal(r.status, 200, caminho);
  return r.text();
}
/** Vídeo aprovado COM o dado do render guardado (snapshot), como o motor faz. `semSnapshot` imita vídeo antigo. */
function videoAprovado(semSnapshot = false): number {
  const db = abrir();
  const { video: v, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla 2020", corpo: "Texto", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobEmExecucao(db, job.id, v.id);
  if (semSnapshot) db.prepare("UPDATE video SET dados_snapshot_json = NULL WHERE id = ?").run(v.id);
  marcarJobConcluido(db, job.id, v.id, mp4);
  aprovarVideo(db, v.id);
  db.close();
  return v.id;
}
const ligarConferencia = (liga = true) => { const db = abrir(); definirExigirConferencia(db, liga); db.close(); };
const publicacao = (id: number) => { const db = abrir(); try { return obterPublicacao(db, id)!; } finally { db.close(); } };
async function seco(...redes: string[]) {
  for (const r of redes) assert.equal((await api("POST", `/api/contas/${r}/conectar`, { modo: "seco" })).status, 200, r);
}

// ====================================================================== P6

test("P6: preço igual, a conferência libera e a publicação sai", async () => {
  ligarConferencia();
  const v = videoAprovado();
  await seco("instagram");
  const r = await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" });
  assert.equal(r.json.resultado, "publicada");
  assert.equal(leituras, 1, "o site foi relido uma vez, antes de publicar");
});

test("P6: preço mudou no site, a publicação é BARRADA (não falha), a tela mostra de X para Y e os dois botões", async () => {
  ligarConferencia();
  const v = videoAprovado();
  await seco("instagram");
  precoNoSite = 66900;
  const r = await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" });
  assert.equal(r.status, 200);
  assert.equal(r.json.resultado, "barrada");
  assert.equal(r.json.estado, "mudou");
  assert.match(r.json.motivo, /Preço: de R\$ 69\.900 para R\$ 66\.900/);
  const pubId = r.json.publicacao.id as number;
  const p = publicacao(pubId);
  assert.equal(p.estado, "agendada", "continua agendada: não virou 'falhou'");
  assert.equal(p.tentativas, 0, "não gastou tentativa");
  assert.equal(p.erro, null, "sem erro gravado");
  assert.equal(p.conferencia?.estado, "mudou");

  for (const tela of ["/publicacoes", "/calendario?data=2026-10-21"]) {
    const html = await pagina(tela);
    assert.match(html, /Preço: de R\$ 69\.900 para R\$ 66\.900/, tela);
    assert.match(html, /data-conferencia="mudou"/, tela);
    assert.match(html, new RegExp(`data-acao="conferir-de-novo" data-pub="${pubId}"`), `${tela}: tentar de novo`);
    assert.match(html, new RegExp(`data-acao="desmarcar" data-pub="${pubId}"`), `${tela}: desmarcar`);
  }
  // o worker não republica nem relê o site de novo: a decisão é da pessoa
  const antes = leituras;
  await api("POST", "/api/publicacoes/processar");
  assert.equal(leituras, antes);
  assert.equal(publicacao(pubId).estado, "agendada");
});

test("P6: 'tentar de novo' limpa o resultado e adia; com o preço de volta a publicação sai", async () => {
  ligarConferencia();
  const v = videoAprovado();
  await seco("instagram");
  precoNoSite = 66900;
  const pubId = (await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" })).json.publicacao.id as number;
  const t = await api("POST", `/api/calendario/${pubId}/conferir-de-novo`, { esperaMin: 15 });
  assert.equal(t.status, 200);
  const p = publicacao(pubId);
  assert.equal(p.conferencia, null);
  assert.equal(p.proximaTentativaEm, new Date(agora.getTime() + 15 * 60_000).toISOString());
  assert.doesNotMatch(await pagina("/publicacoes"), /data-conferencia=/);
  // passou o tempo e o preço voltou
  precoNoSite = 69900;
  agora = new Date(agora.getTime() + 16 * 60_000);
  const r = await api("POST", "/api/publicacoes/processar");
  assert.deepEqual(r.json.resultados.map((x: any) => x.resultado), ["publicada"]);
  assert.equal(publicacao(pubId).estado, "publicada");
});

test("P6: espera inválida é recusada; desmarcar tira a publicação do calendário", async () => {
  ligarConferencia();
  const v = videoAprovado();
  await seco("instagram");
  precoNoSite = 1;
  const pubId = (await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" })).json.publicacao.id as number;
  assert.equal((await api("POST", `/api/calendario/${pubId}/conferir-de-novo`, { esperaMin: -5 })).status, 400);
  assert.equal((await api("POST", `/api/calendario/${pubId}/conferir-de-novo`, {})).status, 400);
  assert.equal((await api("POST", `/api/calendario/${pubId}/desmarcar`)).status, 200);
  assert.equal(publicacao(pubId).estado, "cancelada");
});

test("P6: site fora do ar vira 'não consegui conferir', sem erro permanente e sem tentativa gasta", async () => {
  ligarConferencia();
  const v = videoAprovado();
  await seco("instagram");
  siteFalha = true;
  const r = await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" });
  assert.equal(r.json.resultado, "barrada");
  assert.equal(r.json.estado, "nao_conferiu");
  const p = publicacao(r.json.publicacao.id);
  assert.equal(p.estado, "agendada");
  assert.equal(p.tentativas, 0);
  assert.equal(p.erro, null);
  assert.match(await pagina("/publicacoes"), /data-conferencia="nao_conferiu"/);
});

test("P6: vídeo antigo, sem o dado que usou, pede para refazer o vídeo (sem erro técnico e sem 'tentar de novo')", async () => {
  ligarConferencia();
  const v = videoAprovado(true);
  await seco("instagram");
  const r = await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" });
  assert.equal(r.json.resultado, "barrada");
  const html = await pagina("/publicacoes");
  assert.match(html, /Refaça o vídeo para poder conferir o preço/);
  assert.match(html, /data-conferencia-codigo="sem_referencia"/);
  assert.doesNotMatch(html, /data-acao="conferir-de-novo"/, "tentar de novo não resolve: o vídeo precisa ser refeito");
  assert.match(html, /href="\/fila"/);
  const en = await (await fetch(base + "/publicacoes", { headers: { cookie: "painel-idioma=en" } })).text();
  assert.match(en, /Make the video again so the price can be checked/);
});

test("P6: com a chave desligada o site não é relido", async () => {
  ligarConferencia(false);
  const v = videoAprovado();
  await seco("instagram");
  precoNoSite = 1;
  const r = await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" });
  assert.equal(r.json.resultado, "publicada");
  assert.equal(leituras, 0);
});

test("P6: Configurações tem a chave de exigir e a validade, e as duas salvam", async () => {
  const html = await pagina("/configuracoes");
  assert.match(html, /data-acao="conferencia-exigir"/);
  assert.match(html, /id="aj-conf-validade"[^>]*value="30"/);
  assert.equal((await api("POST", "/api/conferencia", { exigir: true, validadeMin: 45 })).status, 200);
  const db = abrir();
  assert.equal(exigirConferencia(db), true);
  db.close();
  const depois = await pagina("/configuracoes");
  assert.match(depois, /aria-checked="true"[^>]*data-acao="conferencia-exigir"/);
  assert.match(depois, /id="aj-conf-validade"[^>]*value="45"/);
  assert.equal((await api("POST", "/api/conferencia", { validadeMin: -1 })).status, 400);
  assert.equal((await api("POST", "/api/conferencia", { validadeMin: 1.5 })).status, 400);
  assert.equal((await api("POST", "/api/conferencia", { exigir: "sim" })).status, 400);
});

// ====================================================================== P5

test("P5: o registro traz as três redes do núcleo na ordem, todas válidas", () => {
  const nucleo = CONECTORES.filter((c) => c.fila).map((c) => c.id);
  assert.deepEqual(nucleo, [...REDES]);
  for (const c of CONECTORES) assert.equal(problemaDoConector(c), null, c.id);
});

test("P5: conector malformado é recusado com o motivo", () => {
  assert.match(problemaDoConector({}) ?? "", /id inválido/);
  assert.match(problemaDoConector(null) ?? "", /não exporta/);
  const base = CONECTORES[0]!;
  assert.match(problemaDoConector({ ...base, id: "Rede Nova" }) ?? "", /id inválido/);
  assert.match(problemaDoConector({ ...base, id: "rede_nova", fila: true }) ?? "", /fila=true exige/);
  assert.equal(problemaDoConector({ ...base, id: "rede_nova", fila: false }), null);
});

test("P5: Contas e Prontidão se montam do registro: um bloco por conector, sem nome de rede escrito na tela", async () => {
  const contas = await pagina("/contas");
  const pront = await pagina("/prontidao");
  for (const c of CONECTORES) {
    assert.match(contas, new RegExp(`id="conta-${c.id}"`), `Contas: ${c.id}`);
    assert.match(contas, new RegExp(`data-acao="conector-ativo" data-conector="${c.id}"`), `chave de ${c.id}`);
  }
  for (const c of CONECTORES.filter((x) => x.ativoPadrao)) {
    assert.match(pront, new RegExp(`id="prontidao-${c.id}"`), `Prontidão: ${c.id}`);
    assert.match(pront, /data-resumo/, "uma linha de 'o que falta e o prazo' por rede");
  }
  // o prazo real de cada rede do núcleo
  assert.match(pront, /Sem a auditoria do TikTok NÃO publica em público/);
  assert.match(pront, /Entra rápido se o app for do cliente e publicar só nas contas dele/);
  assert.match(pront, /Exige App Review da Meta \(Advanced Access\): cerca de 20 dias, e reprovação reinicia o relógio/);
});

test("P5: desligar uma rede a tira de agendar, da grade, do calendário e da prontidão; ligar devolve", async () => {
  const v = videoAprovado();
  await seco("instagram", "facebook");
  const opcao = (html: string, rede: string) => new RegExp(`name="rede" value="${rede}"`).test(html);
  const antes = { cal: await pagina("/calendario"), grade: await pagina("/grade") };
  assert.ok(opcao(antes.cal, "instagram") && opcao(antes.grade, "instagram"));

  assert.equal((await api("POST", "/api/conectores/instagram/ativo", { ativo: false })).status, 200);
  const cal = await pagina("/calendario");
  const grade = await pagina("/grade");
  const pub = await pagina("/publicacoes");
  const pront = await pagina("/prontidao");
  assert.ok(!opcao(cal, "instagram") && opcao(cal, "facebook"), "calendário");
  assert.ok(!opcao(grade, "instagram") && opcao(grade, "facebook"), "grade");
  assert.doesNotMatch(pub, /data-rede="instagram"/, "publicações");
  assert.doesNotMatch(pront, /id="prontidao-instagram"/, "prontidão");
  assert.match(pront, /Desligadas: [^<]*Instagram/);
  assert.match(await pagina("/contas"), /data-rede="instagram" data-ativo="false"/);

  const recusa = await api("POST", "/api/calendario/agendar", { videoId: v, rede: "instagram", quando: "2026-10-22T17:00:00Z" });
  assert.equal(recusa.status, 409);
  assert.equal(recusa.json.codigo, "rede_desligada");
  assert.equal((await api("POST", `/api/videos/${v}/publicar`, { rede: "instagram" })).status, 409);
  assert.equal((await api("POST", "/api/calendario/agendar", { videoId: v, rede: "facebook", quando: "2026-10-22T17:00:00Z" })).status, 201);

  assert.equal((await api("POST", "/api/conectores/instagram/ativo", { ativo: true })).status, 200);
  assert.ok(opcao(await pagina("/calendario"), "instagram"));
  assert.ok(opcao(await pagina("/grade"), "instagram"));
  assert.match(await pagina("/prontidao"), /id="prontidao-instagram"/);
});

test("P5: publicação já marcada numa rede desligada espera; não falha e não sai", async () => {
  const v = videoAprovado();
  await seco("tiktok");
  assert.equal((await api("POST", "/api/calendario/agendar", { videoId: v, rede: "tiktok", quando: "2026-10-21T16:00:00Z", visibilidade: "privada" })).status, 201);
  await api("POST", "/api/conectores/tiktok/ativo", { ativo: false });
  agora = new Date("2026-10-21T17:00:00.000Z");
  const r = await api("POST", "/api/publicacoes/processar");
  assert.deepEqual(r.json.resultados, []);
  const db = abrir();
  const p = db.prepare("SELECT estado, tentativas, erro FROM publicacao").get() as { estado: string; tentativas: number; erro: string | null };
  db.close();
  assert.deepEqual(p, { estado: "agendada", tentativas: 0, erro: null });
  assert.match(await pagina("/contas"), /1 publicações marcadas esperam até você ligar de novo/);
});

test("P5: ativar/desativar recusa valor torto e conector inexistente", async () => {
  assert.equal((await api("POST", "/api/conectores/instagram/ativo", { ativo: "sim" })).status, 400);
  assert.equal((await api("POST", "/api/conectores/naoexiste/ativo", { ativo: true })).status, 404);
  assert.equal((await api("POST", "/api/contas/naoexiste/conectar", { modo: "seco" })).status, 404);
});

test("P5: conector que o núcleo ainda não conhece aparece, liga, conecta em modo seco e nunca entra nas listas de agendar", async () => {
  const novos = CONECTORES.filter((c) => !c.fila);
  assert.ok(novos.length > 0, "há ao menos um conector de exemplo instalado");
  for (const c of novos) {
    const contas = await pagina("/contas");
    assert.match(contas, new RegExp(`id="conta-${c.id}"`));
    const ligado = c.ativoPadrao;
    assert.equal((await api("POST", `/api/conectores/${c.id}/ativo`, { ativo: true })).status, 200);
    assert.match(await pagina("/prontidao"), new RegExp(`id="prontidao-${c.id}"`));
    const sec = await api("POST", `/api/contas/${c.id}/conectar`, { modo: "seco", contaNome: "Conta de teste" });
    assert.equal(sec.status, 200);
    assert.equal(sec.json.conta.conectada, true);
    const depois = await pagina("/contas");
    assert.match(depois, /Conta de teste/);
    assert.match(await pagina("/prontidao"), /Conectar a conta|Conta conectada/);
    assert.doesNotMatch(await pagina("/calendario"), new RegExp(`name="rede" value="${c.id}"`));
    assert.equal((await api("POST", "/api/calendario/agendar", { videoId: 1, rede: c.id, quando: "2026-10-22T17:00:00Z" })).status, 400);
    assert.equal((await api("POST", `/api/contas/${c.id}/renovar`)).status, 409);
    assert.equal((await api("POST", `/api/contas/${c.id}/desconectar`)).json.conta.conectada, false);
    assert.equal((await api("POST", `/api/conectores/${c.id}/ativo`, { ativo: ligado })).status, 200);
  }
});

test("P5: um arquivo novo na pasta de conectores basta; nenhum outro arquivo muda", () => {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const arquivo = join(aqui, "conectores", "redes", "zz-temporario.ts");
  const codigo = `
    import { CONECTORES, FALHAS_DE_CARGA } from ${JSON.stringify(join(aqui, "conectores", "index.ts"))};
    console.log(JSON.stringify({ ids: CONECTORES.map((c) => c.id), falhas: FALHAS_DE_CARGA.map((f) => f.arquivo) }));
  `;
  const rodar = (): { ids: string[]; falhas: string[] } =>
    JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", codigo], { cwd: join(aqui, ".."), encoding: "utf8" }).trim().split("\n").pop()!);
  try {
    assert.ok(!rodar().ids.includes("rede_temporaria"));
    writeFileSync(arquivo, `export default {
      id: "rede_temporaria", nome: "Rede Temporária", ativoPadrao: false, fila: false, modos: ["seco"], campos: [], escopos: [],
      precisaUrlPublica: false, aprovacao: { rotulo: "Aprovação", item: "Aprovada", falta: "Peça", resumo: "Rápido", prazo: "Um dia" },
      limites: {}, midia: ["Qualquer vídeo"],
    };\n`);
    assert.ok(rodar().ids.includes("rede_temporaria"), "o arquivo novo entrou sozinho");
    writeFileSync(arquivo, "export default { id: 1 };\n");
    const ruim = rodar();
    assert.ok(!ruim.ids.includes("rede_temporaria") && ruim.falhas.includes("zz-temporario.ts"), "conector torto fica de fora, com o motivo");
  } finally {
    rmSync(arquivo, { force: true });
  }
  assert.ok(!rodar().ids.includes("rede_temporaria"));
});

test("P6: a conferência liga uma vez ao subir o painel; quem desligar depois não é contrariado", async () => {
  const { ligarConferenciaNaPrimeiraVez } = await import("./publicacao/conferencia-inicial.js");
  const db = abrir();
  assert.equal(exigirConferencia(db), false, "nasce desligada no núcleo");
  assert.equal(ligarConferenciaNaPrimeiraVez(db), true);
  assert.equal(exigirConferencia(db), true);
  definirExigirConferencia(db, false);
  assert.equal(ligarConferenciaNaPrimeiraVez(db), false, "não liga de novo");
  assert.equal(exigirConferencia(db), false);
  db.close();
});
