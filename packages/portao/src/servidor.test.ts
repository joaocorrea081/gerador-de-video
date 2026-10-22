// Testes do portão contra a lógica de repositório que o servidor usa
// (packages/core/src/repositorio.ts) — mesma regra que o servidor HTTP
// aplica nas rotas /api/videos/:id/rejeitar e /api/videos/:id/aprovar.
// Cobertura HTTP real (curl) está na prova colada na resposta; aqui o que
// importa para `pnpm test` é a regra de negócio, isolada e repetível.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  aprovarVideo,
  contarRejeicoesPorMotivo,
  criarVideoComJob,
  ErroPortao,
  marcarJobConcluido,
  migrar,
  obterJobDoVideo,
  rejeitarVideo,
} from "@gerador/core";
import { paginaFila } from "./paginas.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrar(db);
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x', '{}', ?)").run(
    new Date().toISOString(),
  );
});

function novoVideoAguardandoAprovacao() {
  const { video, job } = criarVideoComJob(db, {
    produtoId: 1,
    titulo: "Corolla 2020",
    corpo: "Carro em ótimo estado.",
    fundo: "claro",
    ritmo: "calmo",
    ordemFotos: [],
  });
  marcarJobConcluido(db, job.id, video.id, "/tmp/video.mp4");
  return video;
}

test("rejeição sem motivo é recusada", () => {
  const video = novoVideoAguardandoAprovacao();
  assert.throws(() => rejeitarVideo(db, { videoId: video.id, motivo: undefined }), ErroPortao);
  assert.throws(() => rejeitarVideo(db, { videoId: video.id, motivo: "" }), ErroPortao);
});

test("rejeição com motivo inválido (texto livre) é recusada", () => {
  const video = novoVideoAguardandoAprovacao();
  assert.throws(
    () => rejeitarVideo(db, { videoId: video.id, motivo: "o carro tá feio e eu não gostei, refaz" }),
    ErroPortao,
  );
});

test("rejeição com motivo válido funciona e grava o estado", () => {
  const video = novoVideoAguardandoAprovacao();
  const { video: atualizado, rejeicao } = rejeitarVideo(db, { videoId: video.id, motivo: "foto_ruim" });
  assert.equal(atualizado.estado, "rejeitado");
  assert.equal(rejeicao.motivo, "foto_ruim");
});

test("aprovar muda o estado para aprovado", () => {
  const video = novoVideoAguardandoAprovacao();
  const atualizado = aprovarVideo(db, video.id);
  assert.equal(atualizado.estado, "aprovado");
});

test("aprovar vídeo que não está aguardando aprovação é recusado", () => {
  const { video } = criarVideoComJob(db, {
    produtoId: 1,
    titulo: "x",
    corpo: "y",
    fundo: "claro",
    ritmo: "calmo",
    ordemFotos: [],
  });
  assert.throws(() => aprovarVideo(db, video.id), ErroPortao);
});

test("rejeições agrupadas por motivo devolvem a contagem certa", () => {
  const v1 = novoVideoAguardandoAprovacao();
  const v2 = novoVideoAguardandoAprovacao();
  const v3 = novoVideoAguardandoAprovacao();

  rejeitarVideo(db, { videoId: v1.id, motivo: "foto_ruim" });
  rejeitarVideo(db, { videoId: v2.id, motivo: "foto_ruim" });
  rejeitarVideo(db, { videoId: v3.id, motivo: "ritmo" });

  const contagens = contarRejeicoesPorMotivo(db);
  assert.equal(contagens.foto_ruim, 2);
  assert.equal(contagens.ritmo, 1);
  assert.equal(contagens.texto_errado, 0);
  assert.equal(contagens.dado_errado, 0);
  assert.equal(contagens.fundo, 0);
});

test("job acompanha o vídeo até concluído", () => {
  const video = novoVideoAguardandoAprovacao();
  const job = obterJobDoVideo(db, video.id);
  assert.equal(job?.estado, "concluido");
});

// Regressão: o histórico mostrava "sem vídeo ainda" para um vídeo aprovado
// com caminhoMp4 preenchido, porque a tela decidia o player pelo estado
// ("aguardando_aprovacao") em vez do dado (caminhoMp4 existir). Fila e
// Histórico usam a mesma `cartaoFila`/`montarPlayer` em paginas.ts — este
// teste falha se a condição voltar a depender do estado.
// Regressão: o player era escolhido pelo estado do vídeo ("aguardando_aprovacao") em vez do dado
// (caminhoMp4 existir). Vídeo com MP4 pronto tem que mostrar o <video>, em qualquer estado da Fila.
test("fila monta o player de vídeo (<video src=/video/:id.mp4>) quando há MP4, mesmo fora de aguardando_aprovacao", () => {
  const criado = novoVideoAguardandoAprovacao();
  const video = aprovarVideo(db, criado.id);
  assert.ok(video.caminhoMp4, "pré-condição: vídeo precisa ter caminhoMp4 preenchido");
  const base = { id: video.id, titulo: video.titulo, corpo: video.corpo, fundo: video.fundo, ritmo: video.ritmo, caminhoMp4: video.caminhoMp4, criadoEm: video.criadoEm, produto: null };
  for (const estado of ["aguardando_aprovacao", "erro"]) {
    const html = paginaFila([{ ...base, estado }] as never, { pendentes: 0, emExecucao: null, segundosPorVideo: 60, estimativaRestanteSegundos: 0, origemEstimativa: "padrao", amostras: 0 } as never);
    assert.match(html, new RegExp(`<video src="/video/${video.id}\\.mp4"`), estado);
    assert.doesNotMatch(html, /sem vídeo ainda/);
  }
});
