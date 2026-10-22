// Cardápio completo de ponta a ponta no banco: criar -> gravar -> fila -> props do Remotion.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  criarVideoComJob,
  ErroPortao,
  listarCardapio,
  migrar,
  obterVideo,
  refazerVideo,
  type VideoCarroProps,
} from "@gerador/core";
import { processarProximoJob } from "./fila.js";
import { sugerirVariacoesDoVideo } from "./variacoes.js";

let db: Database.Database;

function banco(ate?: number) {
  const d = new Database(":memory:");
  migrar(d, ate);
  d.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x', '{\"marca\":\"JEEP\"}', ?)").run(
    new Date().toISOString(),
  );
  return d;
}
beforeEach(() => {
  db = banco();
});

const base = { produtoId: 1, titulo: "T", corpo: "C", fundo: "escuro", ritmo: "rapido", ordemFotos: [] } as const;

async function propsDoJob(): Promise<VideoCarroProps> {
  const pasta = mkdtempSync(join(tmpdir(), "cb-"));
  let props: VideoCarroProps | undefined;
  try {
    await processarProximoJob(db, {
      pastaSaida: pasta,
      renderizar: async (p) => {
        props = p;
      },
    });
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
  assert.ok(props);
  return props;
}

test("video criado com modelo/enquadramento/cor grava e le de volta igual", () => {
  const { video } = criarVideoComJob(db, { ...base, modelo: "energico", enquadramento: "cheia", cor: "automatica" });
  const lido = obterVideo(db, video.id)!;
  assert.equal(lido.modelo, "energico");
  assert.equal(lido.enquadramento, "cheia");
  assert.equal(lido.cor, "automatica");
});

test("CHECK do banco recusa valor fora da lista", () => {
  const { video } = criarVideoComJob(db, base);
  assert.throws(() => db.prepare("UPDATE video SET modelo = 'xpto' WHERE id = ?").run(video.id));
  assert.throws(() => db.prepare("UPDATE video SET cor = 'rosa' WHERE id = ?").run(video.id));
});

test("montarProps (via fila) entrega o cardapio completo ao Remotion", async () => {
  criarVideoComJob(db, { ...base, modelo: "energico", enquadramento: "cheia", cor: "azul" });
  const p = await propsDoJob();
  assert.deepEqual(p.cardapio, {
    fundo: "escuro",
    ritmo: "rapido",
    enquadramento: "cheia",
    modelo: "energico",
    cor: "azul",
  });
});

test("video antigo (sem as colunas novas) renderiza com o padrao", async () => {
  criarVideoComJob(db, base);
  const p = await propsDoJob();
  assert.equal(p.cardapio.modelo, "institucional");
  assert.equal(p.cardapio.enquadramento, "nitida");
  assert.equal(p.cardapio.cor, "ambar");
});

test("refazer com modelo/enquadramento/cor invalido e recusado", () => {
  const { video } = criarVideoComJob(db, base);
  db.prepare("UPDATE video SET estado = 'aguardando_aprovacao' WHERE id = ?").run(video.id);
  for (const campo of ["modelo", "enquadramento", "cor"]) {
    assert.throws(
      () => refazerVideo(db, video.id, { [campo]: "inexistente" }),
      (e: unknown) => e instanceof ErroPortao && e.message.includes(`${campo} inválido`),
    );
  }
});

test("refazer herda do anterior o que nao foi informado", () => {
  const { video } = criarVideoComJob(db, { ...base, modelo: "editorial", enquadramento: "cheia", cor: "verde" });
  db.prepare("UPDATE video SET estado = 'aguardando_aprovacao' WHERE id = ?").run(video.id);
  const { video: novo } = refazerVideo(db, video.id, { cor: "roxo" });
  assert.equal(novo.modelo, "editorial");
  assert.equal(novo.enquadramento, "cheia");
  assert.equal(novo.cor, "roxo");
  assert.equal(novo.fundo, "escuro");
});

test("refazer de video antigo mantem NULL (padrao) quando nada e informado", () => {
  const { video } = criarVideoComJob(db, base);
  db.prepare("UPDATE video SET estado = 'aguardando_aprovacao' WHERE id = ?").run(video.id);
  const { video: novo } = refazerVideo(db, video.id, { modelo: "numeros" });
  assert.equal(novo.modelo, "numeros");
  assert.equal(novo.cor, null);
});

test("migracao v6 sobre banco em v5 nao perde dado", () => {
  const d = new Database(":memory:");
  migrar(d, 5);
  d.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1,'http://x','{}',?)").run("2026-01-01");
  d.prepare(
    "INSERT INTO video (produto_id, estado, criado_em, atualizado_em, titulo, corpo, fundo, ritmo, ordem_fotos_json) VALUES (1,'aprovado','a','b','Tit','Cor','escuro','rapido','[1,0]')",
  ).run();
  migrar(d);
  const v = obterVideo(d, 1)!;
  assert.equal(v.titulo, "Tit");
  assert.equal(v.fundo, "escuro");
  assert.equal(v.ordemFotosJson, "[1,0]");
  assert.equal(v.estado, "aprovado");
  assert.equal(v.modelo, null);
  assert.equal(v.cor, null);
  assert.equal((d.prepare("SELECT MAX(versao) m FROM schema_version").get() as { m: number }).m, 6);
});

test("listarCardapio traz nomes legiveis e a cor automatica", () => {
  const c = listarCardapio();
  assert.ok(c.cores.some((o) => o.id === "automatica" && o.nome.length > 0));
  assert.equal(c.modelos.length, 4);
  assert.ok([...c.modelos, ...c.cores, ...c.enquadramentos, ...c.fundos, ...c.ritmos].every((o) => o.nome && o.nome !== o.id || o.id === "azul"));
});

test("sugerirVariacoesDoVideo devolve N sugestoes diferentes da escolha atual", () => {
  const { video } = criarVideoComJob(db, { ...base, modelo: "energico", enquadramento: "cheia", cor: "azul" });
  const s = sugerirVariacoesDoVideo(db, video.id, 4);
  assert.equal(s.length, 4);
  for (const v of s) assert.ok(v.modelo !== "energico" || v.cor !== "azul" || v.enquadramento !== "cheia");
  assert.throws(() => sugerirVariacoesDoVideo(db, 999, 3), ErroPortao);
});
