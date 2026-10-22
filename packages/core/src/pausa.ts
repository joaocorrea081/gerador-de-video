// Freio de mão: um estado global de pausa, gravado no banco (tabela `ajuste`)
// para sobreviver a reinício e ser visto por todos os processos.
//
// O que a pausa IMPEDE (a trava mora nas funções de core que os workers já
// usam, então quem esquecer de checar continua barrado):
//   - iniciar render novo   -> proximoJobPendente devolve undefined
//   - iniciar publicação    -> publicacoesVencidas devolve [] e
//                              reivindicarPublicacao recusa
//   - leitura agendada      -> executarRodada({ agendada: true }) não lê nada
//
// O que a pausa NÃO interrompe (decisão):
//   - Render em andamento TERMINA. Cortar no meio perde até ~60s de CPU e
//     não protege ninguém: o vídeo continua só aguardando aprovação humana.
//   - Publicação em andamento ('publicando') NUNCA é interrompida. Cortar
//     entre o envio e a confirmação da rede é justamente o que gera post
//     duplicado ou post "fantasma". Ela termina e se registra normalmente.
//
// Despausar não precisa "recuperar" nada: a fila vive no banco (jobs
// pendentes, publicações agendadas) e o que já saiu está 'publicada', fora de
// qualquer consulta de vencidas — logo não republica. A idempotência
// (vídeo, rede) continua valendo por baixo.

import type Database from "better-sqlite3";

export const CHAVE_PAUSA = "sistema.pausa";

export class ErroPausa extends Error {}

export interface EstadoPausa {
  pausado: boolean;
  /** Quem apertou o freio (nome ou e-mail). Gravado sempre que pausa. */
  por: string | null;
  motivo: string | null;
  /** ISO UTC de quando pausou. */
  em: string | null;
  /** Quem despausou, e quando (a última retomada). */
  retomadoPor: string | null;
  retomadoEm: string | null;
}

const LIVRE: EstadoPausa = { pausado: false, por: null, motivo: null, em: null, retomadoPor: null, retomadoEm: null };

export function obterPausa(db: Database.Database): EstadoPausa {
  const l = db.prepare("SELECT valor FROM ajuste WHERE chave = ?").get(CHAVE_PAUSA) as { valor: string } | undefined;
  if (!l) return { ...LIVRE };
  try {
    return { ...LIVRE, ...(JSON.parse(l.valor) as Partial<EstadoPausa>) };
  } catch {
    // Valor ilegível: na dúvida, o freio está puxado (falha para o lado seguro).
    return { ...LIVRE, pausado: true, por: "desconhecido", motivo: "estado de pausa ilegível" };
  }
}

/** Barato o bastante para ser chamado a cada ciclo de worker. */
export function sistemaPausado(db: Database.Database): boolean {
  return obterPausa(db).pausado;
}

function gravar(db: Database.Database, e: EstadoPausa): void {
  db.prepare(
    "INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(CHAVE_PAUSA, JSON.stringify(e));
}

export function exigirResponsavel(por: unknown): string {
  if (typeof por !== "string" || por.trim().length === 0) {
    throw new ErroPausa("Diga quem está fazendo isto — o nome fica gravado junto da pausa.");
  }
  return por.trim();
}

/** Puxa o freio. Já pausado: mantém quem/quando originais (não sobrescreve). */
export function pausarTudo(db: Database.Database, por: string, motivo?: string, agora: Date = new Date()): EstadoPausa {
  const quem = exigirResponsavel(por);
  const atual = obterPausa(db);
  if (atual.pausado) return atual;
  const novo: EstadoPausa = {
    pausado: true,
    por: quem,
    motivo: motivo?.trim() || null,
    em: agora.toISOString(),
    retomadoPor: atual.retomadoPor,
    retomadoEm: atual.retomadoEm,
  };
  gravar(db, novo);
  return novo;
}

/**
 * Só solta o freio (sem reagendar nada). Quem despausa pelo painel deve usar
 * `retomarTudo` (controles.ts), que também espaça o que venceu durante a pausa.
 */
export function soltarFreio(db: Database.Database, por: string, agora: Date = new Date()): EstadoPausa {
  const quem = exigirResponsavel(por);
  const atual = obterPausa(db);
  const novo: EstadoPausa = { ...atual, pausado: false, retomadoPor: quem, retomadoEm: agora.toISOString() };
  gravar(db, novo);
  return novo;
}
