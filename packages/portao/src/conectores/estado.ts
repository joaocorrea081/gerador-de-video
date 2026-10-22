// Estado dos conectores: quais estão ligados e, para as redes que o núcleo ainda não conhece, a conta (modo seco).
// Ligar e desligar é um ajuste no banco ("conector.<id>.ativo"): nenhum código muda.
// As três redes do núcleo guardam a conta em conta_rede (core/publicacao.ts); as demais, em ajustes.

import { ErroPublicacao, obterAjuste, definirAjuste, obterConta, REDES, type ContaRede, type Rede } from "@gerador/core";
import type Database from "better-sqlite3";
import { CONECTORES } from "./registro.js";
import type { Conector } from "./tipos.js";

/** Visão pública da conta de qualquer conector. Nunca tem token. */
export type ContaConector = Omit<ContaRede, "rede"> & { id: string };

const chaveAtivo = (id: string) => `conector.${id}.ativo`;
const chaveConta = (id: string) => `conector.${id}.conta`;
const chaveAprovacao = (id: string) => `conector.${id}.aprovacao`;

export function conectorAtivo(db: Database.Database, c: Conector): boolean {
  const v = obterAjuste(db, chaveAtivo(c.id));
  return v === undefined ? c.ativoPadrao : v === "1";
}

export function definirConectorAtivo(db: Database.Database, id: string, ativo: boolean): void {
  if (!CONECTORES.some((c) => c.id === id)) throw new ErroPublicacao("conector desconhecido", 404, "conector_inexistente");
  definirAjuste(db, chaveAtivo(id), ativo ? "1" : "0");
}

export function conectoresAtivos(db: Database.Database): Conector[] {
  return CONECTORES.filter((c) => conectorAtivo(db, c));
}

/** As redes que o motor de fila sabe publicar e que estão ligadas: é o que as listas de agendar e a grade mostram. */
export function redesDeFilaAtivas(db: Database.Database): Rede[] {
  return CONECTORES.filter((c) => c.fila && conectorAtivo(db, c)).map((c) => c.id as Rede);
}

export function redeDeFilaAtiva(db: Database.Database, rede: string): boolean {
  return (REDES as readonly string[]).includes(rede) && redesDeFilaAtivas(db).includes(rede as Rede);
}

interface ContaGuardada {
  modo: "seco";
  contaNome: string | null;
  atualizadoEm: string;
}

export function contaDoConector(db: Database.Database, c: Conector): ContaConector {
  if (c.fila) {
    const { rede, ...resto } = obterConta(db, c.id as Rede);
    return { id: rede, ...resto };
  }
  let g: ContaGuardada | null = null;
  try {
    const bruto = obterAjuste(db, chaveConta(c.id));
    g = bruto ? (JSON.parse(bruto) as ContaGuardada) : null;
  } catch {
    g = null;
  }
  return {
    id: c.id, conectada: g !== null, modo: g ? "seco" : null, contaId: null, contaNome: g?.contaNome ?? null,
    tokenExpiraEm: null, refreshExpiraEm: null, escopos: [], aprovacaoPlataforma: obterAjuste(db, chaveAprovacao(c.id)) === "1",
    atualizadoEm: g?.atualizadoEm ?? "",
  };
}

function exigirExterno(id: string): Conector {
  const c = CONECTORES.find((x) => x.id === id);
  if (!c) throw new ErroPublicacao("conector desconhecido", 404, "conector_inexistente");
  if (c.fila) throw new ErroPublicacao("esta rede usa o fluxo do núcleo", 400, "rede_do_nucleo");
  return c;
}

/** Conta de um conector que o núcleo não conhece: só modo seco (nada sai de verdade). */
export function conectarExterno(db: Database.Database, id: string, entrada: Record<string, unknown>, agora: Date): ContaConector {
  const c = exigirExterno(id);
  if (entrada["modo"] !== "seco") {
    throw new ErroPublicacao("este conector só conecta em modo seco por enquanto", 400, "so_modo_seco");
  }
  const nome = typeof entrada["contaNome"] === "string" && entrada["contaNome"].trim() ? entrada["contaNome"].trim() : `${c.nome} (seco)`;
  const g: ContaGuardada = { modo: "seco", contaNome: nome, atualizadoEm: agora.toISOString() };
  definirAjuste(db, chaveConta(id), JSON.stringify(g));
  return contaDoConector(db, c);
}

export function desconectarExterno(db: Database.Database, id: string): ContaConector {
  const c = exigirExterno(id);
  db.prepare("DELETE FROM ajuste WHERE chave = ?").run(chaveConta(id));
  return contaDoConector(db, c);
}

export function aprovacaoExterno(db: Database.Database, id: string, aprovada: boolean): ContaConector {
  const c = exigirExterno(id);
  definirAjuste(db, chaveAprovacao(id), aprovada ? "1" : "0");
  return contaDoConector(db, c);
}

/** Publicações marcadas que ficam paradas enquanto a rede estiver desligada. */
export function agendadasDaRede(db: Database.Database, c: Conector): number {
  if (!c.fila) return 0;
  return (db.prepare("SELECT COUNT(*) AS n FROM publicacao WHERE rede = ? AND estado = 'agendada'").get(c.id) as { n: number }).n;
}
