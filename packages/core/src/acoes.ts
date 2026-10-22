// Ações do painel por baixo das telas (Etapa 5, parte A): refazer vídeo,
// editar/gravar texto, agendamento, progresso da fila e estoque.
// Tudo aqui é regra de negócio sobre o banco; HTTP fica em packages/portao.
//
// Regra dura (REGRAS-DE-NEGOCIO.md): preço, ano, km e modelo vêm do dado lido.
// Nenhuma função daqui escreve em `produto`, e as de texto só leem
// `titulo` e `corpo` da entrada.

import type Database from "better-sqlite3";
import { produtoSaiuDoEstoque } from "./estoque.js";
import { criarVideoComJob, ErroPortao, obterVideo } from "./repositorio.js";
import {
  FUNDOS_ESCOLHA,
  RITMOS_ESCOLHA,
  type EstadoVideo,
  type FundoEscolha,
  type Job,
  type RitmoEscolha,
  type Video,
} from "./tipos.js";

export const LIMITE_TITULO_TEXTO = 80;
export const LIMITE_CORPO_TEXTO = 400;
/** Medido nesta máquina (ESTADO.md: ~47s de render; ~60s com folga). */
export const SEGUNDOS_POR_VIDEO_PADRAO = 60;
/** Quantos jobs concluídos mais recentes entram na média da estimativa. */
export const AMOSTRAS_ESTIMATIVA = 10;

// ---------------------------------------------------------------- vídeo

function contarFotosUsaveis(db: Database.Database, produtoId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM foto WHERE produto_id = ? AND caminho_local IS NOT NULL")
      .get(produtoId) as { n: number }
  ).n;
}

function lerFicha(db: Database.Database, produtoId: number): Record<string, unknown> {
  const l = db.prepare("SELECT dados_json FROM produto WHERE id = ?").get(produtoId) as
    | { dados_json: string }
    | undefined;
  return l ? (JSON.parse(l.dados_json) as Record<string, unknown>) : {};
}

/** Texto padrão enquanto o escritor não rodou: a ficha lida, sem inventar nada. */
export function textoPadraoDaFicha(dados: Record<string, unknown>): { titulo: string; corpo: string } {
  const titulo = [dados["marca"], dados["modelo"]].filter(Boolean).join(" ");
  const corpo = [titulo, dados["ano"]].filter(Boolean).join(" ");
  return { titulo, corpo };
}

/** Cria vídeo + job novo para um produto, com texto padrão da ficha. Sem checar se já existe vídeo. */
export function criarVideoDaFicha(
  db: Database.Database,
  produtoId: number,
  escolhas: { fundo: FundoEscolha; ritmo: RitmoEscolha } = { fundo: "claro", ritmo: "calmo" },
): { video: Video; job: Job } {
  const { titulo, corpo } = textoPadraoDaFicha(lerFicha(db, produtoId));
  return criarVideoComJob(db, { produtoId, titulo, corpo, ...escolhas, ordemFotos: [] });
}

export interface EscolhasRefazer {
  fundo?: unknown;
  ritmo?: unknown;
  ordemFotos?: unknown;
}

/**
 * Refazer vídeo: enfileira um vídeo+job NOVO para o mesmo produto. O antigo
 * fica intacto. Só o cardápio fechado entra (fundo, ritmo, ordem das fotos);
 * o que não vier é herdado do vídeo anterior.
 */
export function refazerVideo(
  db: Database.Database,
  videoId: number,
  escolhas: EscolhasRefazer,
): { video: Video; job: Job } {
  const antigo = obterVideo(db, videoId);
  if (!antigo) throw new ErroPortao(`vídeo ${videoId} não encontrado`);

  let fundo: FundoEscolha = antigo.fundo ?? "claro";
  if (escolhas.fundo !== undefined) {
    if (!(FUNDOS_ESCOLHA as readonly unknown[]).includes(escolhas.fundo)) {
      throw new ErroPortao(`fundo inválido — use um de: ${FUNDOS_ESCOLHA.join(", ")}`);
    }
    fundo = escolhas.fundo as FundoEscolha;
  }

  let ritmo: RitmoEscolha = antigo.ritmo ?? "calmo";
  if (escolhas.ritmo !== undefined) {
    if (!(RITMOS_ESCOLHA as readonly unknown[]).includes(escolhas.ritmo)) {
      throw new ErroPortao(`ritmo inválido — use um de: ${RITMOS_ESCOLHA.join(", ")}`);
    }
    ritmo = escolhas.ritmo as RitmoEscolha;
  }

  let ordemFotos: number[] = [];
  if (escolhas.ordemFotos !== undefined) {
    ordemFotos = validarOrdemFotos(escolhas.ordemFotos, contarFotosUsaveis(db, antigo.produtoId));
  } else if (antigo.ordemFotosJson) {
    try {
      ordemFotos = JSON.parse(antigo.ordemFotosJson) as number[];
    } catch {
      ordemFotos = [];
    }
  }

  const emAndamento = db
    .prepare("SELECT COUNT(*) AS n FROM video WHERE produto_id = ? AND estado IN ('rascunho','renderizando')")
    .get(antigo.produtoId) as { n: number };
  if (emAndamento.n > 0) {
    throw new ErroPortao("este produto já tem um vídeo na fila ou renderizando — espere terminar");
  }

  return criarVideoComJob(db, {
    produtoId: antigo.produtoId,
    titulo: antigo.titulo ?? "",
    corpo: antigo.corpo ?? "",
    fundo,
    ritmo,
    ordemFotos,
  });
}

/** Lista de índices únicos, dentro de [0, quantidadeFotos). Vazia = ordem original. */
export function validarOrdemFotos(valor: unknown, quantidadeFotos: number): number[] {
  if (!Array.isArray(valor)) throw new ErroPortao("ordemFotos deve ser uma lista de números");
  const vistos = new Set<number>();
  for (const i of valor) {
    if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= quantidadeFotos) {
      throw new ErroPortao(`ordemFotos tem índice inválido (o produto tem ${quantidadeFotos} foto(s))`);
    }
    if (vistos.has(i as number)) throw new ErroPortao("ordemFotos tem índice repetido");
    vistos.add(i as number);
  }
  return [...vistos];
}

// ---------------------------------------------------------------- texto

const ESTADOS_TEXTO_EDITAVEL: readonly EstadoVideo[] = ["rascunho", "aguardando_aprovacao", "rejeitado", "erro"];

/** Texto só muda enquanto ninguém aprovou: depois disso, mudar seria publicar sem aprovação. */
export function exigirTextoEditavel(db: Database.Database, videoId: number): Video {
  const video = obterVideo(db, videoId);
  if (!video) throw new ErroPortao(`vídeo ${videoId} não encontrado`);
  if (!ESTADOS_TEXTO_EDITAVEL.includes(video.estado)) {
    throw new ErroPortao(`o texto do vídeo ${videoId} não pode mudar no estado "${video.estado}"`);
  }
  return video;
}

/**
 * Edição manual. Lê SÓ `titulo` e `corpo` da entrada: qualquer outro campo
 * (preço, ano, km, modelo...) nem é olhado, e nada escreve em `produto`.
 */
export function editarTexto(db: Database.Database, videoId: number, entrada: unknown): Video {
  exigirTextoEditavel(db, videoId);
  const bruto = (entrada ?? {}) as Record<string, unknown>;
  const titulo = typeof bruto["titulo"] === "string" ? bruto["titulo"].trim() : "";
  const corpo = typeof bruto["corpo"] === "string" ? bruto["corpo"].trim() : "";
  if (!titulo) throw new ErroPortao('campo "titulo" é obrigatório');
  if (!corpo) throw new ErroPortao('campo "corpo" é obrigatório');
  if (titulo.length > LIMITE_TITULO_TEXTO) {
    throw new ErroPortao(`título passa de ${LIMITE_TITULO_TEXTO} caracteres`);
  }
  if (corpo.length > LIMITE_CORPO_TEXTO) {
    throw new ErroPortao(`corpo passa de ${LIMITE_CORPO_TEXTO} caracteres`);
  }
  db.prepare("UPDATE video SET titulo = ?, corpo = ?, atualizado_em = ? WHERE id = ?").run(
    titulo,
    corpo,
    new Date().toISOString(),
    videoId,
  );
  return obterVideo(db, videoId)!;
}

export interface SaidaEscritor {
  titulo: string;
  corpo: string;
  fundo: FundoEscolha;
  ritmo: RitmoEscolha;
  ordemFotos: readonly number[];
}

/**
 * Grava o que o escritor devolveu. `videoDesatualizado` é true quando as
 * escolhas mudaram: o MP4 que existe foi renderizado com as antigas e só
 * "refazer vídeo" o atualiza.
 */
export function gravarSaidaDoEscritor(
  db: Database.Database,
  videoId: number,
  saida: SaidaEscritor,
): { video: Video; videoDesatualizado: boolean } {
  const antes = exigirTextoEditavel(db, videoId);
  const ordemJson = JSON.stringify(saida.ordemFotos);
  db.prepare(
    "UPDATE video SET titulo = ?, corpo = ?, fundo = ?, ritmo = ?, ordem_fotos_json = ?, atualizado_em = ? WHERE id = ?",
  ).run(saida.titulo, saida.corpo, saida.fundo, saida.ritmo, ordemJson, new Date().toISOString(), videoId);
  const videoDesatualizado =
    antes.caminhoMp4 !== null &&
    (antes.fundo !== saida.fundo || antes.ritmo !== saida.ritmo || (antes.ordemFotosJson ?? "[]") !== ordemJson);
  return { video: obterVideo(db, videoId)!, videoDesatualizado };
}

/** Dados para montar o pedido ao escritor: ficha lida + quantas fotos + idioma. */
export function contextoParaEscritor(
  db: Database.Database,
  videoId: number,
): { dados: Record<string, unknown>; quantidadeFotos: number; idioma: string } {
  const video = obterVideo(db, videoId);
  if (!video) throw new ErroPortao(`vídeo ${videoId} não encontrado`);
  const idioma = (db.prepare("SELECT valor FROM ajuste WHERE chave = 'idioma_anuncio'").get() as
    | { valor: string }
    | undefined)?.valor;
  return {
    dados: lerFicha(db, video.produtoId),
    quantidadeFotos: contarFotosUsaveis(db, video.produtoId),
    idioma: idioma ?? "pt-BR",
  };
}

// ---------------------------------------------------------- agendamento

export interface FiltroCarros {
  marca?: string;
  anoMin?: number;
  anoMax?: number;
  precoMax?: number;
  kmMax?: number;
}

export interface ItemRodada {
  produtoId: number;
  url: string;
  caso: string;
  enfileirado: boolean;
  videoId?: number;
  motivo?: string;
}

export interface ResumoRodada {
  iniciadaEm: string;
  terminadaEm: string;
  itens: ItemRodada[];
  erro?: string;
  /** Quando a rodada percorreu sites cadastrados: como foi cada um. */
  sites?: ResultadoSiteRodada[];
}

export interface ResultadoSiteRodada {
  siteId: string;
  url: string;
  lidos: number;
  erro?: string;
  /** Por que o site não foi lido (ou foi pulado), em palavras de máquina: "navegador-indisponivel", "bloqueado:captcha", "pulado-agendada". */
  estado?: string;
  /** Carros que saíram do estoque (marcados nesta leitura) ou voltaram; `ignorada` = por que não se concluiu nada. */
  estoque?: { marcados: number[]; voltaram: number[]; ignorada?: string };
}

export interface Agendamento {
  ligado: boolean;
  intervaloMinutos: number;
  filtro: FiltroCarros;
  siteUrl: string;
  quantidade: number;
  /** ISO UTC. A conversão para Brasília é da tela. */
  ultimaRodada: string | null;
  proximaRodada: string | null;
  ultimoResultado: ResumoRodada | null;
}

export const INTERVALO_MINIMO_MIN = 5;
export const INTERVALO_MAXIMO_MIN = 10_080; // 1 semana
export const SITE_PADRAO = "https://rota66bh.com.br";
const QUANTIDADE_PADRAO = 10;

const K = {
  ligado: "agendamento.ligado",
  intervalo: "agendamento.intervalo_minutos",
  filtro: "agendamento.filtro",
  site: "agendamento.site_url",
  quantidade: "agendamento.quantidade",
  ultima: "agendamento.ultima_rodada",
  resultado: "agendamento.ultimo_resultado",
} as const;

function ajuste(db: Database.Database, chave: string): string | undefined {
  return (db.prepare("SELECT valor FROM ajuste WHERE chave = ?").get(chave) as { valor: string } | undefined)?.valor;
}

function gravarAjuste(db: Database.Database, chave: string, valor: string): void {
  db.prepare(
    "INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(chave, valor);
}

/** Próxima rodada (ISO UTC). Desligado = null. Ligado sem rodada anterior = agora (vence já). */
export function calcularProximaRodada(
  ag: Pick<Agendamento, "ligado" | "intervaloMinutos" | "ultimaRodada">,
  agora: Date,
): string | null {
  if (!ag.ligado) return null;
  if (!ag.ultimaRodada) return agora.toISOString();
  return new Date(new Date(ag.ultimaRodada).getTime() + ag.intervaloMinutos * 60_000).toISOString();
}

export function lerAgendamento(db: Database.Database, agora: Date = new Date()): Agendamento {
  const base = {
    ligado: ajuste(db, K.ligado) === "true",
    intervaloMinutos: Number(ajuste(db, K.intervalo) ?? 60),
    ultimaRodada: ajuste(db, K.ultima) ?? null,
  };
  const filtroBruto = ajuste(db, K.filtro);
  const resultadoBruto = ajuste(db, K.resultado);
  return {
    ...base,
    filtro: filtroBruto ? (JSON.parse(filtroBruto) as FiltroCarros) : {},
    siteUrl: ajuste(db, K.site) ?? SITE_PADRAO,
    quantidade: Number(ajuste(db, K.quantidade) ?? QUANTIDADE_PADRAO),
    proximaRodada: calcularProximaRodada(base, agora),
    ultimoResultado: resultadoBruto ? (JSON.parse(resultadoBruto) as ResumoRodada) : null,
  };
}

function numeroNaoNegativo(v: unknown, nome: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new ErroPortao(`filtro.${nome} deve ser um número maior ou igual a zero`);
  }
  return v;
}

export function validarFiltro(bruto: unknown): FiltroCarros {
  if (bruto === null) return {};
  if (typeof bruto !== "object" || Array.isArray(bruto)) throw new ErroPortao("filtro deve ser um objeto");
  const f = bruto as Record<string, unknown>;
  const saida: FiltroCarros = {};
  if (f["marca"] !== undefined && f["marca"] !== null && f["marca"] !== "") {
    if (typeof f["marca"] !== "string") throw new ErroPortao("filtro.marca deve ser texto");
    saida.marca = f["marca"].trim();
  }
  for (const campo of ["anoMin", "anoMax", "precoMax", "kmMax"] as const) {
    if (f[campo] !== undefined && f[campo] !== null) saida[campo] = numeroNaoNegativo(f[campo], campo);
  }
  if (saida.anoMin !== undefined && saida.anoMax !== undefined && saida.anoMin > saida.anoMax) {
    throw new ErroPortao("filtro.anoMin não pode ser maior que filtro.anoMax");
  }
  return saida;
}

/** Atualização parcial: só os campos que vierem. Campos desconhecidos são ignorados. */
export function salvarAgendamento(db: Database.Database, entrada: unknown, agora: Date = new Date()): Agendamento {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const gravar: [string, string][] = [];

  if (e["ligado"] !== undefined) {
    if (typeof e["ligado"] !== "boolean") throw new ErroPortao('"ligado" deve ser true ou false');
    gravar.push([K.ligado, String(e["ligado"])]);
  }
  if (e["intervaloMinutos"] !== undefined) {
    const n = e["intervaloMinutos"];
    if (!Number.isInteger(n) || (n as number) < INTERVALO_MINIMO_MIN || (n as number) > INTERVALO_MAXIMO_MIN) {
      throw new ErroPortao(`"intervaloMinutos" deve ser inteiro entre ${INTERVALO_MINIMO_MIN} e ${INTERVALO_MAXIMO_MIN}`);
    }
    gravar.push([K.intervalo, String(n)]);
  }
  if (e["filtro"] !== undefined) {
    gravar.push([K.filtro, JSON.stringify(validarFiltro(e["filtro"]))]);
  }
  if (e["siteUrl"] !== undefined) {
    let url: URL | undefined;
    try {
      url = typeof e["siteUrl"] === "string" ? new URL(e["siteUrl"]) : undefined;
    } catch {
      url = undefined;
    }
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
      throw new ErroPortao('"siteUrl" deve ser uma URL http ou https');
    }
    gravar.push([K.site, url.origin]);
  }
  if (e["quantidade"] !== undefined) {
    const n = e["quantidade"];
    if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 100) {
      throw new ErroPortao('"quantidade" deve ser inteiro entre 1 e 100');
    }
    gravar.push([K.quantidade, String(n)]);
  }

  db.transaction(() => {
    for (const [chave, valor] of gravar) gravarAjuste(db, chave, valor);
  })();
  return lerAgendamento(db, agora);
}

/** Guarda quando a rodada terminou (ISO UTC) e o que ela fez. */
export function registrarRodada(db: Database.Database, resumo: ResumoRodada): void {
  db.transaction(() => {
    gravarAjuste(db, K.ultima, resumo.terminadaEm);
    gravarAjuste(db, K.resultado, JSON.stringify(resumo));
  })();
}

/** Ligado e o horário da próxima rodada já passou. */
export function rodadaVencida(ag: Agendamento, agora: Date): boolean {
  return ag.ligado && ag.proximaRodada !== null && new Date(ag.proximaRodada).getTime() <= agora.getTime();
}

/** Filtro de "quais carros entram". Campo filtrado e ausente na ficha = não entra. */
export function passaFiltro(dados: Record<string, unknown>, filtro: FiltroCarros): boolean {
  if (filtro.marca !== undefined) {
    const marca = dados["marca"];
    if (typeof marca !== "string" || marca.trim().toLowerCase() !== filtro.marca.toLowerCase()) return false;
  }
  const num = (c: string): number | undefined => (typeof dados[c] === "number" ? (dados[c] as number) : undefined);
  const checar = (valor: number | undefined, ok: (v: number) => boolean): boolean =>
    valor !== undefined && ok(valor);
  if (filtro.anoMin !== undefined && !checar(num("ano"), (v) => v >= filtro.anoMin!)) return false;
  if (filtro.anoMax !== undefined && !checar(num("ano"), (v) => v <= filtro.anoMax!)) return false;
  if (filtro.precoMax !== undefined && !checar(num("preco"), (v) => v <= filtro.precoMax!)) return false;
  if (filtro.kmMax !== undefined && !checar(num("km"), (v) => v <= filtro.kmMax!)) return false;
  return true;
}

// ------------------------------------------------------------- progresso

export interface ProgressoFila {
  pendentes: number;
  emExecucao: { jobId: number; videoId: number; iniciadoEm: string; haSegundos: number } | null;
  segundosPorVideo: number;
  /** "historico" = média dos concluídos; "padrao" = 60s, quando não há histórico. */
  origemEstimativa: "historico" | "padrao";
  amostras: number;
  estimativaRestanteSegundos: number;
}

export function progressoFila(db: Database.Database, agora: Date = new Date()): ProgressoFila {
  const pendentes = (db.prepare("SELECT COUNT(*) AS n FROM job WHERE estado = 'pendente'").get() as { n: number }).n;
  const exec = db
    .prepare("SELECT id, video_id, iniciado_em FROM job WHERE estado = 'em_execucao' ORDER BY id DESC LIMIT 1")
    .get() as { id: number; video_id: number; iniciado_em: string | null } | undefined;

  const concluidos = db
    .prepare(
      `SELECT iniciado_em, terminado_em FROM job
       WHERE estado = 'concluido' AND iniciado_em IS NOT NULL AND terminado_em IS NOT NULL
       ORDER BY terminado_em DESC, id DESC LIMIT ?`,
    )
    .all(AMOSTRAS_ESTIMATIVA) as { iniciado_em: string; terminado_em: string }[];
  const duracoes = concluidos
    .map((j) => (new Date(j.terminado_em).getTime() - new Date(j.iniciado_em).getTime()) / 1000)
    .filter((s) => Number.isFinite(s) && s > 0);

  const origemEstimativa = duracoes.length > 0 ? "historico" : "padrao";
  const segundosPorVideo =
    duracoes.length > 0
      ? Math.round((duracoes.reduce((a, b) => a + b, 0) / duracoes.length) * 10) / 10
      : SEGUNDOS_POR_VIDEO_PADRAO;

  const emExecucao =
    exec && exec.iniciado_em
      ? {
          jobId: exec.id,
          videoId: exec.video_id,
          iniciadoEm: exec.iniciado_em,
          haSegundos: Math.max(0, Math.round((agora.getTime() - new Date(exec.iniciado_em).getTime()) / 1000)),
        }
      : null;

  const restanteDoAtual = emExecucao ? Math.max(0, segundosPorVideo - emExecucao.haSegundos) : 0;
  return {
    pendentes,
    emExecucao,
    segundosPorVideo,
    origemEstimativa,
    amostras: duracoes.length,
    estimativaRestanteSegundos: Math.round(pendentes * segundosPorVideo + restanteDoAtual),
  };
}

// --------------------------------------------------------------- estoque

export interface ItemEstoque {
  produtoId: number;
  origemUrl: string;
  ficha: Record<string, unknown>;
  quantidadeFotos: number;
  lidoEm: string;
  temVideo: boolean;
  totalVideos: number;
  video: { id: number; estado: EstadoVideo; temMp4: boolean } | null;
  /** ISO UTC de quando o carro foi dado como fora do estoque (vendido); null = no estoque. */
  saiuDoEstoqueEm: string | null;
}

export function listarEstoque(db: Database.Database): ItemEstoque[] {
  const produtos = db
    .prepare(
      `SELECT p.id, p.origem_url, p.dados_json, p.lido_em, p.saiu_do_estoque_em,
        (SELECT COUNT(*) FROM foto f WHERE f.produto_id = p.id) AS fotos,
        (SELECT COUNT(*) FROM video v WHERE v.produto_id = p.id) AS total_videos
       FROM produto p ORDER BY p.id DESC`,
    )
    .all() as {
    id: number;
    origem_url: string;
    dados_json: string;
    lido_em: string;
    saiu_do_estoque_em: string | null;
    fotos: number;
    total_videos: number;
  }[];
  const ultimoVideo = db.prepare(
    "SELECT id, estado, caminho_mp4 FROM video WHERE produto_id = ? ORDER BY id DESC LIMIT 1",
  );
  return produtos.map((p) => {
    const v = ultimoVideo.get(p.id) as { id: number; estado: EstadoVideo; caminho_mp4: string | null } | undefined;
    return {
      produtoId: p.id,
      origemUrl: p.origem_url,
      ficha: JSON.parse(p.dados_json) as Record<string, unknown>,
      quantidadeFotos: p.fotos,
      lidoEm: p.lido_em,
      temVideo: p.total_videos > 0,
      totalVideos: p.total_videos,
      video: v ? { id: v.id, estado: v.estado, temMp4: v.caminho_mp4 !== null } : null,
      saiuDoEstoqueEm: p.saiu_do_estoque_em,
    };
  });
}

/** "Gerar vídeo" do estoque: só para produto que ainda não tem nenhum. */
export function gerarVideoDoEstoque(db: Database.Database, produtoId: number): { video: Video; job: Job } {
  const existe = db.prepare("SELECT id FROM produto WHERE id = ?").get(produtoId);
  if (!existe) throw new ErroPortao(`produto ${produtoId} não encontrado`);
  if (produtoSaiuDoEstoque(db, produtoId)) {
    throw new ErroPortao(`produto ${produtoId} saiu do estoque do site — não dá para gerar vídeo dele`);
  }
  const tem = (db.prepare("SELECT COUNT(*) AS n FROM video WHERE produto_id = ?").get(produtoId) as { n: number }).n;
  if (tem > 0) throw new ErroPortao(`produto ${produtoId} já tem vídeo — use "refazer vídeo"`);
  return criarVideoDaFicha(db, produtoId);
}
