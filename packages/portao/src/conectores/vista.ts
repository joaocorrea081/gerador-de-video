import type Database from "better-sqlite3";
import { agendadasDaRede, conectorAtivo, contaDoConector, type ContaConector } from "./estado.js";
import { CONECTORES } from "./registro.js";
import type { Conector } from "./tipos.js";

export interface VistaConector {
  conector: Conector;
  conta: ContaConector;
  ativo: boolean;
  /** Publicações marcadas que esperam esta rede. */
  agendadas: number;
}

export function vistaDosConectores(db: Database.Database): VistaConector[] {
  return CONECTORES.map((conector) => ({
    conector, conta: contaDoConector(db, conector), ativo: conectorAtivo(db, conector), agendadas: agendadasDaRede(db, conector),
  }));
}
