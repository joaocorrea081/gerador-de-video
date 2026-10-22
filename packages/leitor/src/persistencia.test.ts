import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { migrar } from "@gerador/core";
import { salvarFotos, salvarProduto } from "./persistencia.js";
import type { FichaLida } from "./adaptador.js";
import type { FotoBaixada } from "./fotos.js";

function banco(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const ficha = (preco: number) =>
  ({ marca: "VW", modelo: "Gol", ano: 2020, km: 1000, preco, moeda: "BRL", fotos: [] }) as unknown as FichaLida;

const foto = (n: number): FotoBaixada =>
  ({ url: `http://x/${n}.jpg`, largura: 1024, altura: 768, caminhoLocal: `/tmp/${n}.jpg`, ordem: n }) as FotoBaixada;

const contar = (db: Database.Database, t: string) =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

test("mesmo origem_url duas vezes devolve o mesmo id e 1 linha", () => {
  const db = banco();
  const a = salvarProduto(db, "http://x/carro", ficha(100));
  const b = salvarProduto(db, "http://x/carro", ficha(100));
  assert.equal(a, b);
  assert.equal(contar(db, "produto"), 1);
});

test("preço novo atualiza o dados_json", () => {
  const db = banco();
  const id = salvarProduto(db, "http://x/carro", ficha(100));
  salvarProduto(db, "http://x/carro", ficha(90));
  const l = db.prepare("SELECT dados_json FROM produto WHERE id = ?").get(id) as { dados_json: string };
  assert.equal(JSON.parse(l.dados_json).preco, 90);
});

test("salvar fotos duas vezes não duplica", () => {
  const db = banco();
  const id = salvarProduto(db, "http://x/carro", ficha(100));
  salvarFotos(db, id, [foto(0), foto(1)]);
  salvarFotos(db, id, [foto(0), foto(1)]);
  assert.equal(contar(db, "foto"), 2);
});

test("migração v3 remove duplicata preexistente e cria índice único", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrar(db, 2);
  const ins = db.prepare("INSERT INTO produto (origem_url, dados_json, lido_em) VALUES (?, '{}', 'x')");
  for (const u of ["a", "b", "a", "b", "a"]) ins.run(u);
  const f = db.prepare("INSERT INTO foto (produto_id, url) VALUES (?, 'u')");
  for (const id of [1, 2, 3, 4, 5]) f.run(id);
  db.prepare(
    "INSERT INTO video (produto_id, estado, criado_em, atualizado_em) VALUES (1, 'publicado', 'x', 'x')",
  ).run();

  migrar(db);

  assert.equal(contar(db, "produto"), 2);
  const ids = db.prepare("SELECT id FROM produto ORDER BY id").all();
  assert.deepEqual(ids, [{ id: 4 }, { id: 5 }]); // a mais recente de cada URL
  assert.equal(contar(db, "foto"), 2); // sem órfãs
  const v = db.prepare("SELECT produto_id FROM video").get() as { produto_id: number };
  assert.equal(v.produto_id, 5); // vídeo religado ao que ficou
  const idx = db.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_produto_origem_url'").get();
  assert.ok(idx);
  assert.throws(() => ins.run("a"));
});
