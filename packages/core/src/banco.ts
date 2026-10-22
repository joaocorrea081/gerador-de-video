import Database from "better-sqlite3";
import { CAMINHO_BANCO, garantirPastaDados } from "./config.js";
import { migrar } from "./migracoes.js";

/** Abre o banco (criando o arquivo se necessário) e roda as migrações pendentes. */
export function abrirBanco(): Database.Database {
  garantirPastaDados();
  const db = new Database(CAMINHO_BANCO);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const TABELAS = ["produto", "foto", "video", "job", "rejeicao", "ajuste"] as const;

export type ContagemTabelas = Record<(typeof TABELAS)[number], number>;

/** Conta linhas de cada tabela de domínio. Usado pelo CLI e por GET /api/status. */
export function contarTabelas(db: Database.Database): ContagemTabelas {
  const contagens = {} as ContagemTabelas;
  for (const tabela of TABELAS) {
    const linha = db
      .prepare(`SELECT COUNT(*) as total FROM ${tabela}`)
      .get() as { total: number };
    contagens[tabela] = linha.total;
  }
  return contagens;
}
