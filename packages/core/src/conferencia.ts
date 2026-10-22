// Conferência antes de publicar: o dado que está NO VÍDEO (snapshot gravado
// quando o render começou) contra o que o site mostra AGORA. Preço velho no ar
// é propaganda enganosa (REGRAS-DE-NEGOCIO.md, corolário).
//
// Aqui fica só a parte sem rede: comparar, guardar o resultado e a política.
// Quem lê o site é conferirAntesDePublicar, em packages/leitor.
// Os valores comparados vêm SEMPRE do dado lido, nunca de modelo de linguagem.

import type Database from "better-sqlite3";
import { definirAjuste, obterAjuste } from "./repositorio.js";

export type EstadoConferencia = "ok" | "mudou" | "nao_conferiu";

export const CAMPOS_CONFERIDOS = ["preco", "ano", "km", "marca", "modelo"] as const;
export type CampoConferido = (typeof CAMPOS_CONFERIDOS)[number];

const ROTULO: Record<CampoConferido, string> = { preco: "Preço", ano: "Ano", km: "Km", marca: "Marca", modelo: "Modelo" };

export interface Diferenca {
  campo: CampoConferido;
  antes: string | number | null;
  depois: string | number | null;
  /** Pronta para a tela: "Preço: de R$ 50.000 para R$ 47.000". */
  descricao: string;
}

export interface ConferenciaPublicacao {
  estado: EstadoConferencia;
  /** ISO UTC de quando foi conferido. */
  em: string;
  diferencas: Diferenca[];
  /** Por que não deu para conferir (estado "nao_conferiu"), em português para a tela. */
  motivo: string | null;
  /** Máquina: "erro_leitura", "tempo_esgotado", "bloqueado:captcha", "pagina_inexistente", "leitura_incompleta", "sem_referencia"... */
  codigo: string | null;
  /** O que o site mostrava na hora da conferência. */
  dadoLido: Record<string, unknown> | null;
}

// ------------------------------------------------------------ política

export const CHAVE_VALIDADE_CONFERENCIA = "conferencia.validade_minutos";
/** Conferido há menos que isto dispensa reler. */
export const VALIDADE_CONFERENCIA_PADRAO_MIN = 30;
export const CHAVE_EXIGIR_CONFERENCIA = "conferencia.exigir";
/**
 * Com isto ligado, reivindicarPublicacao só deixa publicar se houver uma
 * conferência "ok" ainda válida. Fica DESLIGADO por padrão só até o painel/
 * publicador chamar conferirAntesDePublicar; depois disso, trocar para true
 * (ou gravar o ajuste "1") é o passo que fecha a porta.
 */
export const EXIGIR_CONFERENCIA_PADRAO = false;

export function validadeConferenciaMin(db: Database.Database): number {
  const n = Number(obterAjuste(db, CHAVE_VALIDADE_CONFERENCIA));
  return Number.isFinite(n) && n >= 0 ? n : VALIDADE_CONFERENCIA_PADRAO_MIN;
}
export function definirValidadeConferenciaMin(db: Database.Database, minutos: number): void {
  if (!Number.isFinite(minutos) || minutos < 0) throw new Error("validade da conferência: número de minutos >= 0");
  definirAjuste(db, CHAVE_VALIDADE_CONFERENCIA, String(minutos));
}
export function exigirConferencia(db: Database.Database): boolean {
  const v = obterAjuste(db, CHAVE_EXIGIR_CONFERENCIA);
  return v === undefined ? EXIGIR_CONFERENCIA_PADRAO : v === "1" || v === "true";
}
export function definirExigirConferencia(db: Database.Database, exigir: boolean): void {
  definirAjuste(db, CHAVE_EXIGIR_CONFERENCIA, exigir ? "1" : "0");
}

export function conferenciaVale(c: ConferenciaPublicacao | null, agora: Date, validadeMin: number): boolean {
  if (!c || c.estado !== "ok") return false;
  const t = Date.parse(c.em);
  return Number.isFinite(t) && agora.getTime() - t < validadeMin * 60_000;
}

// ----------------------------------------------------------- comparação

function formatar(campo: CampoConferido, v: string | number | null): string {
  if (v === null) return "(vazio)";
  if (campo === "preco" && typeof v === "number") return `R$ ${v.toLocaleString("pt-BR")}`;
  if (campo === "km" && typeof v === "number") return `${v.toLocaleString("pt-BR")} km`;
  return String(v);
}

const norm = (v: unknown): string | number | undefined =>
  typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\s+/g, " ").toLowerCase() : undefined;

export interface ComparacaoDados {
  diferencas: Diferenca[];
  /** Campos que o vídeo mostra e a releitura NÃO trouxe: leitura incompleta, não é "mudou". */
  faltandoNaLeitura: CampoConferido[];
}

/**
 * `noVideo` é o snapshot; `lido` é o site agora. Regras:
 *  - igual (texto sem diferença de caixa/espaço, número exato): sem diferença;
 *  - campo no vídeo e AUSENTE na releitura: leitura incompleta (não vira "mudou",
 *    porque quase sempre é o site/layout falhando, não o carro mudando);
 *  - campo que o vídeo não mostra: ignorado (o vídeo não afirmou nada).
 */
export function compararDados(noVideo: Record<string, unknown>, lido: Record<string, unknown>): ComparacaoDados {
  const diferencas: Diferenca[] = [];
  const faltandoNaLeitura: CampoConferido[] = [];
  for (const campo of CAMPOS_CONFERIDOS) {
    const a = norm(noVideo[campo]);
    if (a === undefined) continue;
    const b = norm(lido[campo]);
    if (b === undefined) {
      faltandoNaLeitura.push(campo);
      continue;
    }
    if (a === b) continue;
    const antes = noVideo[campo] as string | number;
    const depois = lido[campo] as string | number;
    diferencas.push({
      campo, antes, depois,
      descricao: `${ROTULO[campo]}: de ${formatar(campo, antes)} para ${formatar(campo, depois)}`,
    });
  }
  return { diferencas, faltandoNaLeitura };
}

// ---------------------------------------------------------- persistência

/** O dado que entrou no vídeo (snapshot do render). Null: vídeo antigo, sem registro. */
export function lerDadoDoVideo(db: Database.Database, videoId: number): Record<string, unknown> | null {
  const l = db.prepare("SELECT dados_snapshot_json AS s FROM video WHERE id = ?").get(videoId) as { s: string | null } | undefined;
  if (!l?.s) return null;
  try {
    return JSON.parse(l.s) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function lerConferencia(estado: string | null, em: string | null, json: string | null): ConferenciaPublicacao | null {
  if (!estado || !em) return null;
  let extra: Partial<ConferenciaPublicacao> = {};
  try {
    if (json) extra = JSON.parse(json) as Partial<ConferenciaPublicacao>;
  } catch {
    extra = {};
  }
  return {
    estado: estado as EstadoConferencia,
    em,
    diferencas: extra.diferencas ?? [],
    motivo: extra.motivo ?? null,
    codigo: extra.codigo ?? null,
    dadoLido: extra.dadoLido ?? null,
  };
}

/** Guarda o resultado junto da publicação, para o painel mostrar. */
export function gravarConferencia(db: Database.Database, publicacaoId: number, c: ConferenciaPublicacao): void {
  db.prepare(
    "UPDATE publicacao SET conferencia_estado = ?, conferencia_em = ?, conferencia_json = ? WHERE id = ?",
  ).run(
    c.estado, c.em,
    JSON.stringify({ diferencas: c.diferencas, motivo: c.motivo, codigo: c.codigo, dadoLido: c.dadoLido }),
    publicacaoId,
  );
}

/**
 * Depois de "mudou" ou "não consegui conferir": a pessoa pede uma nova
 * tentativa, opcionalmente depois de uma espera. Limpa o resultado (a próxima
 * passagem do publicador reconfere) e adia a publicação por `esperaMin`.
 * Não gasta tentativa e não vira erro.
 */
export function liberarParaNovaConferencia(db: Database.Database, publicacaoId: number, esperaMin: number, agora: Date): void {
  if (!Number.isFinite(esperaMin) || esperaMin < 0) throw new Error("espera: minutos >= 0");
  const r = db
    .prepare(
      `UPDATE publicacao SET conferencia_estado = NULL, conferencia_em = NULL, conferencia_json = NULL,
         proxima_tentativa_em = ?, atualizado_em = ?
       WHERE id = ? AND estado = 'agendada'`,
    )
    .run(esperaMin > 0 ? new Date(agora.getTime() + esperaMin * 60_000).toISOString() : null, agora.toISOString(), publicacaoId);
  if (r.changes === 0) throw new Error(`publicação ${publicacaoId} não está agendada`);
}
