// Funções de alto nível para o painel chamar. Juntam as peças de pausa.ts,
// estoque.ts e conferencia.ts sem rota HTTP (rota é do portão).

import type Database from "better-sqlite3";
import { reagendarVencidasAposPausa, type PublicacaoReagendada } from "./publicacao.js";
import { soltarFreio, type EstadoPausa } from "./pausa.js";

export interface ResultadoRetomada {
  estado: EstadoPausa;
  /** Publicações que tinham vencido durante a pausa e foram espaçadas para não saírem todas juntas. */
  reagendadas: PublicacaoReagendada[];
}

/**
 * Despausar. A fila volta de onde parou: jobs pendentes seguem pendentes,
 * publicações agendadas seguem agendadas, o que já saiu segue 'publicada'
 * (nunca é reenviado). Só o que venceu durante a pausa é espaçado.
 */
export function retomarTudo(db: Database.Database, por: string, agora: Date = new Date()): ResultadoRetomada {
  return db.transaction(() => {
    const estado = soltarFreio(db, por, agora);
    return { estado, reagendadas: reagendarVencidasAposPausa(db, agora) };
  })();
}
