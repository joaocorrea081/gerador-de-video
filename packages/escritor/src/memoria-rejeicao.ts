// Memória de rejeição: não é fine-tuning, é memória (ver REGRAS-DE-NEGOCIO.md).
// Lê a tabela `rejeicao` do banco, agrupada por motivo, com teto fixo e
// obrigatório de TETO_REJEICOES_POR_MOTIVO por categoria.

import type Database from "better-sqlite3";
import { MOTIVOS_REJEICAO, type MotivoRejeicao } from "@gerador/core";
import { TETO_REJEICOES_POR_MOTIVO, type ExemploRejeicao } from "./tipos.js";

interface LinhaRejeicao {
  motivo: MotivoRejeicao;
  observacao: string | null;
  criado_em: string;
}

/**
 * Carrega as `teto` rejeições mais recentes de cada motivo (10 por padrão,
 * fixo e obrigatório — "sem teto o custo e a demora sobem toda semana até
 * estourar", REGRAS-DE-NEGOCIO.md). Nunca devolve mais que `teto` itens por
 * motivo, mesmo que existam muito mais no banco.
 */
export function carregarMemoriaRejeicao(
  db: Database.Database,
  teto: number = TETO_REJEICOES_POR_MOTIVO,
): ExemploRejeicao[] {
  const consulta = db.prepare(
    `SELECT motivo, observacao, criado_em
     FROM rejeicao
     WHERE motivo = ?
     ORDER BY criado_em DESC, id DESC
     LIMIT ?`,
  );

  const exemplos: ExemploRejeicao[] = [];
  for (const motivo of MOTIVOS_REJEICAO) {
    const linhas = consulta.all(motivo, teto) as LinhaRejeicao[];
    for (const linha of linhas) {
      exemplos.push({
        motivo: linha.motivo,
        observacao: linha.observacao,
        criadoEm: linha.criado_em,
      });
    }
  }
  return exemplos;
}
