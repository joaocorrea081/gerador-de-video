// Grade de publicação: o plano recorrente ("seg/qua/sex às 10h e 18h").
// A grade só decide QUANDO, nunca SE: quem entra no calendário continua sendo
// só vídeo aprovado por uma pessoa (agendarPublicacao garante).
// Este arquivo é puro (sem banco) exceto lerPlano/salvarPlano/ocupadosPorRede.
// Horário da grade é de Brasília (UTC-3 fixo; sem horário de verão desde 2019).

import type Database from "better-sqlite3";
import {
  ErroPublicacao, LIMITE_DIARIO_FIXO, REDES, gravarAjuste, lerAjusteTexto, proximoHorarioLivre, type Rede,
} from "./publicacao.js";

export const CHAVE_PLANO = "plano.publicacao";
export const DESLOCAMENTO_BRASILIA_H = -3;
export const HORIZONTE_DIAS = 400;
export const MAXIMO_GRADES = 10;
const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;
const PASSO_LIVRE_MS = 15 * 60_000;
const NOMES_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** Um bloco da grade: nestes dias, nestes horários, nestas redes. */
export interface Grade {
  /** 0 = domingo ... 6 = sábado (dia da semana em Brasília). */
  dias: number[];
  /** "HH:MM" em Brasília, 24h. */
  horarios: string[];
  redes: Rede[];
}

export interface Plano {
  /** Desligar não apaga a configuração. */
  ativo: boolean;
  grades: Grade[];
}

export const PLANO_VAZIO: Plano = { ativo: false, grades: [] };

function erroPlano(mensagem: string, codigo: string): ErroPublicacao {
  return new ErroPublicacao(mensagem, 400, codigo);
}

/** Valida e normaliza (ordena, tira repetidos). Lança ErroPublicacao 400 com mensagem legível. */
export function normalizarPlano(bruto: unknown): Plano {
  if (typeof bruto !== "object" || bruto === null) throw erroPlano("O plano precisa ser um objeto.", "plano_invalido");
  const o = bruto as Record<string, unknown>;
  if (typeof o["ativo"] !== "boolean") throw erroPlano('"ativo" precisa ser verdadeiro ou falso.', "plano_invalido");
  if (!Array.isArray(o["grades"])) throw erroPlano('"grades" precisa ser uma lista.', "plano_invalido");
  if (o["grades"].length > MAXIMO_GRADES) throw erroPlano(`No máximo ${MAXIMO_GRADES} blocos na grade.`, "plano_invalido");
  const grades = o["grades"].map((g, i): Grade => {
    const n = `bloco ${i + 1}`;
    if (typeof g !== "object" || g === null) throw erroPlano(`${n}: formato inválido.`, "grade_invalida");
    const { dias, horarios, redes } = g as Record<string, unknown>;
    if (!Array.isArray(dias) || dias.length === 0 || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw erroPlano(`${n}: escolha ao menos um dia da semana (0 = domingo a 6 = sábado).`, "dias_invalidos");
    }
    if (!Array.isArray(horarios) || horarios.length === 0 || horarios.some((h) => typeof h !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h))) {
      throw erroPlano(`${n}: escolha ao menos um horário no formato HH:MM (00:00 a 23:59).`, "horarios_invalidos");
    }
    if (!Array.isArray(redes) || redes.length === 0 || redes.some((r) => !(REDES as readonly unknown[]).includes(r))) {
      throw erroPlano(`${n}: escolha ao menos uma rede (${REDES.join(", ")}).`, "redes_invalidas");
    }
    return {
      dias: [...new Set(dias as number[])].sort((a, b) => a - b),
      horarios: [...new Set(horarios as string[])].sort(),
      redes: REDES.filter((r) => (redes as Rede[]).includes(r)),
    };
  });
  if (o["ativo"] && grades.length === 0) throw erroPlano("Para ligar a grade, monte ao menos um bloco (dias e horários).", "grade_vazia");
  return { ativo: o["ativo"], grades };
}

export function lerPlano(db: Database.Database): Plano {
  const texto = lerAjusteTexto(db, CHAVE_PLANO);
  if (texto === undefined) return { ...PLANO_VAZIO, grades: [] };
  try { return normalizarPlano(JSON.parse(texto)); } catch { return { ...PLANO_VAZIO, grades: [] }; }
}

export function salvarPlano(db: Database.Database, bruto: unknown): Plano {
  const plano = normalizarPlano(bruto);
  gravarAjuste(db, CHAVE_PLANO, JSON.stringify(plano));
  return plano;
}

/** Liga/desliga sem tocar nos blocos. Ligar sem blocos é recusado. */
export function definirPlanoAtivo(db: Database.Database, ativo: boolean): Plano {
  const atual = lerPlano(db);
  return salvarPlano(db, { ...atual, ativo });
}

// ------------------------------------------------------------ Brasília

/** "HH:MM" de Brasília no dia civil (y, m0, d) -> instante UTC em ms. Aceita d fora do mês (rola o mês). */
export function brasiliaParaUtc(ano: number, mes0: number, dia: number, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return Date.UTC(ano, mes0, dia, h - DESLOCAMENTO_BRASILIA_H, m);
}

export interface HorarioBrasilia {
  iso: string;
  /** "2026-10-23T10:00:00-03:00" */
  brasilia: string;
  /** "sex 23/10 10:00" */
  rotulo: string;
}

export function formatarBrasilia(ms: number): HorarioBrasilia {
  const d = new Date(ms + DESLOCAMENTO_BRASILIA_H * HORA_MS);
  const p = (n: number, t = 2) => String(n).padStart(t, "0");
  const data = `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const hora = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return {
    iso: new Date(ms).toISOString(),
    brasilia: `${data}T${hora}:${p(d.getUTCSeconds())}-03:00`,
    rotulo: `${NOMES_DIA[d.getUTCDay()]} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${hora}`,
  };
}

/** Vagas da grade para uma rede, em ordem crescente, estritamente depois de `agoraMs`. */
export function* vagasDaRede(plano: Plano, rede: Rede, agoraMs: number): Generator<number> {
  const blocos = plano.grades.filter((g) => g.redes.includes(rede));
  if (blocos.length === 0) return;
  const hoje = new Date(agoraMs + DESLOCAMENTO_BRASILIA_H * HORA_MS);
  const [a, m, d] = [hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()] as const;
  for (let off = 0; off <= HORIZONTE_DIAS; off++) {
    const dow = new Date(Date.UTC(a, m, d + off)).getUTCDay();
    const horarios = new Set<string>();
    for (const g of blocos) if (g.dias.includes(dow)) for (const h of g.horarios) horarios.add(h);
    for (const h of [...horarios].sort()) {
      const ms = brasiliaParaUtc(a, m, d + off, h);
      if (ms > agoraMs) yield ms;
    }
  }
}

// ------------------------------------------------------------ vagas livres

export interface ContextoVagas {
  agora: Date;
  espacamentoMs: number;
  /** Limite por 24h móveis. Facebook: 30. Instagram: valor consultado na API, se houver. */
  limites: Partial<Record<Rede, number>>;
  /** Instantes (ms) já ocupados por rede: agendados, em curso ou publicados. */
  ocupados: Record<Rede, number[]>;
}

export const limitesPadrao = (): Partial<Record<Rede, number>> => ({ ...LIMITE_DIARIO_FIXO });

/** Colocar `t` estoura o limite em alguma janela móvel de 24h que o contém? */
export function estouraLimite24h(ocupadosOrdenados: readonly number[], t: number, limite: number): boolean {
  if (limite <= 0) return true;
  const lista = [...ocupadosOrdenados, t].sort((a, b) => a - b);
  const idx = lista.indexOf(t);
  for (let i = Math.max(0, idx - limite); i <= idx; i++) {
    const fim = lista[i + limite];
    if (fim !== undefined && fim - lista[i]! < DIA_MS) return true;
  }
  return false;
}

function vagaCabe(ctx: ContextoVagas, rede: Rede, ms: number): boolean {
  const oc = ctx.ocupados[rede];
  if (oc.includes(ms)) return false;
  if (ctx.espacamentoMs > 0 && proximoHorarioLivre(oc, ms, ctx.espacamentoMs) !== ms) return false;
  const limite = ctx.limites[rede];
  if (limite !== undefined && estouraLimite24h(oc, ms, limite)) return false;
  return true;
}

/** Próxima vaga LIVRE da grade para a rede, ou null (grade desligada, rede fora da grade, sem vaga no horizonte). Não altera `ocupados`. */
export function proximaVagaDaGrade(plano: Plano, rede: Rede, ctx: ContextoVagas): number | null {
  if (!plano.ativo) return null;
  for (const ms of vagasDaRede(plano, rede, ctx.agora.getTime())) if (vagaCabe(ctx, rede, ms)) return ms;
  return null;
}

/** Sem grade: próxima hora cheia (Brasília) livre, respeitando espaçamento e limite. */
export function proximoHorarioLivreSemGrade(rede: Rede, ctx: ContextoVagas): number | null {
  const agora = ctx.agora.getTime();
  let cand = (Math.floor(agora / HORA_MS) + 1) * HORA_MS;
  const oc = ctx.ocupados[rede];
  const limite = ctx.limites[rede];
  if (limite !== undefined && limite <= 0) return null;
  for (let i = 0; i < 8000; i++) {
    cand = ctx.espacamentoMs > 0 ? proximoHorarioLivre(oc, cand, ctx.espacamentoMs) : cand;
    if (!oc.includes(cand) && (limite === undefined || !estouraLimite24h(oc, cand, limite))) return cand;
    cand += PASSO_LIVRE_MS;
  }
  return null;
}

export interface PedidoEncaixe {
  videoId: number;
  /** Redes ELEGÍVEIS (aprovadas na validação etc.). A decisão de elegibilidade é de quem chama. */
  redes: Rede[];
}

export interface ItemEncaixe {
  videoId: number;
  rede: Rede;
  quandoMs: number;
  origem: "grade" | "livre";
  horario: HorarioBrasilia;
}

export interface SemVaga {
  videoId: number;
  rede: Rede;
  motivo: "grade_desligada" | "rede_fora_da_grade" | "sem_vaga";
}

export interface ResultadoEncaixe {
  itens: ItemEncaixe[];
  semVaga: SemVaga[];
}

/**
 * O coração: encaixa em ordem, cada (vídeo, rede) na próxima vaga livre depois
 * das já reservadas neste mesmo cálculo. Previsão e encaixe real chamam ESTA
 * função, então não podem divergir. `permitirLivre`: sem grade (ou rede fora
 * dela) usa horários livres em vez de recusar.
 */
export function calcularEncaixe(
  plano: Plano, pedidos: readonly PedidoEncaixe[], ctx: ContextoVagas, opcoes: { permitirLivre?: boolean } = {},
): ResultadoEncaixe {
  const trabalho: ContextoVagas = { ...ctx, ocupados: { instagram: [...ctx.ocupados.instagram], facebook: [...ctx.ocupados.facebook], tiktok: [...ctx.ocupados.tiktok] } };
  const itens: ItemEncaixe[] = [];
  const semVaga: SemVaga[] = [];
  for (const p of pedidos) {
    for (const rede of REDES.filter((r) => p.redes.includes(r))) {
      const naGrade = plano.ativo && plano.grades.some((g) => g.redes.includes(rede));
      let ms: number | null = null;
      let origem: "grade" | "livre" = "grade";
      if (naGrade) ms = proximaVagaDaGrade(plano, rede, trabalho);
      if (ms === null && opcoes.permitirLivre && (!naGrade)) {
        ms = proximoHorarioLivreSemGrade(rede, trabalho);
        origem = "livre";
      }
      if (ms === null) {
        semVaga.push({ videoId: p.videoId, rede, motivo: !plano.ativo ? "grade_desligada" : !naGrade ? "rede_fora_da_grade" : "sem_vaga" });
        continue;
      }
      trabalho.ocupados[rede].push(ms);
      trabalho.ocupados[rede].sort((a, b) => a - b);
      itens.push({ videoId: p.videoId, rede, quandoMs: ms, origem, horario: formatarBrasilia(ms) });
    }
  }
  return { itens, semVaga };
}

/** Instantes ocupados por rede (mesma regra do espaçamento existente: publicada_em, senão agendada_para). */
export function ocupadosPorRede(db: Database.Database): Record<Rede, number[]> {
  const saida: Record<Rede, number[]> = { instagram: [], facebook: [], tiktok: [] };
  const linhas = db.prepare(
    "SELECT rede, agendada_para, publicada_em FROM publicacao WHERE estado IN ('agendada','publicando','publicada','verificar')",
  ).all() as { rede: Rede; agendada_para: string; publicada_em: string | null }[];
  for (const l of linhas) saida[l.rede].push(Date.parse(l.publicada_em ?? l.agendada_para));
  for (const r of REDES) saida[r].sort((a, b) => a - b);
  return saida;
}
