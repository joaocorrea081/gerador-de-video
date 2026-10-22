// Motor de publicação (Etapa 6, parte A): HTTP real em 127.0.0.1, provedor de rede
// falso/injetado, banco temporário. Nada toca rede de verdade.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  aprovarVideo, criarVideoComJob, lerCaracteristicas, lerSegredosConta, marcarJobConcluido, migrar, RAIZ_PROJETO,
  validarMidiaParaRede, type CaracteristicasMidia, type Rede,
} from "@gerador/core";
import type { Provedor } from "@gerador/escritor";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";
import { ErroRede, FacebookReal, InstagramReal, TikTokReal, type PedidoPublicacao, type ProvedorRede } from "./publicacao/provedores.js";
import { comporLegenda, ErroLegenda } from "./publicacao/legendas.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };
const SENTINELA = "SENTINELA-TOKEN-NAO-PODE-VAZAR-9X";
const SENTINELA_REFRESH = "SENTINELA-REFRESH-NAO-PODE-VAZAR-7Q";

const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
let agora = new Date("2026-10-21T15:00:00.000Z");
let midia: CaracteristicasMidia = BOA;
let fabrica: Dependencias["fabricaRede"];
let provedorIa: Provedor | undefined;
let mp4: string;

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => {
    if (!provedorIa) throw Object.assign(new (require_erroConfig())("ANTHROPIC_API_KEY não está definida."), {});
    return provedorIa;
  },
  executarRodada: async () => { throw new Error("não usado"); },
  relerProduto: async () => { throw new Error("não usado"); },
  agora: () => agora,
  lerMidia: async () => midia,
  envPublicacao: {},
  get fabricaRede() { return fabrica; },
} as Dependencias;

// import dinâmico simples da classe de erro (evita ciclo de import no topo)
import { ErroConfiguracaoProvedor } from "@gerador/escritor";
function require_erroConfig() { return ErroConfiguracaoProvedor; }

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-pub-"));
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

let respostas: string[] = [];
beforeEach(() => {
  caminhoBanco = join(pasta, `t-${Math.random().toString(36).slice(2)}.db`);
  agora = new Date("2026-10-21T15:00:00.000Z");
  midia = BOA;
  fabrica = undefined;
  provedorIa = undefined;
  respostas = [];
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, 'http://x/f', 1024, 768, '/tmp/f.jpg', 0)").run();
  db.close();
});

async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: any; texto: string }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: "painel-idioma=pt-BR" } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(base + caminho, init);
  const texto = await r.text();
  respostas.push(texto);
  return { status: r.status, json: texto ? JSON.parse(texto) : undefined, texto };
}

function videoAprovado(aprovar = true): number {
  const db = abrir();
  const { video, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla", corpo: "x", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, video.id, mp4);
  if (aprovar) aprovarVideo(db, video.id);
  db.close();
  return video.id;
}
async function conectarSeco(...redes: Rede[]) {
  for (const r of redes) assert.equal((await chamar("POST", `/api/contas/${r}/conectar`, { modo: "seco" })).status, 200);
}

// Direto no banco do teste: /api/ajustes usa o banco global, não o da dependência injetada.
function ajustar(chave: string, valor: string) {
  const db = abrir();
  db.prepare("INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(chave, valor);
  db.close();
}
function semEspacamento() {
  ajustar("publicacao.espacamento_minutos", "0");
}
function ler<T>(sql: string, ...p: unknown[]): T {
  const db = abrir();
  const r = db.prepare(sql).get(...p) as T;
  db.close();
  return r;
}
/** Provedor injetado que conta chamadas e devolve o que o teste mandar. */
function espiao(opcoes: { falhas?: ErroRede[]; limite?: { usado: number; total: number }; ao?: (p: PedidoPublicacao) => void } = {}) {
  const chamadas: PedidoPublicacao[] = [];
  const falhas = [...(opcoes.falhas ?? [])];
  let renovacoes = 0;
  fabrica = (rede): ProvedorRede => ({
    rede, simulado: false,
    consultarLimite: async () => opcoes.limite ?? null,
    renovarToken: async () => {
      renovacoes++;
      return { accessToken: "ACESSO-NOVO-" + renovacoes, refreshToken: "REFRESH-ROTACIONADO-" + renovacoes, expiraEm: new Date(agora.getTime() + 3_600_000 * 48).toISOString() };
    },
    publicar: async (p) => {
      chamadas.push(p);
      opcoes.ao?.(p);
      const f = falhas.shift();
      if (f) throw f;
      return { idExterno: "ext-" + chamadas.length, simulado: false };
    },
  });
  return { chamadas, renovacoes: () => renovacoes };
}
async function conectarReal(rede: Rede, extra: Record<string, unknown> = {}) {
  const r = await chamar("POST", `/api/contas/${rede}/conectar`, {
    modo: "real", contaId: "123", contaNome: "Revenda Teste", accessToken: SENTINELA, refreshToken: SENTINELA_REFRESH,
    expiraEm: new Date(agora.getTime() + 3_600_000 * 24 * 30).toISOString(), escopos: ["video.publish", "pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_business_basic", "instagram_business_content_publish"],
    ...extra,
  });
  assert.equal(r.status, 200, r.texto);
}

// ============================================================ validação por rede

test("validação: o MP4 real do projeto passa no Instagram e no Facebook (ffprobe de verdade)", async () => {
  const arq = join(RAIZ_PROJETO, "dados", "videos", "video-1.mp4");
  if (!existsSync(arq)) return;
  const c = await lerCaracteristicas(arq);
  assert.equal(c.largura, 1080);
  assert.equal(c.altura, 1920);
  assert.equal(c.codecVideo, "h264");
  assert.equal(c.moovNoInicio, true);
  assert.equal(validarMidiaParaRede("instagram", c).ok, true);
  assert.equal(validarMidiaParaRede("facebook", c).ok, true);
});

test("validação: MP4 horizontal e curto gerado com ffmpeg é barrado, com motivo em português", async (t) => {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { t.skip("sem ffmpeg"); return; }
  const ruim = join(pasta, "ruim.mp4");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc=s=640x360:r=30:d=2", "-pix_fmt", "yuv420p", "-c:v", "libx264", ruim]);
  const c = await lerCaracteristicas(ruim);
  const fb = validarMidiaParaRede("facebook", c);
  assert.equal(fb.ok, false);
  assert.ok(fb.bloqueios.some((b) => /9:16/.test(b.mensagem)));
  assert.ok(fb.bloqueios.some((b) => /540x960/.test(b.mensagem)));
  assert.ok(fb.bloqueios.some((b) => /3 a 90 segundos/.test(b.mensagem)));
  const ig = validarMidiaParaRede("instagram", c);
  assert.equal(ig.ok, false);
  assert.ok(ig.bloqueios.some((b) => /Duração/.test(b.mensagem)));
});

test("validação: matriz de limites do PUBLICACAO.md", () => {
  const ig = (o: Partial<CaracteristicasMidia>) => validarMidiaParaRede("instagram", { ...BOA, ...o });
  const fb = (o: Partial<CaracteristicasMidia>) => validarMidiaParaRede("facebook", { ...BOA, ...o });
  assert.equal(ig({ duracaoSegundos: 2.9 }).ok, false);
  assert.equal(ig({ duracaoSegundos: 900 }).ok, true);
  assert.equal(ig({ duracaoSegundos: 901 }).ok, false);
  assert.equal(ig({ tamanhoBytes: 300 * 1024 * 1024 + 1 }).ok, false);
  assert.equal(ig({ largura: 1921 }).ok, false);
  assert.equal(ig({ codecVideo: "vp9" }).ok, false);
  assert.equal(ig({ codecVideo: "hevc" }).ok, true);
  assert.equal(ig({ codecAudio: "mp3" }).ok, false);
  assert.equal(ig({ fps: 22 }).ok, false);
  assert.equal(ig({ fps: 61 }).ok, false);
  assert.equal(ig({ moovNoInicio: false }).ok, false);
  assert.equal(ig({ largura: 1080, altura: 1080 }).ok, true, "9:16 é só recomendação no Instagram");
  assert.ok(ig({ largura: 1080, altura: 1080 }).avisos.some((a) => a.codigo === "proporcao"));
  assert.equal(fb({ largura: 1080, altura: 1080 }).ok, false, "9:16 é obrigatório no Facebook");
  assert.equal(fb({ duracaoSegundos: 91 }).ok, false);
  assert.equal(fb({ duracaoSegundos: 90 }).ok, true);
  assert.equal(fb({ largura: 540, altura: 960 }).ok, true);
  assert.equal(fb({ largura: 450, altura: 800 }).ok, false);
  assert.equal(fb({ perfilAudio: "HE-AAC" }).ok, false);
});

test("validação: TikTok sem auditoria barra publicação pública; privada passa com aviso", () => {
  const pub = validarMidiaParaRede("tiktok", BOA, { auditoriaAprovada: false, visibilidade: "publica" });
  assert.equal(pub.ok, false);
  assert.match(pub.bloqueios[0]!.mensagem, /não permite publicação pública antes da auditoria/);
  assert.equal(validarMidiaParaRede("tiktok", BOA, { auditoriaAprovada: true, visibilidade: "publica" }).ok, true);
  const priv = validarMidiaParaRede("tiktok", BOA, { auditoriaAprovada: false, visibilidade: "privada" });
  assert.equal(priv.ok, true);
  assert.ok(priv.avisos.length > 0);
});

test("GET validacao: 3 redes de uma vez, e vídeo ruim barrado no agendamento (422)", async () => {
  const id = videoAprovado();
  await conectarSeco("facebook");
  const r = await chamar("GET", `/api/videos/${id}/validacao`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.redes.map((x: any) => [x.rede, x.ok]), [["instagram", true], ["facebook", true], ["tiktok", false]]);
  midia = { ...BOA, largura: 1280, altura: 720 };
  const ag = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "facebook", quando: "2026-10-22T12:00:00Z" });
  assert.equal(ag.status, 422);
  assert.equal(ag.json.codigo, "midia_invalida");
  assert.match(ag.json.erro, /9:16/);
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM publicacao").n, 0);
});

// ================================================================== calendário

test("calendário: vídeo NÃO aprovado é recusado com motivo", async () => {
  const id = videoAprovado(false);
  await conectarSeco("instagram");
  const r = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T12:00:00Z" });
  assert.equal(r.status, 409);
  assert.equal(r.json.codigo, "video_nao_aprovado");
  assert.match(r.json.erro, /Só vídeo aprovado/);
  const p = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(p.status, 409, "publicar direto também exige aprovação");
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM publicacao").n, 0);
});

test("calendário: agendar, listar por período (ISO UTC), desmarcar e remarcar", async () => {
  const id = videoAprovado();
  await conectarSeco("instagram");
  const ag = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T15:00:00-03:00" });
  assert.equal(ag.status, 201);
  assert.equal(ag.json.publicacao.agendadaPara, "2026-10-22T18:00:00.000Z", "banco guarda UTC");
  const lista = await chamar("GET", "/api/calendario?de=2026-10-22T00:00:00Z&ate=2026-10-23T00:00:00Z");
  assert.equal(lista.json.itens.length, 1);
  assert.equal((await chamar("GET", "/api/calendario?de=2026-11-01T00:00:00Z&ate=2026-11-02T00:00:00Z")).json.itens.length, 0);
  const pid = ag.json.publicacao.id;
  const des = await chamar("POST", `/api/calendario/${pid}/desmarcar`);
  assert.equal(des.json.publicacao.estado, "cancelada");
  const rem = await chamar("POST", `/api/calendario/${pid}/remarcar`, { quando: "2026-10-25T13:00:00Z" });
  assert.equal(rem.json.publicacao.estado, "agendada");
  assert.equal(rem.json.publicacao.agendadaPara, "2026-10-25T13:00:00.000Z");
  assert.equal((await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-26T13:00:00Z" })).status, 409, "mesmo vídeo+rede não duplica");
  assert.equal((await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2020-01-01T00:00:00Z" })).status, 400);
});

test("calendário: horário no passado e rede não conectada são recusados", async () => {
  const id = videoAprovado();
  const sem = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T12:00:00Z" });
  assert.equal(sem.status, 409);
  assert.equal(sem.json.codigo, "nao_conectada");
  await conectarSeco("instagram");
  const pas = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-01T12:00:00Z" });
  assert.equal(pas.status, 400);
  assert.equal(pas.json.codigo, "no_passado");
});

test("espaçamento mínimo: agendamento colado é RECUSADO e a resposta traz o próximo horário livre", async () => {
  const a = videoAprovado();
  const b = videoAprovado();
  await conectarSeco("tiktok", "instagram");
  ajustar("publicacao.espacamento_minutos", "120");
  await chamar("POST", "/api/contas/tiktok/aprovacao", { aprovada: true });
  const ok = await chamar("POST", "/api/calendario/agendar", { videoId: a, rede: "tiktok", quando: "2026-10-22T12:00:00Z", visibilidade: "publica" });
  assert.equal(ok.status, 201);
  const colado = await chamar("POST", "/api/calendario/agendar", { videoId: b, rede: "tiktok", quando: "2026-10-22T13:59:00Z", visibilidade: "publica" });
  assert.equal(colado.status, 409);
  assert.equal(colado.json.codigo, "espacamento");
  assert.equal(colado.json.proximoHorarioLivre, "2026-10-22T14:00:00.000Z");
  const antes = await chamar("POST", "/api/calendario/agendar", { videoId: b, rede: "tiktok", quando: "2026-10-22T10:30:00Z", visibilidade: "publica" });
  assert.equal(antes.status, 409, "também vale para antes");
  assert.equal((await chamar("POST", "/api/calendario/agendar", { videoId: b, rede: "tiktok", quando: "2026-10-22T14:00:00Z", visibilidade: "publica" })).status, 201);
  // outra rede não é afetada
  assert.equal((await chamar("POST", "/api/calendario/agendar", { videoId: b, rede: "instagram", quando: "2026-10-22T12:30:00Z" })).status, 201);
});

test("TikTok: sem auditoria não agenda público; visibilidade é escolha obrigatória", async () => {
  const id = videoAprovado();
  await conectarSeco("tiktok");
  const semEscolha = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "tiktok", quando: "2026-10-22T12:00:00Z" });
  assert.equal(semEscolha.status, 400);
  assert.equal(semEscolha.json.codigo, "visibilidade_obrigatoria");
  const pub = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "tiktok", quando: "2026-10-22T12:00:00Z", visibilidade: "publica" });
  assert.equal(pub.status, 422);
  assert.match(pub.json.erro, /auditoria/);
  const priv = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "tiktok", quando: "2026-10-22T12:00:00Z", visibilidade: "privada" });
  assert.equal(priv.status, 201);
});

// ================================================================ modo seco / fila

test("sem credencial: publicar é recusado com motivo e nada é fingido", async () => {
  const id = videoAprovado();
  const r = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(r.status, 409);
  assert.equal(r.json.codigo, "nao_conectada");
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM publicacao").n, 0);
});

test("modo seco: publica, marca simulado, e o vídeo NÃO vira 'publicado' de verdade", async () => {
  const id = videoAprovado();
  await conectarSeco("instagram");
  const r = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(r.status, 200);
  assert.equal(r.json.resultado, "publicada");
  assert.equal(r.json.simulado, true);
  assert.match(r.json.publicacao.idExterno, /^seco-/);
  assert.equal(ler<{ estado: string }>("SELECT estado FROM video WHERE id = ?", id).estado, "aprovado");
});

test("idempotência: publicar duas vezes e em paralelo chama a rede UMA vez", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  const esp = espiao();
  const [a, b] = await Promise.all([
    chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" }),
    chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" }),
  ]);
  const c = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(esp.chamadas.length, 1, "a rede foi chamada uma vez só");
  assert.ok([a, b].some((x) => x.json.resultado === "publicada"));
  assert.equal(c.json.resultado, "ja_publicada");
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM publicacao").n, 1);
  assert.equal(ler<{ estado: string }>("SELECT estado FROM video WHERE id = ?", id).estado, "publicado", "real marca publicado");
  // processar a fila também não republica
  await chamar("POST", "/api/publicacoes/processar");
  assert.equal(esp.chamadas.length, 1);
});

test("idempotência após queda: 'publicando' órfão vira 'verificar' e NÃO republica sozinho", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  const esp = espiao();
  const ag = await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-21T15:00:00Z" });
  const db = abrir();
  db.prepare("UPDATE publicacao SET estado = 'publicando' WHERE id = ?").run(ag.json.publicacao.id); // processo caiu aqui
  db.close();
  const { recuperarPublicacoesOrfas } = await import("@gerador/core");
  const dbr = abrir();
  assert.equal(recuperarPublicacoesOrfas(dbr, agora), 1);
  dbr.close();
  assert.equal(ler<{ estado: string }>("SELECT estado FROM publicacao").estado, "verificar");
  await chamar("POST", "/api/publicacoes/processar");
  assert.equal(esp.chamadas.length, 0);
  assert.match(ler<{ erro: string }>("SELECT erro FROM publicacao").erro, /Confira na rede/);
});

test("estado por rede é independente: publicado no Instagram, falhado no Facebook", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  await conectarReal("facebook");
  fabrica = (rede) => ({
    rede, simulado: false, consultarLimite: async () => null, renovarToken: async () => { throw new Error("x"); },
    publicar: async () => {
      if (rede === "facebook") throw new ErroRede("Facebook: pedido recusado (HTTP 400).", "recusado", false);
      return { idExterno: "ig-1", simulado: false };
    },
  });
  await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  await chamar("POST", `/api/videos/${id}/publicar`, { rede: "facebook" });
  const l = await chamar("GET", `/api/videos/${id}/publicacoes`);
  assert.deepEqual(l.json.publicacoes.map((p: any) => [p.rede, p.estado]), [["facebook", "falhou"], ["instagram", "publicada"]]);
});

test("nova tentativa com espera crescente (5, 10, 20, 40...) e teto de 10 tentativas, erro legível", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  const esp = espiao({ falhas: Array.from({ length: 20 }, () => new ErroRede("Instagram: serviço temporariamente indisponível (HTTP 503).", "temporario", true)) });
  await chamar("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: agora.toISOString() });
  const esperas: number[] = [];
  for (let i = 0; i < 12; i++) {
    const antes = esp.chamadas.length;
    await chamar("POST", "/api/publicacoes/processar");
    const p = ler<{ estado: string; tentativas: number; proxima_tentativa_em: string | null; erro: string }>("SELECT * FROM publicacao");
    if (p.estado === "falhou") break;
    if (esp.chamadas.length === antes) break;
    esperas.push((Date.parse(p.proxima_tentativa_em!) - agora.getTime()) / 60_000);
    // antes de vencer a espera, nada é chamado
    const n = esp.chamadas.length;
    await chamar("POST", "/api/publicacoes/processar");
    assert.equal(esp.chamadas.length, n, "não tenta antes da hora");
    agora = new Date(Date.parse(p.proxima_tentativa_em!));
  }
  assert.deepEqual(esperas, [5, 10, 20, 40, 80, 160, 240, 240, 240]);
  const fim = ler<{ estado: string; tentativas: number; erro: string }>("SELECT * FROM publicacao");
  assert.equal(fim.estado, "falhou");
  assert.equal(fim.tentativas, 10);
  assert.match(fim.erro, /temporariamente indisponível.*desisti após 10 tentativas/);
  assert.equal(esp.chamadas.length, 10);
});

test("falha permanente não repete; falha temporária que se resolve publica", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  const esp = espiao({ falhas: [new ErroRede("Instagram: serviço temporariamente indisponível (HTTP 503).", "temporario", true)] });
  const r1 = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(r1.status, 202);
  assert.equal(r1.json.resultado, "tentara_de_novo");
  agora = new Date(agora.getTime() + 5 * 60_000);
  const r2 = await chamar("POST", "/api/publicacoes/processar");
  assert.equal(r2.json.resultados[0].resultado, "publicada");
  assert.equal(esp.chamadas.length, 2);
  const id2 = videoAprovado();
  semEspacamento();
  fabrica = (rede) => ({ rede, simulado: false, consultarLimite: async () => null, renovarToken: async () => { throw new Error("x"); }, publicar: async () => { throw new ErroRede("token recusado", "autenticacao", false); } });
  const r3 = await chamar("POST", `/api/videos/${id2}/publicar`, { rede: "instagram" });
  assert.equal(r3.json.resultado, "falhou");
  assert.equal(ler<{ tentativas: number }>("SELECT tentativas FROM publicacao WHERE video_id = ?", id2).tentativas, 1);
});

test("limite diário do Facebook (30 em 24h) barra a 31ª e libera depois da janela", async () => {
  await conectarSeco("facebook");
  semEspacamento();
  const ids = Array.from({ length: 31 }, () => videoAprovado());
  for (let i = 0; i < 30; i++) {
    const r = await chamar("POST", `/api/videos/${ids[i]}/publicar`, { rede: "facebook" });
    assert.equal(r.json.resultado, "publicada", `publicação ${i + 1}`);
  }
  const barrada = await chamar("POST", `/api/videos/${ids[30]}/publicar`, { rede: "facebook" });
  assert.equal(barrada.status, 429);
  assert.equal(barrada.json.codigo, "limite_diario");
  assert.match(barrada.json.motivo, /Limite diário do Facebook atingido \(30 de 30/);
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM publicacao WHERE estado = 'publicada'").n, 30);
  assert.equal(ler<{ tentativas: number }>("SELECT tentativas FROM publicacao WHERE video_id = ?", ids[30]).tentativas, 0, "limite não gasta tentativa");
  agora = new Date(agora.getTime() + 25 * 3_600_000);
  const dep = await chamar("POST", "/api/publicacoes/processar");
  assert.equal(dep.json.resultados[0].resultado, "publicada");
});

test("limite diário do Instagram vem da consulta à API (content_publishing_limit), não de número fixo", async () => {
  const id = videoAprovado();
  await conectarReal("instagram");
  const esp = espiao({ limite: { usado: 100, total: 100 } });
  const r = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(r.status, 429);
  assert.equal(esp.chamadas.length, 0);
  // e em modo seco o falso usa o limite configurado
  const id2 = videoAprovado();
  await conectarSeco("facebook");
  await chamar("POST", "/api/contas/instagram/conectar", { modo: "seco" });
  ajustar("seco.ig_limite", "1");
  fabrica = undefined;
  semEspacamento();
  const db = abrir(); db.prepare("DELETE FROM publicacao").run(); db.close();
  assert.equal((await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" })).json.resultado, "publicada");
  assert.equal((await chamar("POST", `/api/videos/${id2}/publicar`, { rede: "instagram" })).status, 429);
});

test("falha simulada do modo seco (temporária) entra na espera crescente", async () => {
  const id = videoAprovado();
  await conectarSeco("facebook");
  ajustar("seco.falhar.facebook", "1");
  const r = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "facebook" });
  assert.equal(r.json.resultado, "tentara_de_novo");
  assert.match(r.json.motivo, /temporariamente indisponível \(simulado\)/);
});

// =============================================================== rótulo de IA

test("rótulo de IA: campo explícito por publicação e vai no pedido à rede (padrão: falso)", async () => {
  const a = videoAprovado();
  const b = videoAprovado();
  await conectarReal("instagram");
  semEspacamento();
  const esp = espiao();
  await chamar("POST", `/api/videos/${a}/publicar`, { rede: "instagram" });
  await chamar("POST", `/api/videos/${b}/publicar`, { rede: "instagram", iaGerado: true });
  assert.deepEqual(esp.chamadas.map((c) => c.iaGerado), [false, true]);
  assert.equal((await chamar("POST", "/api/calendario/agendar", { videoId: videoAprovado(), rede: "instagram", quando: "2026-10-30T12:00:00Z", iaGerado: "sim" })).status, 400);
});

test("provedores reais: Instagram container+publish, Facebook START/upload/FINISH, TikTok is_aigc e SELF_ONLY", async () => {
  const pedido = (o: Partial<PedidoPublicacao> = {}): PedidoPublicacao => ({
    chaveIdempotencia: "k", caminhoArquivo: "/x.mp4", urlMidia: "https://cdn.exemplo.com/v.mp4", legenda: "oi", iaGerado: true, visibilidade: "publica", ...o,
  });
  const chamadas: { url: string; corpo: string }[] = [];
  const f = (resp: (url: string) => unknown) => async (url: string, init?: RequestInit) => {
    chamadas.push({ url, corpo: String(init?.body ?? "") });
    return new Response(JSON.stringify(resp(url)), { status: 200 });
  };
  const ig = new InstagramReal({ contaId: "IG1", token: "tk" }, f((u) => (u.includes("fields=status_code") ? { status_code: "FINISHED" } : { id: "C1" })), 0);
  const r = await ig.publicar(pedido());
  assert.equal(r.simulado, false);
  assert.match(chamadas[0]!.url, /\/IG1\/media$/);
  assert.match(chamadas[0]!.corpo, /media_type=REELS/);
  assert.match(chamadas[0]!.corpo, /is_ai_generated=true/);
  assert.match(chamadas[1]!.url, /fields=status_code/);
  assert.match(chamadas[2]!.url, /\/IG1\/media_publish$/);
  assert.match(chamadas[2]!.corpo, /creation_id=C1/);

  chamadas.length = 0;
  const fb = new FacebookReal({ paginaId: "P1", token: "tk" }, f((u) => (u.includes("video_reels") ? { video_id: "V1", upload_url: "https://rupload.facebook.com/x" } : { success: true })));
  await fb.publicar(pedido());
  assert.equal(chamadas.length, 3);
  assert.match(chamadas[0]!.corpo, /"upload_phase":"start"/);
  assert.match(chamadas[1]!.url, /rupload/);
  assert.match(chamadas[2]!.corpo, /"upload_phase":"finish"/);
  assert.match(chamadas[2]!.corpo, /"video_state":"PUBLISHED"/);
  assert.match(chamadas[2]!.corpo, /"is_ai_generated":true/);

  chamadas.length = 0;
  const tt = new TikTokReal({ token: "tk", refreshToken: "rf", clientKey: "ck", clientSecret: "cs" }, f(() => ({ data: { publish_id: "PB1" }, error: { code: "ok" } })));
  await tt.publicar(pedido({ visibilidade: "privada" }));
  assert.match(chamadas[0]!.corpo, /"is_aigc":true/);
  assert.match(chamadas[0]!.corpo, /"privacy_level":"SELF_ONLY"/);
  assert.match(chamadas[0]!.corpo, /"source":"PULL_FROM_URL"/);

  // sem URL pública: erro de configuração claro, sem tentar
  await assert.rejects(ig.publicar(pedido({ urlMidia: null })), /URL pública/);
  // erros: 503 é temporário, 190 é autenticação
  const quebrado = new InstagramReal({ contaId: "IG1", token: "tk" }, async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 }));
  await assert.rejects(quebrado.publicar(pedido()), (e: ErroRede) => e.codigo === "autenticacao" && !e.transitorio);
  const caiu = new InstagramReal({ contaId: "IG1", token: "tk" }, async () => new Response("{}", { status: 503 }));
  await assert.rejects(caiu.publicar(pedido()), (e: ErroRede) => e.codigo === "temporario" && e.transitorio);
});

// ================================================================== segredo/token

test("token que rotaciona: o refresh novo é GRAVADO e o antigo some", async () => {
  const id = videoAprovado();
  // expira em 1h -> renovação antes de publicar
  await conectarReal("tiktok", { expiraEm: new Date(agora.getTime() + 3_600_000).toISOString() });
  await chamar("POST", "/api/contas/tiktok/aprovacao", { aprovada: true });
  const esp = espiao();
  const r = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "tiktok", visibilidade: "publica" });
  assert.equal(r.json.resultado, "publicada", r.texto);
  assert.equal(esp.renovacoes(), 1);
  const db = abrir();
  const seg = lerSegredosConta(db, "tiktok");
  db.close();
  assert.equal(seg.refreshToken, "REFRESH-ROTACIONADO-1");
  assert.equal(seg.accessToken, "ACESSO-NOVO-1");
  const conta = (await chamar("GET", "/api/contas")).json.contas.find((c: any) => c.rede === "tiktok");
  assert.ok(Date.parse(conta.tokenExpiraEm) > agora.getTime() + 24 * 3_600_000, "validade nova gravada");
  // a rota manual também grava
  const man = await chamar("POST", "/api/contas/tiktok/renovar");
  assert.equal(man.json.rotacionouRefresh, true);
  const db2 = abrir();
  assert.equal(lerSegredosConta(db2, "tiktok").refreshToken, "REFRESH-ROTACIONADO-2");
  db2.close();
});

test("segredo NÃO vaza: nenhuma rota, nenhuma mensagem de erro, nenhum log", async () => {
  const logs: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => logs.push(a.join(" "));
  console.error = (...a) => logs.push(a.join(" "));
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    const id = videoAprovado();
    await conectarReal("instagram");
    // a rede devolve erro que ECOA o token (pior caso)
    fabrica = (rede) => ({
      rede, simulado: false, consultarLimite: async () => null, renovarToken: async () => { throw new Error("x"); },
      publicar: async () => { throw new Error(`falha com token ${SENTINELA} e refresh ${SENTINELA_REFRESH}`); },
    });
    const pub = await chamar("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
    assert.equal(pub.json.resultado, "falhou");
    // erro gravado no banco também sem segredo
    const gravado = ler<{ erro: string }>("SELECT erro FROM publicacao").erro;
    assert.ok(!gravado.includes(SENTINELA) && !gravado.includes(SENTINELA_REFRESH));
    assert.match(gravado, /\[segredo\]/);
    // varre TODAS as rotas de leitura
    for (const rota of ["/api/contas", "/api/prontidao", `/api/videos/${id}/publicacoes`, `/api/videos/${id}/validacao`,
      "/api/calendario?de=2026-01-01T00:00:00Z&ate=2027-01-01T00:00:00Z", `/api/videos/${id}/legendas`, "/api/ajustes", "/api/status", "/api/fila", "/api/historico"]) {
      await chamar("GET", rota);
    }
    await chamar("POST", "/api/contas/instagram/renovar"); // falha: fabrica lança sem segredo
    await chamar("POST", "/api/contas/instagram/conectar", { modo: "real", accessToken: "curto" }); // erro de validação
    const tudo = respostas.join("\n") + logs.join("\n");
    assert.ok(!tudo.includes(SENTINELA), "access token vazou");
    assert.ok(!tudo.includes(SENTINELA_REFRESH), "refresh token vazou");
    // o segredo está guardado (o teste não é vazio)
    const db = abrir();
    assert.equal(lerSegredosConta(db, "instagram").accessToken, SENTINELA);
    db.close();
    // erro inesperado no servidor também sai redigido
    fabrica = () => { throw new Error(`explodiu ${SENTINELA}`); };
    const boom = await chamar("POST", "/api/contas/instagram/renovar");
    assert.equal(boom.status, 500);
    assert.ok(!(boom.texto + logs.join("\n")).includes(SENTINELA));
  } finally {
    Object.assign(console, orig);
  }
});

test("desconectar apaga o segredo do banco", async () => {
  await conectarReal("facebook");
  await chamar("POST", "/api/contas/facebook/desconectar");
  const db = abrir();
  assert.equal(lerSegredosConta(db, "facebook").accessToken, null);
  db.close();
});

// ================================================================== prontidão

test("prontidão: lista item por item o que falta, e muda conforme o cliente avança", async () => {
  const antes = await chamar("GET", "/api/prontidao");
  const tik = antes.json.redes.find((r: any) => r.rede === "tiktok");
  assert.equal(tik.prontaParaPublicarDeVerdade, false);
  assert.equal(tik.prontaParaModoSeco, false);
  const faltas = tik.itens.filter((i: any) => !i.ok).map((i: any) => i.id);
  assert.deepEqual(faltas, ["conta_conectada", "credencial_real", "token_valido", "escopos", "aprovacao", "segredo_do_app", "midia_url_publica"]);
  assert.ok(tik.itens.every((i: any) => i.ok || i.falta));
  assert.equal(antes.json.legendaPorIa.ok, false);

  await conectarSeco("tiktok");
  const seco = (await chamar("GET", "/api/prontidao")).json.redes.find((r: any) => r.rede === "tiktok");
  assert.equal(seco.prontaParaModoSeco, true);
  assert.equal(seco.prontaParaPublicarDeVerdade, false, "modo seco nunca conta como pronto de verdade");
  assert.ok(seco.itens.find((i: any) => i.id === "credencial_real" && !i.ok));

  await conectarReal("tiktok");
  await chamar("POST", "/api/contas/tiktok/aprovacao", { aprovada: true });
  ajustar("publicacao.url_publica", "https://cdn.exemplo.com/videos");
  deps.envPublicacao = { TIKTOK_CLIENT_KEY: "a", TIKTOK_CLIENT_SECRET: "b" };
  const pronto = (await chamar("GET", "/api/prontidao")).json.redes.find((r: any) => r.rede === "tiktok");
  deps.envPublicacao = {};
  assert.equal(pronto.prontaParaPublicarDeVerdade, true, JSON.stringify(pronto.itens.filter((i: any) => !i.ok)));
  const ig = (await chamar("GET", "/api/prontidao")).json.redes.find((r: any) => r.rede === "instagram");
  assert.ok(ig.itens.some((i: any) => i.id === "aprovacao" && !i.ok));
  assert.deepEqual(ig.uso24h, { usado: 0, limite: null });
});

// ==================================================================== legendas

const respostaLegendas = (o: Record<string, unknown> = {}) =>
  JSON.stringify({
    instagram: { texto: "Corolla impecável, venha conhecer", hashtags: ["#corolla", "#toyota"] },
    facebook: { texto: "Seu próximo carro está aqui", hashtags: ["#carros"] },
    tiktok: { texto: "Olha esse Corolla", hashtags: ["#carrosusados"] },
    ...o,
  });
function iaFalsa(respostas: string[]) {
  const pedidos: string[] = [];
  provedorIa = { gerar: async (p) => { pedidos.push(p.usuario); return { textoCru: respostas.shift() ?? "{}", tokensEntrada: 1, tokensSaida: 1 }; } };
  return pedidos;
}

test("legenda: sem chave de IA -> 503 chave_ausente e nenhuma legenda inventada", async () => {
  const id = videoAprovado();
  const r = await chamar("POST", `/api/videos/${id}/legendas/gerar`);
  assert.equal(r.status, 503);
  assert.equal(r.json.codigo, "chave_ausente");
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM legenda_video").n, 0);
});

test("legenda: IA escreve por rede; preço, ano e km vêm da ficha, nunca da IA", async () => {
  const id = videoAprovado();
  iaFalsa([respostaLegendas()]);
  const r = await chamar("POST", `/api/videos/${id}/legendas/gerar`);
  assert.equal(r.status, 200);
  assert.equal(r.json.legendas.length, 3);
  const ig = r.json.legendas.find((l: any) => l.rede === "instagram").texto as string;
  assert.match(ig, /Corolla impecável/);
  assert.match(ig, /Toyota Corolla • 2020 • 48\.000 km • R\$\s15\.500/);
  assert.match(ig, /#corolla #toyota/);
});

test("legenda: IA que escreve número é rejeitada e reescrita; esgotou -> 502, sem legenda", async () => {
  const id = videoAprovado();
  const pedidos = iaFalsa([
    respostaLegendas({ instagram: { texto: "Só R$ 9.999 hoje", hashtags: [] } }),
    respostaLegendas({ tiktok: { texto: "ok", hashtags: ["#corolla2020"] } }),
    respostaLegendas(),
  ]);
  const r = await chamar("POST", `/api/videos/${id}/legendas/gerar`);
  assert.equal(r.status, 200);
  assert.equal(pedidos.length, 3);
  assert.match(pedidos[1]!, /tem dígito/);
  const id2 = videoAprovado();
  iaFalsa(["lixo", "lixo", "lixo"]);
  const ruim = await chamar("POST", `/api/videos/${id2}/legendas/gerar`);
  assert.equal(ruim.status, 502);
  assert.equal(ler<{ n: number }>("SELECT COUNT(*) AS n FROM legenda_video WHERE video_id = ?", id2).n, 0);
});

test("legenda: respeita o limite de cada rede e permite sobrescrever à mão (que sobrevive a nova geração)", async () => {
  const id = videoAprovado();
  assert.throws(() => comporLegenda("instagram", { texto: "a".repeat(2300), hashtags: [] }, "ficha"), ErroLegenda);
  assert.throws(() => comporLegenda("instagram", { texto: "ok", hashtags: Array.from({ length: 31 }, () => "#a") }, "f"), /hashtags/);
  const longa = await chamar("POST", `/api/videos/${id}/legendas/tiktok`, { texto: "a".repeat(2201) });
  assert.equal(longa.status, 400);
  assert.equal(longa.json.codigo, "legenda_longa");
  const ok = await chamar("POST", `/api/videos/${id}/legendas/tiktok`, { texto: "Minha legenda manual" });
  assert.equal(ok.json.legenda.manual, true);
  iaFalsa([respostaLegendas()]);
  const ger = await chamar("POST", `/api/videos/${id}/legendas/gerar`);
  assert.deepEqual(ger.json.mantidasManuais, ["tiktok"]);
  assert.equal(ger.json.legendas.find((l: any) => l.rede === "tiktok").texto, "Minha legenda manual");
});

test("legenda editada vai na publicação; sem legenda, sai só a ficha lida", async () => {
  const a = videoAprovado();
  const b = videoAprovado();
  await conectarReal("instagram");
  semEspacamento();
  const esp = espiao();
  await chamar("POST", `/api/videos/${a}/legendas/instagram`, { texto: "Texto à mão" });
  await chamar("POST", `/api/videos/${a}/publicar`, { rede: "instagram" });
  await chamar("POST", `/api/videos/${b}/publicar`, { rede: "instagram" });
  assert.equal(esp.chamadas[0]!.legenda, "Texto à mão");
  assert.match(esp.chamadas[1]!.legenda, /^Toyota Corolla • 2020 • 48\.000 km/);
});

// ===================================================================== servidor

test("servidor escuta só em 127.0.0.1 e a migração v4 criou as tabelas", () => {
  assert.equal((servidor.address() as AddressInfo).address, "127.0.0.1");
  const t = ler<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('conta_rede','legenda_video','publicacao')");
  assert.equal(t.n, 3);
  assert.equal(ler<{ v: number }>("SELECT MAX(versao) AS v FROM schema_version").v, 4);
});
