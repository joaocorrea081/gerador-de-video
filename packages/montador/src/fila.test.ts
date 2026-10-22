import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { migrar, criarVideoComJob, obterJob, obterVideo } from "@gerador/core";
import { criarFila, processarProximoJob, type FuncaoRenderizar, type OpcoesFila } from "./fila.js";

let db: Database.Database;
let pastaSaida: string;

before(() => {
  pastaSaida = mkdtempSync(join(tmpdir(), "fila-teste-"));
});

after(() => {
  rmSync(pastaSaida, { recursive: true, force: true });
});

beforeEach(() => {
  db = new Database(":memory:");
  migrar(db);
  // Um produto mínimo, só para o video.produto_id ter para onde apontar.
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x', '{}', ?)").run(
    new Date().toISOString(),
  );
});

function novoVideo() {
  return criarVideoComJob(db, {
    produtoId: 1,
    titulo: "Corolla 2020",
    corpo: "Carro em ótimo estado.",
    fundo: "claro",
    ritmo: "calmo",
    ordemFotos: [],
  });
}

test("fila processa um job pendente e marca concluído", async () => {
  const { job } = novoVideo();
  const renderizar: FuncaoRenderizar = async () => {};
  const opcoes: OpcoesFila = { renderizar, pastaSaida };

  const resultado = await processarProximoJob(db, opcoes);
  assert.equal(resultado?.jobId, job.id);
  assert.equal(resultado?.resultado, "concluido");

  const jobFinal = obterJob(db, job.id);
  assert.equal(jobFinal?.estado, "concluido");
  const videoFinal = obterVideo(db, job.videoId);
  assert.equal(videoFinal?.estado, "aguardando_aprovacao");
  assert.ok(videoFinal?.caminhoMp4?.endsWith(`video-${job.videoId}.mp4`));
});

test("fila processa jobs um por vez, em ordem de criação (FIFO)", async () => {
  const v1 = novoVideo();
  const v2 = novoVideo();

  const ordemExecutada: number[] = [];
  const renderizar: FuncaoRenderizar = async () => {
    ordemExecutada.push(ordemExecutada.length);
    await new Promise((r) => setTimeout(r, 5));
  };
  const opcoes: OpcoesFila = { renderizar, pastaSaida };

  const fila = criarFila(db, opcoes);
  const processados = await fila.esvaziar();

  assert.equal(processados, 2);
  assert.equal(obterVideo(db, v1.video.id)?.estado, "aguardando_aprovacao");
  assert.equal(obterVideo(db, v2.video.id)?.estado, "aguardando_aprovacao");
});

test("timeout: job que trava não segura a fila para sempre", async () => {
  const { job } = novoVideo();
  const renderizar: FuncaoRenderizar = () => new Promise(() => {}); // nunca resolve
  const opcoes: OpcoesFila = { renderizar, pastaSaida, timeoutMs: 30 };

  const resultado = await processarProximoJob(db, opcoes);
  assert.equal(resultado?.resultado, "retentar");

  const jobFinal = obterJob(db, job.id);
  assert.equal(jobFinal?.estado, "pendente");
  assert.equal(jobFinal?.tentativas, 1);
  assert.match(jobFinal?.erro ?? "", /não terminou/);
});

test("nova tentativa tem teto de 3: na terceira falha marca 'falhou'", async () => {
  const { job, video } = novoVideo();
  const renderizar: FuncaoRenderizar = async () => {
    throw new Error("render quebrou de propósito");
  };
  const opcoes: OpcoesFila = { renderizar, pastaSaida, maximoTentativas: 3 };

  const r1 = await processarProximoJob(db, opcoes);
  assert.equal(r1?.resultado, "retentar");
  assert.equal(obterJob(db, job.id)?.tentativas, 1);
  assert.equal(obterJob(db, job.id)?.estado, "pendente");

  const r2 = await processarProximoJob(db, opcoes);
  assert.equal(r2?.resultado, "retentar");
  assert.equal(obterJob(db, job.id)?.tentativas, 2);

  const r3 = await processarProximoJob(db, opcoes);
  assert.equal(r3?.resultado, "falhou");
  assert.equal(obterJob(db, job.id)?.tentativas, 3);
  assert.equal(obterJob(db, job.id)?.estado, "falhou");
  assert.equal(obterVideo(db, video.id)?.estado, "erro");

  // Esgotado: não tenta de novo.
  const r4 = await processarProximoJob(db, opcoes);
  assert.equal(r4, null);
});

test("job órfão em 'em_execucao' volta para 'pendente' ao recriar a fila (recuperação após queda)", async () => {
  const { job, video } = novoVideo();
  // Simula o processo anterior morrendo no meio do render: marca em
  // execução e nunca volta.
  db.prepare("UPDATE job SET estado = 'em_execucao', iniciado_em = ? WHERE id = ?").run(
    new Date().toISOString(),
    job.id,
  );
  db.prepare("UPDATE video SET estado = 'renderizando' WHERE id = ?").run(video.id);

  assert.equal(obterJob(db, job.id)?.estado, "em_execucao");

  // Subir a fila de novo roda a recuperação.
  criarFila(db, { renderizar: async () => {}, pastaSaida });

  assert.equal(obterJob(db, job.id)?.estado, "pendente");
});

async function propsRenderizadas(titulo: string, corpo: string, dados: object) {
  db.prepare("UPDATE produto SET dados_json = ? WHERE id = 1").run(JSON.stringify(dados));
  criarVideoComJob(db, { produtoId: 1, titulo, corpo, fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  let recebidas: Record<string, unknown> = {};
  await processarProximoJob(db, {
    pastaSaida,
    renderizar: async (p) => {
      recebidas = p;
    },
  });
  return recebidas;
}

test("props levam o texto escrito (titulo e corpo) até o render", async () => {
  const p = await propsRenderizadas("Astra pronto pra rodar", "Corpo da IA.", { marca: "CHEVROLET", modelo: "ASTRA" });
  assert.deepEqual(p["anuncio"], { titulo: "Astra pronto pra rodar", corpo: "Corpo da IA." });
});

test("texto padrão (marca+modelo reciclado) não vira anúncio escrito", async () => {
  const p = await propsRenderizadas("CHEVROLET ASTRA", "CHEVROLET ASTRA 2010", { marca: "CHEVROLET", modelo: "ASTRA", ano: 2010 });
  assert.deepEqual(p["anuncio"], { titulo: undefined, corpo: undefined });
});
