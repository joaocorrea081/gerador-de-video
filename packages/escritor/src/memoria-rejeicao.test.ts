import assert from "node:assert/strict";
import { test } from "node:test";
import DatabaseConstructor from "better-sqlite3";
import { migrar } from "@gerador/core";
import { carregarMemoriaRejeicao } from "./memoria-rejeicao.js";

function criarBancoDeTeste(): InstanceType<typeof DatabaseConstructor> {
  const db = new DatabaseConstructor(":memory:");
  migrar(db);
  db.exec(`
    INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x', '{}', '2026-01-01T00:00:00Z');
    INSERT INTO video (id, produto_id, estado, criado_em, atualizado_em)
      VALUES (1, 1, 'rejeitado', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  `);
  return db;
}

test("teto de 10 rejeições por motivo, mesmo com 25 inseridas", () => {
  const db = criarBancoDeTeste();
  const inserir = db.prepare(
    "INSERT INTO rejeicao (video_id, motivo, observacao, criado_em) VALUES (1, 'foto_ruim', ?, ?)",
  );
  for (let i = 0; i < 25; i++) {
    inserir.run(`observacao-${i}`, `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`);
  }

  const exemplos = carregarMemoriaRejeicao(db);
  const doMotivo = exemplos.filter((exemplo) => exemplo.motivo === "foto_ruim");

  assert.equal(doMotivo.length, 10, "teto fixo de 10, mesmo com 25 rejeições no banco (das 25 inseridas)");
  // confirma que são as 10 mais recentes (índice 24 até 15), não as 10 primeiras
  assert.equal(doMotivo[0]?.observacao, "observacao-24");
  assert.equal(doMotivo[9]?.observacao, "observacao-15");

  db.close();
});

test("agrupa por motivo, teto é aplicado por categoria independentemente", () => {
  const db = criarBancoDeTeste();
  const inserir = db.prepare(
    "INSERT INTO rejeicao (video_id, motivo, observacao, criado_em) VALUES (1, ?, ?, ?)",
  );
  for (let i = 0; i < 3; i++) inserir.run("fundo", `f${i}`, `2026-02-0${i + 1}T00:00:00Z`);
  for (let i = 0; i < 12; i++) {
    inserir.run("ritmo", `r${i}`, `2026-03-${String(i + 1).padStart(2, "0")}T00:00:00Z`);
  }

  const exemplos = carregarMemoriaRejeicao(db);
  assert.equal(exemplos.filter((exemplo) => exemplo.motivo === "fundo").length, 3);
  assert.equal(exemplos.filter((exemplo) => exemplo.motivo === "ritmo").length, 10);
  assert.equal(exemplos.filter((exemplo) => exemplo.motivo === "texto_errado").length, 0);

  db.close();
});

test("teto customizado é respeitado", () => {
  const db = criarBancoDeTeste();
  const inserir = db.prepare(
    "INSERT INTO rejeicao (video_id, motivo, observacao, criado_em) VALUES (1, 'dado_errado', ?, ?)",
  );
  for (let i = 0; i < 5; i++) inserir.run(`d${i}`, `2026-04-0${i + 1}T00:00:00Z`);

  const exemplos = carregarMemoriaRejeicao(db, 2);
  assert.equal(exemplos.filter((exemplo) => exemplo.motivo === "dado_errado").length, 2);

  db.close();
});
