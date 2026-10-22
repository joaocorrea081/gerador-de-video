// Horário para a tela: o servidor guarda ISO UTC, a pessoa lê Brasília.
// O fuso é sempre Brasília; o que muda com o idioma é o jeito de escrever (ordem, separador, nome do fuso).
import { t, tOpcional } from "./idioma/index.js";

const FUSO = "America/Sao_Paulo";

// Os campos vêm do Intl em en-GB só para ter números de dois dígitos; a montagem é do catálogo.
const FORMATO = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "21/10/2026 12:00 (Brasília)" em português; o formato muda com o idioma. Vazio ou inválido vira o texto de reserva. */
export function formatarBrasilia(iso: string | null | undefined, reserva?: string): string {
  const alternativa = reserva ?? t("tempo.nunca");
  if (!iso) return alternativa;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return alternativa;
  const partes = Object.fromEntries(FORMATO.formatToParts(d).map((p) => [p.type, p.value]));
  const hora = partes["hour"] === "24" ? "00" : (partes["hour"] ?? "00");
  return `${t("tempo.formato", { d: partes["day"] ?? "", m: partes["month"] ?? "", y: partes["year"] ?? "", h: hora, min: partes["minute"] ?? "" })} ${t("tempo.fuso")}`;
}

/** "1 min 30 s", "45 s". */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return t("tempo.seg", { s });
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r === 0 ? t("tempo.min", { m }) : t("tempo.minseg", { m, s: r });
  const h = Math.floor(m / 60);
  return t("tempo.horamin", { h, m: m % 60 });
}

// ---------------------------------------------------------------- calendário
// Brasília é UTC-3 o ano todo: o horário de verão foi extinto em 2019 (Decreto 9.772/2019).
// Por isso o calendário converte com deslocamento fixo; o cliente usa -03:00 pelo mesmo motivo.
const DESLOCAMENTO_HORAS = 3;

/** Nome curto do dia da semana (0 = domingo), do catálogo. */
export function diaCurto(indice: number): string {
  return tOpcional(`cal.dia.${indice}`) ?? "";
}

/** "outubro de 2026": mês e ano por extenso, no idioma da pessoa. */
export function mesPorExtenso(ymd: string, locale: string): string {
  const m = reYmd.exec(ymd)!;
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)),
  );
}

const reYmd = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valida "AAAA-MM-DD" de verdade (dia 31 de fevereiro não passa). */
export function ymdValido(v: string | null | undefined): v is string {
  if (!v) return false;
  const m = reYmd.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

/** Dia (AAAA-MM-DD) em Brasília de um instante. */
export function ymdBrasilia(d: Date): string {
  return new Date(d.getTime() - DESLOCAMENTO_HORAS * 3_600_000).toISOString().slice(0, 10);
}

export function somarDias(ymd: string, n: number): string {
  const m = reYmd.exec(ymd)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n)).toISOString().slice(0, 10);
}

/** 0 = domingo. */
export function diaDaSemana(ymd: string): number {
  const m = reYmd.exec(ymd)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** Meia-noite de Brasília daquele dia, em ISO UTC. */
export function inicioDoDiaUtc(ymd: string): string {
  const m = reYmd.exec(ymd)!;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), DESLOCAMENTO_HORAS)).toISOString();
}

/** "HH:MM" em Brasília. */
export function horaBrasilia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return new Date(d.getTime() - DESLOCAMENTO_HORAS * 3_600_000).toISOString().slice(11, 16);
}

/** Dia (AAAA-MM-DD) em Brasília de um ISO UTC. */
export function ymdDeIso(iso: string): string {
  return ymdBrasilia(new Date(iso));
}

/** "21/10" (ou "21.10"). */
export function diaMes(ymd: string): string {
  return t("tempo.diaMes", { d: ymd.slice(8, 10), m: ymd.slice(5, 7) });
}
