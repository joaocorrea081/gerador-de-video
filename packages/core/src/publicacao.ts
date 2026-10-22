// Motor de publicação: contas por rede, calendário e fila (Etapa 6, parte A).
// Regras duras: só vídeo APROVADO entra no calendário; a mesma publicação
// (vídeo, rede) nunca tem duas linhas; segredo nunca sai daqui por consulta
// pública (só lerSegredosConta, usada pelo provedor de rede).

import type Database from "better-sqlite3";
import { ErroPortao, obterVideo } from "./repositorio.js";
import { REDES, type Rede } from "./midia.js";
import { sistemaPausado } from "./pausa.js";
import { conferenciaVale, exigirConferencia, lerConferencia, validadeConferenciaMin, type ConferenciaPublicacao } from "./conferencia.js";

export { REDES, type Rede };

export class ErroPublicacao extends ErroPortao {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly codigo: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(mensagem);
  }
}

export const NOMES_REDE: Record<Rede, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

export function exigirRede(valor: unknown): Rede {
  if (typeof valor !== "string" || !(REDES as readonly string[]).includes(valor)) {
    throw new ErroPublicacao(`rede inválida — use uma de: ${REDES.join(", ")}`, 400, "rede_invalida");
  }
  return valor as Rede;
}

/** Escopos que cada rede exige (PUBLICACAO.md; TikTok: video.publish do Content Posting API). */
export const ESCOPOS_EXIGIDOS: Record<Rede, readonly string[]> = {
  instagram: ["instagram_business_basic", "instagram_business_content_publish"],
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  tiktok: ["video.publish"],
};

/** Limite de caracteres da legenda por rede. Instagram: 2.200 (Meta, error codes). TikTok e Facebook: 2.200 adotado por prudência. */
export const LIMITE_LEGENDA: Record<Rede, number> = { instagram: 2200, facebook: 2200, tiktok: 2200 };
export const MAXIMO_HASHTAGS: Record<Rede, number> = { instagram: 30, facebook: 30, tiktok: 30 };

/** Limite fixo por 24h. Instagram não entra: a fonte de verdade é a consulta à API. */
export const LIMITE_DIARIO_FIXO: Partial<Record<Rede, number>> = { facebook: 30 };

export const MAXIMO_TENTATIVAS_PUBLICACAO = 10;
export const ESPERA_BASE_MS = 5 * 60_000;
export const ESPERA_TETO_MS = 4 * 3_600_000;
export const ESPACAMENTO_PADRAO_MINUTOS = 60;
const DIA_MS = 24 * 3_600_000;

/** Espera crescente: 5, 10, 20, 40, 80, 160, 240, 240... min (soma das 9 esperas ~20,5h, cobre uma queda como a de fev/2026). */
export function esperaDaTentativa(tentativasFeitas: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** Math.max(0, tentativasFeitas - 1), ESPERA_TETO_MS);
}

// ---------------------------------------------------------------- ajustes

function ajuste(db: Database.Database, chave: string): string | undefined {
  return (db.prepare("SELECT valor FROM ajuste WHERE chave = ?").get(chave) as { valor: string } | undefined)?.valor;
}
export function gravarAjuste(db: Database.Database, chave: string, valor: string): void {
  db.prepare("INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(chave, valor);
}
export function lerAjusteNumero(db: Database.Database, chave: string, padrao: number): number {
  const n = Number(ajuste(db, chave));
  return ajuste(db, chave) !== undefined && Number.isFinite(n) && n >= 0 ? n : padrao;
}
export function lerAjusteTexto(db: Database.Database, chave: string): string | undefined {
  return ajuste(db, chave);
}
export const CHAVE_ESPACAMENTO = "publicacao.espacamento_minutos";
export function espacamentoMinutos(db: Database.Database): number {
  return lerAjusteNumero(db, CHAVE_ESPACAMENTO, ESPACAMENTO_PADRAO_MINUTOS);
}

// ----------------------------------------------------------------- contas

export interface ContaRede {
  rede: Rede;
  conectada: boolean;
  modo: "seco" | "real" | null;
  contaId: string | null;
  contaNome: string | null;
  tokenExpiraEm: string | null;
  refreshExpiraEm: string | null;
  escopos: string[];
  aprovacaoPlataforma: boolean;
  atualizadoEm: string;
}

export interface SegredosConta {
  accessToken: string | null;
  refreshToken: string | null;
}

interface LinhaConta {
  rede: Rede;
  conectada: number;
  modo: "seco" | "real" | null;
  conta_id: string | null;
  conta_nome: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expira_em: string | null;
  refresh_expira_em: string | null;
  escopos_json: string;
  aprovacao_plataforma: number;
  atualizado_em: string;
}

function contaVazia(rede: Rede): ContaRede {
  return {
    rede, conectada: false, modo: null, contaId: null, contaNome: null, tokenExpiraEm: null,
    refreshExpiraEm: null, escopos: [], aprovacaoPlataforma: false, atualizadoEm: "",
  };
}

/** Visão pública da conta: NUNCA inclui token. */
export function obterConta(db: Database.Database, rede: Rede): ContaRede {
  const l = db.prepare("SELECT * FROM conta_rede WHERE rede = ?").get(rede) as LinhaConta | undefined;
  if (!l) return contaVazia(rede);
  let escopos: string[] = [];
  try { escopos = JSON.parse(l.escopos_json) as string[]; } catch { escopos = []; }
  return {
    rede, conectada: l.conectada === 1, modo: l.modo, contaId: l.conta_id, contaNome: l.conta_nome,
    tokenExpiraEm: l.token_expira_em, refreshExpiraEm: l.refresh_expira_em, escopos,
    aprovacaoPlataforma: l.aprovacao_plataforma === 1, atualizadoEm: l.atualizado_em,
  };
}

export function listarContas(db: Database.Database): ContaRede[] {
  return REDES.map((r) => obterConta(db, r));
}

/** Só para o provedor de rede. Nunca devolver em rota. */
export function lerSegredosConta(db: Database.Database, rede: Rede): SegredosConta {
  const l = db.prepare("SELECT access_token, refresh_token FROM conta_rede WHERE rede = ?").get(rede) as
    | { access_token: string | null; refresh_token: string | null } | undefined;
  return { accessToken: l?.access_token ?? null, refreshToken: l?.refresh_token ?? null };
}

function dataIso(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || Number.isNaN(Date.parse(valor))) {
    throw new ErroPublicacao(`campo "${campo}" precisa ser uma data ISO válida`, 400, "data_invalida");
  }
  return new Date(valor).toISOString();
}

export function conectarConta(db: Database.Database, rede: Rede, entrada: Record<string, unknown>, agora: Date): ContaRede {
  const t = agora.toISOString();
  const aprovacao = obterConta(db, rede).aprovacaoPlataforma ? 1 : 0;
  if (entrada["modo"] === "seco") {
    db.prepare(
      `INSERT OR REPLACE INTO conta_rede (rede, conectada, modo, conta_id, conta_nome, access_token, refresh_token,
         token_expira_em, refresh_expira_em, escopos_json, aprovacao_plataforma, atualizado_em)
       VALUES (?, 1, 'seco', ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
    ).run(rede, `seco-${rede}`, `Conta de teste (${NOMES_REDE[rede]}, modo seco)`,
      new Date(agora.getTime() + 60 * DIA_MS).toISOString(), JSON.stringify(ESCOPOS_EXIGIDOS[rede]), aprovacao, t);
    return obterConta(db, rede);
  }
  if (entrada["modo"] !== "real") {
    throw new ErroPublicacao('campo "modo" precisa ser "seco" ou "real"', 400, "modo_invalido");
  }
  const { accessToken, refreshToken, contaId, contaNome, escopos } = entrada;
  if (typeof accessToken !== "string" || accessToken.length < 8) {
    throw new ErroPublicacao('modo real exige "accessToken"', 400, "token_ausente");
  }
  if (typeof contaId !== "string" || contaId.length === 0) {
    throw new ErroPublicacao('modo real exige "contaId"', 400, "conta_ausente");
  }
  if (refreshToken !== undefined && typeof refreshToken !== "string") {
    throw new ErroPublicacao('"refreshToken" precisa ser texto', 400, "token_invalido");
  }
  if (!Array.isArray(escopos) || escopos.some((e) => typeof e !== "string")) {
    throw new ErroPublicacao('"escopos" precisa ser uma lista de textos', 400, "escopos_invalidos");
  }
  const expira = dataIso(entrada["expiraEm"], "expiraEm");
  const refreshExpira = entrada["refreshExpiraEm"] === undefined ? null : dataIso(entrada["refreshExpiraEm"], "refreshExpiraEm");
  db.prepare(
    `INSERT OR REPLACE INTO conta_rede (rede, conectada, modo, conta_id, conta_nome, access_token, refresh_token,
       token_expira_em, refresh_expira_em, escopos_json, aprovacao_plataforma, atualizado_em)
     VALUES (?, 1, 'real', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(rede, contaId, typeof contaNome === "string" ? contaNome : contaId, accessToken,
    refreshToken ?? null, expira, refreshExpira, JSON.stringify(escopos), aprovacao, t);
  return obterConta(db, rede);
}

export function desconectarConta(db: Database.Database, rede: Rede): ContaRede {
  db.prepare("DELETE FROM conta_rede WHERE rede = ?").run(rede);
  return obterConta(db, rede);
}

export function definirAprovacaoPlataforma(db: Database.Database, rede: Rede, aprovada: boolean, agora: Date): ContaRede {
  db.prepare(
    `INSERT INTO conta_rede (rede, conectada, aprovacao_plataforma, atualizado_em) VALUES (?, 0, ?, ?)
     ON CONFLICT(rede) DO UPDATE SET aprovacao_plataforma = excluded.aprovacao_plataforma, atualizado_em = excluded.atualizado_em`,
  ).run(rede, aprovada ? 1 : 0, agora.toISOString());
  return obterConta(db, rede);
}

export interface TokensRenovados {
  accessToken: string;
  /** Se a plataforma devolveu refresh novo (rotação), ele SUBSTITUI o antigo. Se vier vazio, mantém o antigo. */
  refreshToken?: string | undefined;
  expiraEm: string;
  refreshExpiraEm?: string | undefined;
}

/** Grava o token novo. É parte obrigatória do fluxo de renovação: sem isto o refresh rotacionado se perde. */
export function gravarTokensRenovados(db: Database.Database, rede: Rede, t: TokensRenovados, agora: Date): void {
  const r = db.prepare(
    `UPDATE conta_rede SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expira_em = ?,
       refresh_expira_em = COALESCE(?, refresh_expira_em), atualizado_em = ? WHERE rede = ?`,
  ).run(t.accessToken, t.refreshToken ?? null, t.expiraEm, t.refreshExpiraEm ?? null, agora.toISOString(), rede);
  if (r.changes === 0) throw new ErroPublicacao(`${NOMES_REDE[rede]} não está conectado`, 409, "nao_conectada");
}

export function tokenPrecisaRenovar(conta: ContaRede, agora: Date, folgaMs = DIA_MS): boolean {
  if (!conta.tokenExpiraEm) return false;
  return Date.parse(conta.tokenExpiraEm) <= agora.getTime() + folgaMs;
}

/** Troca qualquer segredo conhecido (tokens guardados + extras) por [segredo]. Usar em tudo que vira log ou resposta. */
export function redigirSegredos(db: Database.Database, texto: string, extras: readonly (string | undefined)[] = []): string {
  const segredos = new Set<string>();
  for (const l of db.prepare("SELECT access_token, refresh_token FROM conta_rede").all() as { access_token: string | null; refresh_token: string | null }[]) {
    if (l.access_token) segredos.add(l.access_token);
    if (l.refresh_token) segredos.add(l.refresh_token);
  }
  for (const e of extras) if (e) segredos.add(e);
  let saida = texto;
  for (const s of segredos) if (s.length >= 4) saida = saida.split(s).join("[segredo]");
  return saida;
}

// ------------------------------------------------------------ publicações

export type EstadoPublicacao = "agendada" | "publicando" | "publicada" | "falhou" | "cancelada" | "verificar";
export type Visibilidade = "publica" | "privada";

export interface Publicacao {
  id: number;
  videoId: number;
  rede: Rede;
  estado: EstadoPublicacao;
  agendadaPara: string;
  visibilidade: Visibilidade;
  iaGerado: boolean;
  legenda: string | null;
  tentativas: number;
  proximaTentativaEm: string | null;
  erro: string | null;
  idExterno: string | null;
  simulado: boolean;
  chaveIdempotencia: string;
  criadoEm: string;
  atualizadoEm: string;
  publicadaEm: string | null;
  /** Resultado da releitura antes de publicar (null = ainda não conferida). Ver conferencia.ts. */
  conferencia: ConferenciaPublicacao | null;
}

interface LinhaPublicacao {
  id: number; video_id: number; rede: Rede; estado: EstadoPublicacao; agendada_para: string;
  visibilidade: Visibilidade; ia_gerado: number; legenda: string | null; tentativas: number;
  proxima_tentativa_em: string | null; erro: string | null; id_externo: string | null; simulado: number;
  chave_idempotencia: string; criado_em: string; atualizado_em: string; publicada_em: string | null;
  conferencia_estado: string | null; conferencia_em: string | null; conferencia_json: string | null;
}

function paraPublicacao(l: LinhaPublicacao): Publicacao {
  return {
    id: l.id, videoId: l.video_id, rede: l.rede, estado: l.estado, agendadaPara: l.agendada_para,
    visibilidade: l.visibilidade, iaGerado: l.ia_gerado === 1, legenda: l.legenda, tentativas: l.tentativas,
    proximaTentativaEm: l.proxima_tentativa_em, erro: l.erro, idExterno: l.id_externo, simulado: l.simulado === 1,
    chaveIdempotencia: l.chave_idempotencia, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em, publicadaEm: l.publicada_em,
    conferencia: lerConferencia(l.conferencia_estado, l.conferencia_em, l.conferencia_json),
  };
}

export function obterPublicacao(db: Database.Database, id: number): Publicacao | undefined {
  const l = db.prepare("SELECT * FROM publicacao WHERE id = ?").get(id) as LinhaPublicacao | undefined;
  return l ? paraPublicacao(l) : undefined;
}

export function obterPublicacaoDoPar(db: Database.Database, videoId: number, rede: Rede): Publicacao | undefined {
  const l = db.prepare("SELECT * FROM publicacao WHERE video_id = ? AND rede = ?").get(videoId, rede) as LinhaPublicacao | undefined;
  return l ? paraPublicacao(l) : undefined;
}

export function listarPublicacoesDoVideo(db: Database.Database, videoId: number): Publicacao[] {
  return (db.prepare("SELECT * FROM publicacao WHERE video_id = ? ORDER BY rede").all(videoId) as LinhaPublicacao[]).map(paraPublicacao);
}

export interface PublicacaoNoCalendario extends Publicacao {
  videoTitulo: string | null;
}

/** Calendário: tudo que cai em [de, ate), qualquer estado, ordenado por instante. Datas em ISO UTC. */
export function listarCalendario(db: Database.Database, de: string, ate: string): PublicacaoNoCalendario[] {
  const linhas = db
    .prepare(
      `SELECT p.*, v.titulo AS video_titulo FROM publicacao p JOIN video v ON v.id = p.video_id
       WHERE p.agendada_para >= ? AND p.agendada_para < ? ORDER BY p.agendada_para, p.id`,
    )
    .all(de, ate) as (LinhaPublicacao & { video_titulo: string | null })[];
  return linhas.map((l) => ({ ...paraPublicacao(l), videoTitulo: l.video_titulo }));
}

/** Instantes (ms) já ocupados na rede: publicações vivas ou já publicadas. */
function instantesOcupados(db: Database.Database, rede: Rede, ignorarId: number | null): number[] {
  const linhas = db
    .prepare(
      `SELECT agendada_para, publicada_em FROM publicacao
       WHERE rede = ? AND estado IN ('agendada','publicando','publicada','verificar') AND id <> ?`,
    )
    .all(rede, ignorarId ?? -1) as { agendada_para: string; publicada_em: string | null }[];
  return linhas.map((l) => Date.parse(l.publicada_em ?? l.agendada_para)).sort((a, b) => a - b);
}

/** Primeiro instante >= `quando` que respeita o espaçamento mínimo contra todos os ocupados. */
export function proximoHorarioLivre(ocupados: readonly number[], quandoMs: number, espacamentoMs: number): number {
  let candidato = quandoMs;
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const o of ocupados) {
      if (Math.abs(candidato - o) < espacamentoMs && candidato < o + espacamentoMs) {
        candidato = o + espacamentoMs;
        mudou = true;
      }
    }
  }
  return candidato;
}

/**
 * Decisão sobre espaçamento: RECUSA (409) em vez de empurrar calado. Empurrar
 * mudaria a hora que o João/cliente escolheu sem ele ver; recusar com o
 * próximo horário livre na resposta deixa a pessoa decidir.
 */
function exigirEspacamento(db: Database.Database, rede: Rede, quandoMs: number, ignorarId: number | null): void {
  const esp = espacamentoMinutos(db) * 60_000;
  if (esp <= 0) return;
  const ocupados = instantesOcupados(db, rede, ignorarId);
  const livre = proximoHorarioLivre(ocupados, quandoMs, esp);
  if (livre !== quandoMs) {
    const sugerido = new Date(livre).toISOString();
    throw new ErroPublicacao(
      `Muito perto de outra publicação no ${NOMES_REDE[rede]}: o intervalo mínimo é de ${espacamentoMinutos(db)} minutos (evita ser barrado como spam). Próximo horário livre: ${sugerido}.`,
      409, "espacamento", { proximoHorarioLivre: sugerido, espacamentoMinutos: espacamentoMinutos(db) },
    );
  }
}

function exigirVideoAprovado(db: Database.Database, videoId: number): void {
  const v = obterVideo(db, videoId);
  if (!v) throw new ErroPublicacao(`vídeo ${videoId} não encontrado`, 404, "video_inexistente");
  // 'publicado' = já saiu em outra rede e continua aprovado para as demais.
  if (v.estado !== "aprovado" && v.estado !== "publicado") {
    throw new ErroPublicacao(
      `Só vídeo aprovado pode ser agendado. O vídeo ${videoId} está "${v.estado}". Aprove na fila primeiro.`,
      409, "video_nao_aprovado",
    );
  }
  exigirProdutoNoEstoque(db, videoId);
}

function exigirProdutoNoEstoque(db: Database.Database, videoId: number): void {
  const l = db
    .prepare("SELECT p.saiu_do_estoque_em AS s FROM video v JOIN produto p ON p.id = v.produto_id WHERE v.id = ?")
    .get(videoId) as { s: string | null } | undefined;
  if (l?.s) {
    throw new ErroPublicacao(
      "Este carro saiu do estoque do site (provavelmente vendido). Não dá para agendar a publicação.",
      409, "produto_fora_do_estoque", { saiuEm: l.s },
    );
  }
}

function exigirContaConectada(db: Database.Database, rede: Rede): void {
  const c = obterConta(db, rede);
  if (!c.conectada) {
    throw new ErroPublicacao(
      `${NOMES_REDE[rede]} não está conectado. Conecte a conta (ou o modo seco, para teste) antes de agendar.`,
      409, "nao_conectada",
    );
  }
}

function lerQuando(valor: unknown, agora: Date, permitirPassado: boolean): string {
  const iso = dataIso(valor, "quando");
  if (!permitirPassado && Date.parse(iso) < agora.getTime() - 60_000) {
    throw new ErroPublicacao("O horário já passou. Escolha um instante no futuro.", 400, "no_passado");
  }
  return iso;
}

export interface EntradaAgendar {
  videoId: number;
  rede: unknown;
  quando: unknown;
  iaGerado?: unknown;
  visibilidade?: unknown;
}

export function agendarPublicacao(db: Database.Database, e: EntradaAgendar, agora: Date, opcoes: { permitirPassado?: boolean } = {}): Publicacao {
  const rede = exigirRede(e.rede);
  exigirVideoAprovado(db, e.videoId);
  exigirContaConectada(db, rede);
  const quando = lerQuando(e.quando, agora, opcoes.permitirPassado ?? false);

  let visibilidade: Visibilidade = "publica";
  if (rede === "tiktok") {
    // O TikTok exige escolha manual, sem valor padrão (PUBLICACAO.md).
    if (e.visibilidade !== "publica" && e.visibilidade !== "privada") {
      throw new ErroPublicacao('TikTok exige escolher "visibilidade" ("publica" ou "privada"), sem valor padrão.', 400, "visibilidade_obrigatoria");
    }
    visibilidade = e.visibilidade;
  } else if (e.visibilidade !== undefined && e.visibilidade !== "publica") {
    throw new ErroPublicacao(`${NOMES_REDE[rede]} só publica em modo público por esta API.`, 400, "visibilidade_invalida");
  }
  if (e.iaGerado !== undefined && typeof e.iaGerado !== "boolean") {
    throw new ErroPublicacao('"iaGerado" precisa ser verdadeiro ou falso', 400, "ia_invalido");
  }
  const ia = e.iaGerado === true ? 1 : 0;

  const existente = obterPublicacaoDoPar(db, e.videoId, rede);
  if (existente && ["agendada", "publicando", "verificar"].includes(existente.estado)) {
    throw new ErroPublicacao(`Este vídeo já está ${existente.estado} no ${NOMES_REDE[rede]}. Use remarcar.`, 409, "ja_agendada", { publicacaoId: existente.id });
  }
  if (existente?.estado === "publicada") {
    throw new ErroPublicacao(`Este vídeo já foi publicado no ${NOMES_REDE[rede]}.`, 409, "ja_publicada", { publicacaoId: existente.id });
  }
  exigirEspacamento(db, rede, Date.parse(quando), existente?.id ?? null);

  const t = agora.toISOString();
  if (existente) {
    db.prepare(
      `UPDATE publicacao SET estado = 'agendada', agendada_para = ?, visibilidade = ?, ia_gerado = ?, tentativas = 0,
         proxima_tentativa_em = NULL, erro = NULL, atualizado_em = ?,
         conferencia_estado = NULL, conferencia_em = NULL, conferencia_json = NULL WHERE id = ?`,
    ).run(quando, visibilidade, ia, t, existente.id);
    return obterPublicacao(db, existente.id)!;
  }
  const r = db.prepare(
    `INSERT INTO publicacao (video_id, rede, estado, agendada_para, visibilidade, ia_gerado, chave_idempotencia, criado_em, atualizado_em)
     VALUES (?, ?, 'agendada', ?, ?, ?, ?, ?, ?)`,
  ).run(e.videoId, rede, quando, visibilidade, ia, `video-${e.videoId}:${rede}`, t, t);
  return obterPublicacao(db, Number(r.lastInsertRowid))!;
}

export function desmarcarPublicacao(db: Database.Database, id: number, agora: Date): Publicacao {
  const p = obterPublicacao(db, id);
  if (!p) throw new ErroPublicacao(`publicação ${id} não encontrada`, 404, "publicacao_inexistente");
  if (p.estado !== "agendada" && p.estado !== "falhou" && p.estado !== "verificar") {
    throw new ErroPublicacao(`Não dá para desmarcar uma publicação "${p.estado}".`, 409, "estado_invalido");
  }
  db.prepare("UPDATE publicacao SET estado = 'cancelada', proxima_tentativa_em = NULL, atualizado_em = ? WHERE id = ?").run(agora.toISOString(), id);
  return obterPublicacao(db, id)!;
}

export function remarcarPublicacao(db: Database.Database, id: number, quandoBruto: unknown, agora: Date): Publicacao {
  const p = obterPublicacao(db, id);
  if (!p) throw new ErroPublicacao(`publicação ${id} não encontrada`, 404, "publicacao_inexistente");
  if (p.estado === "publicando" || p.estado === "publicada") {
    throw new ErroPublicacao(`Não dá para remarcar uma publicação "${p.estado}".`, 409, "estado_invalido");
  }
  exigirVideoAprovado(db, p.videoId);
  exigirContaConectada(db, p.rede);
  const quando = lerQuando(quandoBruto, agora, false);
  exigirEspacamento(db, p.rede, Date.parse(quando), p.id);
  db.prepare(
    `UPDATE publicacao SET estado = 'agendada', agendada_para = ?, tentativas = 0, proxima_tentativa_em = NULL,
       erro = NULL, atualizado_em = ?,
       conferencia_estado = NULL, conferencia_em = NULL, conferencia_json = NULL WHERE id = ?`,
  ).run(quando, agora.toISOString(), id);
  return obterPublicacao(db, id)!;
}

// ------------------------------------------------------------- a fila

/**
 * Travas que valem para QUALQUER publicação nova (SQL, para ser atômico com a
 * reivindicação): carro que saiu do estoque, e conferência que achou mudança
 * ou não conseguiu conferir. Só ADICIONAM barreira; aprovação humana e
 * idempotência (vídeo, rede) continuam como estavam.
 */
const SEM_TRAVA_SQL = `
  NOT EXISTS (SELECT 1 FROM video v JOIN produto p ON p.id = v.produto_id
              WHERE v.id = publicacao.video_id AND p.saiu_do_estoque_em IS NOT NULL)
  AND (publicacao.conferencia_estado IS NULL OR publicacao.conferencia_estado = 'ok')`;

/**
 * Publicações que já venceram e podem tentar (agendada, hora chegou, espera da
 * tentativa passou). Sistema pausado: nenhuma. Carro fora do estoque ou
 * conferência pendente de decisão: ficam de fora (continuam 'agendada', e
 * aparecem nos alertas/painel para a pessoa decidir).
 */
export function publicacoesVencidas(db: Database.Database, agora: Date): Publicacao[] {
  if (sistemaPausado(db)) return [];
  const t = agora.toISOString();
  return (
    db.prepare(
      `SELECT * FROM publicacao WHERE estado = 'agendada' AND agendada_para <= ?
         AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= ?) AND ${SEM_TRAVA_SQL}
       ORDER BY agendada_para, id`,
    ).all(t, t) as LinhaPublicacao[]
  ).map(paraPublicacao);
}

/**
 * Reivindicação atômica: só UM chamador consegue passar de 'agendada' para
 * 'publicando'. É também a última porta antes de enviar: recusa com o sistema
 * pausado, com carro fora do estoque, com conferência pendente de decisão e,
 * se `conferencia.exigir` estiver ligado, sem uma conferência "ok" ainda válida.
 * Depois de reivindicada, a publicação NÃO é interrompida por pausa nenhuma.
 */
export function reivindicarPublicacao(db: Database.Database, id: number, agora: Date): boolean {
  if (sistemaPausado(db)) return false;
  if (exigirConferencia(db)) {
    const p = obterPublicacao(db, id);
    if (!p || !conferenciaVale(p.conferencia, agora, validadeConferenciaMin(db))) return false;
  }
  return (
    db.prepare(
      `UPDATE publicacao SET estado = 'publicando', atualizado_em = ? WHERE id = ? AND estado = 'agendada' AND ${SEM_TRAVA_SQL}`,
    ).run(agora.toISOString(), id).changes === 1
  );
}

export interface PublicacaoReagendada { publicacaoId: number; rede: Rede; de: string; para: string }

/**
 * Ao despausar: o que venceu DURANTE a pausa sairia tudo de uma vez, furando o
 * espaçamento mínimo entre posts (risco de ser barrado como spam). Reescalona
 * só as 'agendada' já vencidas, em fila, respeitando o espaçamento a partir de
 * agora. Não toca no que está no futuro, nem no que já saiu.
 */
export function reagendarVencidasAposPausa(db: Database.Database, agora: Date): PublicacaoReagendada[] {
  const esp = espacamentoMinutos(db) * 60_000;
  if (esp <= 0) return [];
  const t = agora.toISOString();
  const vencidas = db
    .prepare("SELECT id, rede, agendada_para FROM publicacao WHERE estado = 'agendada' AND agendada_para <= ? ORDER BY agendada_para, id")
    .all(t) as { id: number; rede: Rede; agendada_para: string }[];
  const feitas: PublicacaoReagendada[] = [];
  for (const v of vencidas) {
    const ocupados = instantesOcupados(db, v.rede, v.id);
    const livre = proximoHorarioLivre(ocupados, agora.getTime(), esp);
    if (livre === Date.parse(v.agendada_para)) continue;
    const para = new Date(livre).toISOString();
    db.prepare("UPDATE publicacao SET agendada_para = ?, atualizado_em = ? WHERE id = ?").run(para, t, v.id);
    feitas.push({ publicacaoId: v.id, rede: v.rede, de: v.agendada_para, para });
  }
  return feitas;
}

export function marcarPublicada(
  db: Database.Database, id: number, r: { idExterno: string; simulado: boolean; legenda: string }, agora: Date,
): Publicacao {
  const p = obterPublicacao(db, id)!;
  const t = agora.toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE publicacao SET estado = 'publicada', id_externo = ?, simulado = ?, legenda = ?, erro = NULL,
         proxima_tentativa_em = NULL, publicada_em = ?, atualizado_em = ? WHERE id = ?`,
    ).run(r.idExterno, r.simulado ? 1 : 0, r.legenda, t, t, id);
    // Vídeo só vira "publicado" com publicação REAL. Simulada nunca finge.
    if (!r.simulado) db.prepare("UPDATE video SET estado = 'publicado', atualizado_em = ? WHERE id = ?").run(t, p.videoId);
  })();
  return obterPublicacao(db, id)!;
}

/**
 * Falha: transitória volta para 'agendada' com espera crescente até o teto de
 * tentativas; permanente (ou teto estourado) vira 'falhou'. Erro fica legível.
 */
export function registrarFalhaPublicacao(
  db: Database.Database, id: number, mensagem: string, transitorio: boolean, agora: Date,
): Publicacao {
  const p = obterPublicacao(db, id)!;
  const tentativas = p.tentativas + 1;
  const t = agora.toISOString();
  if (transitorio && tentativas < MAXIMO_TENTATIVAS_PUBLICACAO) {
    const proxima = new Date(agora.getTime() + esperaDaTentativa(tentativas)).toISOString();
    db.prepare("UPDATE publicacao SET estado = 'agendada', tentativas = ?, proxima_tentativa_em = ?, erro = ?, atualizado_em = ? WHERE id = ?")
      .run(tentativas, proxima, mensagem, t, id);
  } else {
    const msg = transitorio ? `${mensagem} (desisti após ${tentativas} tentativas)` : mensagem;
    db.prepare("UPDATE publicacao SET estado = 'falhou', tentativas = ?, proxima_tentativa_em = NULL, erro = ?, atualizado_em = ? WHERE id = ?")
      .run(tentativas, msg, t, id);
  }
  return obterPublicacao(db, id)!;
}

/** Volta para 'agendada' SEM gastar tentativa (limite diário: não é falha). */
export function adiarPublicacao(db: Database.Database, id: number, ateMs: number, motivo: string, agora: Date): Publicacao {
  db.prepare("UPDATE publicacao SET estado = 'agendada', proxima_tentativa_em = ?, erro = ?, atualizado_em = ? WHERE id = ?")
    .run(new Date(ateMs).toISOString(), motivo, agora.toISOString(), id);
  return obterPublicacao(db, id)!;
}

/**
 * Após queda: o que ficou 'publicando' pode ou não ter saído na rede. Refazer
 * arriscaria publicar em dobro, então vira 'verificar' — a pessoa confere na
 * rede e remarca (ou desmarca). Chamar uma vez ao subir o servidor.
 */
export function recuperarPublicacoesOrfas(db: Database.Database, agora: Date): number {
  return db.prepare(
    `UPDATE publicacao SET estado = 'verificar', atualizado_em = ?,
       erro = 'O processo caiu no meio da publicação. Confira na rede se o vídeo saiu antes de remarcar.'
     WHERE estado = 'publicando'`,
  ).run(agora.toISOString()).changes;
}

/** `excluirChave`: a publicação em curso não conta contra o próprio limite. */
export function contarUltimas24h(db: Database.Database, rede: Rede, agora: Date, excluirChave = ""): { total: number; maisAntigoMs: number | null } {
  const desde = new Date(agora.getTime() - DIA_MS).toISOString();
  const l = db.prepare(
    `SELECT COUNT(*) AS n, MIN(COALESCE(publicada_em, atualizado_em)) AS mais_antigo FROM publicacao
     WHERE rede = ? AND estado IN ('publicada','publicando') AND COALESCE(publicada_em, atualizado_em) > ? AND chave_idempotencia <> ?`,
  ).get(rede, desde, excluirChave) as { n: number; mais_antigo: string | null };
  return { total: l.n, maisAntigoMs: l.mais_antigo ? Date.parse(l.mais_antigo) : null };
}

// ---------------------------------------------------------------- legenda

export interface LegendaVideo { videoId: number; rede: Rede; texto: string; manual: boolean; atualizadoEm: string }

export function listarLegendas(db: Database.Database, videoId: number): LegendaVideo[] {
  return (
    db.prepare("SELECT * FROM legenda_video WHERE video_id = ? ORDER BY rede").all(videoId) as
      { video_id: number; rede: Rede; texto: string; manual: number; atualizado_em: string }[]
  ).map((l) => ({ videoId: l.video_id, rede: l.rede, texto: l.texto, manual: l.manual === 1, atualizadoEm: l.atualizado_em }));
}

export function gravarLegenda(db: Database.Database, videoId: number, rede: Rede, texto: string, manual: boolean, agora: Date): LegendaVideo {
  if (!obterVideo(db, videoId)) throw new ErroPublicacao(`vídeo ${videoId} não encontrado`, 404, "video_inexistente");
  const limite = LIMITE_LEGENDA[rede];
  if (texto.trim().length === 0) throw new ErroPublicacao("A legenda não pode ficar vazia.", 400, "legenda_vazia");
  if ([...texto].length > limite) {
    throw new ErroPublicacao(`Legenda com ${[...texto].length} caracteres; o limite do ${NOMES_REDE[rede]} é ${limite}.`, 400, "legenda_longa");
  }
  db.prepare(
    `INSERT INTO legenda_video (video_id, rede, texto, manual, atualizado_em) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(video_id, rede) DO UPDATE SET texto = excluded.texto, manual = excluded.manual, atualizado_em = excluded.atualizado_em`,
  ).run(videoId, rede, texto, manual ? 1 : 0, agora.toISOString());
  return listarLegendas(db, videoId).find((l) => l.rede === rede)!;
}
