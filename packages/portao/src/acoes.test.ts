// Regras das ações da Etapa 5 (parte A), direto contra a camada de dados.
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  calcularProximaRodada,
  criarVideoComJob,
  editarTexto,
  ErroPortao,
  gerarVideoDoEstoque,
  lerAgendamento,
  listarEstoque,
  marcarJobConcluido,
  marcarJobEmExecucao,
  migrar,
  passaFiltro,
  progressoFila,
  refazerVideo,
  registrarRodada,
  rodadaVencida,
  salvarAgendamento,
  type Agendamento,
} from "@gerador/core";

let db: Database.Database;
const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500 };

beforeEach(() => {
  db = new Database(":memory:");
  migrar(db);
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(
    JSON.stringify(FICHA),
    "2026-10-21T12:00:00.000Z",
  );
  for (let i = 0; i < 4; i++) {
    db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, ?, 1024, 768, ?, ?)").run(
      `http://x/f${i}.jpg`,
      `/tmp/f${i}.jpg`,
      i,
    );
  }
});

function videoPronto(produtoId = 1) {
  const { video, job } = criarVideoComJob(db, {
    produtoId,
    titulo: "Corolla 2020",
    corpo: "Carro bem cuidado.",
    fundo: "claro",
    ritmo: "calmo",
    ordemFotos: [],
  });
  marcarJobEmExecucao(db, job.id, video.id);
  marcarJobConcluido(db, job.id, video.id, "/tmp/v.mp4");
  return video;
}

const n = (tabela: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get() as { n: number }).n;

// ---------------------------------------------------------------- refazer

test("refazer vídeo com fundo inválido é recusado e nada é criado", () => {
  const v = videoPronto();
  assert.throws(() => refazerVideo(db, v.id, { fundo: "neon" }), ErroPortao);
  assert.throws(() => refazerVideo(db, v.id, { ritmo: "turbo" }), ErroPortao);
  assert.throws(() => refazerVideo(db, v.id, { fundo: 3 }), ErroPortao);
  assert.equal(n("video"), 1);
  assert.equal(n("job"), 1);
});

test("refazer vídeo recusa ordem de fotos fora do que o produto tem", () => {
  const v = videoPronto();
  assert.throws(() => refazerVideo(db, v.id, { ordemFotos: [0, 9] }), ErroPortao);
  assert.throws(() => refazerVideo(db, v.id, { ordemFotos: [1, 1] }), ErroPortao);
  assert.throws(() => refazerVideo(db, v.id, { ordemFotos: "0,1" }), ErroPortao);
  assert.equal(n("video"), 1);
});

test("refazer vídeo enfileira job NOVO e não apaga o antigo", () => {
  const antigo = videoPronto();
  const { video, job } = refazerVideo(db, antigo.id, { fundo: "escuro", ritmo: "rapido", ordemFotos: [3, 1, 0] });

  assert.notEqual(video.id, antigo.id);
  assert.equal(video.produtoId, antigo.produtoId);
  assert.equal(video.estado, "rascunho");
  assert.equal(video.fundo, "escuro");
  assert.equal(video.ritmo, "rapido");
  assert.equal(video.ordemFotosJson, "[3,1,0]");
  assert.equal(video.titulo, "Corolla 2020");
  assert.equal(job.estado, "pendente");
  assert.equal(job.videoId, video.id);

  assert.equal(n("video"), 2);
  assert.equal(n("job"), 2);
  const velho = db.prepare("SELECT estado, caminho_mp4, fundo FROM video WHERE id = ?").get(antigo.id) as Record<string, string>;
  assert.equal(velho["estado"], "aguardando_aprovacao");
  assert.equal(velho["caminho_mp4"], "/tmp/v.mp4");
  assert.equal(velho["fundo"], "claro");
});

test("refazer sem escolhas herda as do vídeo anterior", () => {
  const antigo = videoPronto();
  const { video } = refazerVideo(db, antigo.id, {});
  assert.equal(video.fundo, "claro");
  assert.equal(video.ritmo, "calmo");
});

test("refazer é recusado se o produto já tem vídeo na fila", () => {
  const antigo = videoPronto();
  refazerVideo(db, antigo.id, { fundo: "escuro" });
  assert.throws(() => refazerVideo(db, antigo.id, { fundo: "gradiente" }), ErroPortao);
  assert.equal(n("video"), 2);
});

test("refazer vídeo inexistente é recusado", () => {
  assert.throws(() => refazerVideo(db, 999, {}), ErroPortao);
});

// ----------------------------------------------------------------- editar

test("editar texto grava título e corpo e NÃO altera preço/ano/km/modelo, mesmo se vierem na requisição", () => {
  const v = videoPronto();
  const antes = db.prepare("SELECT * FROM produto WHERE id = 1").get();

  const atualizado = editarTexto(db, v.id, {
    titulo: "Corolla impecável",
    corpo: "Revisado, pronto para rodar.",
    preco: 1,
    ano: 1900,
    km: 0,
    modelo: "Ferrari",
    produto: { preco: 1 },
    dados_json: '{"preco":1}',
  });

  assert.equal(atualizado.titulo, "Corolla impecável");
  assert.equal(atualizado.corpo, "Revisado, pronto para rodar.");
  const depois = db.prepare("SELECT * FROM produto WHERE id = 1").get();
  assert.deepEqual(depois, antes);
  assert.equal((JSON.parse((depois as { dados_json: string }).dados_json) as typeof FICHA).preco, 15500);
});

test("editar texto: vazio, só espaço e acima do limite são recusados", () => {
  const v = videoPronto();
  assert.throws(() => editarTexto(db, v.id, { titulo: "", corpo: "x" }), ErroPortao);
  assert.throws(() => editarTexto(db, v.id, { titulo: "x", corpo: "   " }), ErroPortao);
  assert.throws(() => editarTexto(db, v.id, { titulo: "x".repeat(81), corpo: "x" }), ErroPortao);
  assert.throws(() => editarTexto(db, v.id, { titulo: "x", corpo: "x".repeat(401) }), ErroPortao);
  assert.throws(() => editarTexto(db, v.id, { preco: 5 }), ErroPortao);
});

test("editar texto de vídeo já aprovado é recusado (não publica texto sem aprovação)", () => {
  const v = videoPronto();
  db.prepare("UPDATE video SET estado = 'aprovado' WHERE id = ?").run(v.id);
  assert.throws(() => editarTexto(db, v.id, { titulo: "a", corpo: "b" }), ErroPortao);
});

// ----------------------------------------------------------- agendamento

test("próxima rodada = última + intervalo; desligado = nenhuma; ligado sem última = agora", () => {
  const agora = new Date("2026-10-21T15:00:00.000Z");
  assert.equal(
    calcularProximaRodada({ ligado: true, intervaloMinutos: 90, ultimaRodada: "2026-10-21T12:00:00.000Z" }, agora),
    "2026-10-21T13:30:00.000Z",
  );
  assert.equal(calcularProximaRodada({ ligado: false, intervaloMinutos: 90, ultimaRodada: "2026-10-21T12:00:00.000Z" }, agora), null);
  assert.equal(calcularProximaRodada({ ligado: true, intervaloMinutos: 90, ultimaRodada: null }, agora), agora.toISOString());
});

test("agendamento: padrão desligado; ligar, intervalo e filtro persistem; horários em ISO UTC", () => {
  const agora = new Date("2026-10-21T15:00:00.000Z");
  const padrao = lerAgendamento(db, agora);
  assert.equal(padrao.ligado, false);
  assert.equal(padrao.proximaRodada, null);
  assert.equal(padrao.ultimaRodada, null);

  salvarAgendamento(db, { ligado: true, intervaloMinutos: 30, filtro: { marca: "Toyota", precoMax: 50000 } }, agora);
  registrarRodada(db, { iniciadaEm: "2026-10-21T14:00:00.000Z", terminadaEm: "2026-10-21T14:02:00.000Z", itens: [] });
  const ag = lerAgendamento(db, agora);
  assert.equal(ag.ligado, true);
  assert.equal(ag.intervaloMinutos, 30);
  assert.deepEqual(ag.filtro, { marca: "Toyota", precoMax: 50000 });
  assert.equal(ag.ultimaRodada, "2026-10-21T14:02:00.000Z");
  assert.equal(ag.proximaRodada, "2026-10-21T14:32:00.000Z");
  assert.match(ag.proximaRodada!, /Z$/);
  assert.equal(rodadaVencida(ag, agora), true);
  assert.equal(rodadaVencida(ag, new Date("2026-10-21T14:10:00.000Z")), false);
  assert.equal(rodadaVencida({ ...ag, ligado: false } as Agendamento, agora), false);
});

test("agendamento recusa intervalo, filtro e URL inválidos; ignora campos desconhecidos", () => {
  assert.throws(() => salvarAgendamento(db, { intervaloMinutos: 1 }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { intervaloMinutos: 60.5 }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { ligado: "sim" }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { filtro: { anoMin: 2020, anoMax: 2010 } }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { filtro: { precoMax: -1 } }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { siteUrl: "javascript:alert(1)" }), ErroPortao);
  assert.throws(() => salvarAgendamento(db, { quantidade: 0 }), ErroPortao);
  assert.doesNotThrow(() => salvarAgendamento(db, { naoExiste: 1 }));
});

test("filtro de carros: marca, ano, preço e km; campo ausente na ficha não entra", () => {
  assert.equal(passaFiltro(FICHA, {}), true);
  assert.equal(passaFiltro(FICHA, { marca: "toyota" }), true);
  assert.equal(passaFiltro(FICHA, { marca: "Fiat" }), false);
  assert.equal(passaFiltro(FICHA, { anoMin: 2021 }), false);
  assert.equal(passaFiltro(FICHA, { anoMin: 2019, anoMax: 2020 }), true);
  assert.equal(passaFiltro(FICHA, { precoMax: 15000 }), false);
  assert.equal(passaFiltro(FICHA, { kmMax: 50000 }), true);
  assert.equal(passaFiltro({ marca: "Toyota" }, { precoMax: 50000 }), false);
});

// -------------------------------------------------------------- progresso

test("progresso com fila vazia: zero, sem job rodando, estimativa 0 e base de 60s", () => {
  const p = progressoFila(db, new Date("2026-10-21T15:00:00.000Z"));
  assert.equal(p.pendentes, 0);
  assert.equal(p.emExecucao, null);
  assert.equal(p.segundosPorVideo, 60);
  assert.equal(p.origemEstimativa, "padrao");
  assert.equal(p.estimativaRestanteSegundos, 0);
});

test("progresso com job em execução: devolve id do vídeo e há quanto tempo, e usa 60s sem histórico", () => {
  const a = criarVideoComJob(db, { produtoId: 1, titulo: "a", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  criarVideoComJob(db, { produtoId: 1, titulo: "a", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  db.prepare("UPDATE job SET estado = 'em_execucao', iniciado_em = ? WHERE id = ?").run("2026-10-21T14:59:40.000Z", a.job.id);

  const p = progressoFila(db, new Date("2026-10-21T15:00:00.000Z"));
  assert.equal(p.pendentes, 1);
  assert.deepEqual(p.emExecucao, { jobId: a.job.id, videoId: a.video.id, iniciadoEm: "2026-10-21T14:59:40.000Z", haSegundos: 20 });
  assert.equal(p.origemEstimativa, "padrao");
  // 1 pendente x 60s + (60 - 20)s do atual
  assert.equal(p.estimativaRestanteSegundos, 100);
});

test("progresso com histórico: média dos concluídos substitui os 60s", () => {
  const dur = [30, 50];
  dur.forEach((s, i) => {
    const { job } = criarVideoComJob(db, { produtoId: 1, titulo: "a", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
    const ini = new Date(Date.UTC(2026, 9, 21, 10, i, 0));
    db.prepare("UPDATE job SET estado = 'concluido', iniciado_em = ?, terminado_em = ? WHERE id = ?").run(
      ini.toISOString(),
      new Date(ini.getTime() + s * 1000).toISOString(),
      job.id,
    );
  });
  criarVideoComJob(db, { produtoId: 1, titulo: "a", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  criarVideoComJob(db, { produtoId: 1, titulo: "a", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });

  const p = progressoFila(db, new Date("2026-10-21T15:00:00.000Z"));
  assert.equal(p.origemEstimativa, "historico");
  assert.equal(p.amostras, 2);
  assert.equal(p.segundosPorVideo, 40);
  assert.equal(p.pendentes, 2);
  assert.equal(p.estimativaRestanteSegundos, 80);
});

// ---------------------------------------------------------------- estoque

test("estoque: produto sem vídeo, com vídeo (estado certo) e contagem de fotos", () => {
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (2, 'http://x/2', '{\"marca\":\"Fiat\"}', ?)").run(
    "2026-10-21T13:00:00.000Z",
  );
  const v = videoPronto(1);

  const itens = listarEstoque(db);
  const p1 = itens.find((i) => i.produtoId === 1)!;
  const p2 = itens.find((i) => i.produtoId === 2)!;
  assert.equal(p1.temVideo, true);
  assert.equal(p1.video?.id, v.id);
  assert.equal(p1.video?.estado, "aguardando_aprovacao");
  assert.equal(p1.video?.temMp4, true);
  assert.equal(p1.quantidadeFotos, 4);
  assert.equal(p1.lidoEm, "2026-10-21T12:00:00.000Z");
  assert.deepEqual(p1.ficha, FICHA);
  assert.equal(p2.temVideo, false);
  assert.equal(p2.video, null);
  assert.equal(p2.quantidadeFotos, 0);
});

test("estoque: o estado mostrado é o do vídeo mais recente", () => {
  const antigo = videoPronto();
  refazerVideo(db, antigo.id, { fundo: "escuro" });
  const p1 = listarEstoque(db).find((i) => i.produtoId === 1)!;
  assert.equal(p1.totalVideos, 2);
  assert.equal(p1.video?.estado, "rascunho");
});

test("gerar vídeo do estoque: produto sem vídeo enfileira; com vídeo é recusado; inexistente é recusado", () => {
  const { video, job } = gerarVideoDoEstoque(db, 1);
  assert.equal(video.estado, "rascunho");
  assert.equal(job.estado, "pendente");
  assert.equal(video.titulo, "Toyota Corolla");
  assert.throws(() => gerarVideoDoEstoque(db, 1), ErroPortao);
  assert.throws(() => gerarVideoDoEstoque(db, 99), ErroPortao);
  assert.equal(n("video"), 1);
});
