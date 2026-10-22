// Aplica a grade: elegibilidade por rede, previsão, encaixe real e "aprovar e agendar".
// Regras: só vídeo aprovado entra no calendário; nunca numa rede em que o vídeo
// não passa na validação; a idempotência (vídeo, rede) é a de agendarPublicacao.

import type Database from "better-sqlite3";
import { aprovarVideo, obterVideo } from "./repositorio.js";
import {
  ErroPublicacao, REDES, agendarPublicacao, espacamentoMinutos, obterConta, obterPublicacaoDoPar, type Publicacao, type Rede,
} from "./publicacao.js";
import {
  calcularEncaixe, limitesPadrao, lerPlano, ocupadosPorRede, type ItemEncaixe, type Plano, type SemVaga,
} from "./plano.js";
import { lerCaracteristicas, validarMidiaParaRede, type CaracteristicasMidia, type ProblemaMidia } from "./midia.js";
import type { Video } from "./tipos.js";

export interface DepsAgendador {
  /** Injetável em teste. Padrão: ffprobe. */
  lerMidia?: (caminho: string) => Promise<CaracteristicasMidia>;
  /** Limites por 24h; o painel passa aqui o valor consultado do Instagram. Padrão: Facebook 30. */
  limites?: Partial<Record<Rede, number>>;
}

export interface OpcoesEncaixe {
  /** TikTok exige escolha manual. Sem ela, TikTok fica de fora (nunca se adivinha). */
  visibilidadeTiktok?: "publica" | "privada";
  /** Restringe as redes consideradas (a pessoa desmarcou alguma). */
  redes?: readonly Rede[];
  iaGerado?: boolean;
}

export type MotivoFora =
  | "video_inexistente" | "nao_aprovado" | "nao_conectada" | "ja_agendada" | "ja_publicada"
  | "nao_passa_validacao" | "validacao_indisponivel" | "visibilidade_obrigatoria";

export interface RedeForaDaVez {
  videoId: number;
  rede: Rede;
  motivo: MotivoFora;
  /** Bloqueios da validação, quando o motivo é nao_passa_validacao. */
  bloqueios: ProblemaMidia[];
  detalhe?: string;
}

interface Elegibilidade {
  pedidos: { videoId: number; redes: Rede[] }[];
  fora: RedeForaDaVez[];
}

async function elegiveis(
  db: Database.Database, videoIds: readonly number[], opcoes: OpcoesEncaixe, deps: DepsAgendador,
): Promise<Elegibilidade> {
  const lerMidia = deps.lerMidia ?? lerCaracteristicas;
  const redesAlvo = REDES.filter((r) => !opcoes.redes || opcoes.redes.includes(r));
  const pedidos: Elegibilidade["pedidos"] = [];
  const fora: RedeForaDaVez[] = [];
  const vistos = new Set<number>();
  for (const videoId of videoIds) {
    if (vistos.has(videoId)) continue;
    vistos.add(videoId);
    const marca = (rede: Rede, motivo: MotivoFora, bloqueios: ProblemaMidia[] = [], detalhe?: string) =>
      fora.push({ videoId, rede, motivo, bloqueios, ...(detalhe ? { detalhe } : {}) });
    const v = obterVideo(db, videoId);
    if (!v) { for (const r of redesAlvo) marca(r, "video_inexistente"); continue; }
    // 'publicado' = já saiu em uma rede e continua aprovado para as demais.
    if (v.estado !== "aprovado" && v.estado !== "publicado") { for (const r of redesAlvo) marca(r, "nao_aprovado"); continue; }

    let midia: CaracteristicasMidia | null = null;
    let erroMidia = "";
    try {
      if (!v.caminhoMp4) throw new Error("vídeo sem arquivo MP4");
      midia = await lerMidia(v.caminhoMp4);
    } catch (e) {
      erroMidia = e instanceof Error ? e.message : String(e);
    }

    const redes: Rede[] = [];
    for (const rede of redesAlvo) {
      const existente = obterPublicacaoDoPar(db, videoId, rede);
      if (existente && ["agendada", "publicando", "verificar"].includes(existente.estado)) { marca(rede, "ja_agendada"); continue; }
      if (existente?.estado === "publicada") { marca(rede, "ja_publicada"); continue; }
      const conta = obterConta(db, rede);
      if (!conta.conectada) { marca(rede, "nao_conectada"); continue; }
      if (rede === "tiktok" && opcoes.visibilidadeTiktok === undefined) { marca(rede, "visibilidade_obrigatoria"); continue; }
      if (midia === null) { marca(rede, "validacao_indisponivel", [], erroMidia); continue; }
      const r = validarMidiaParaRede(rede, midia, {
        auditoriaAprovada: conta.aprovacaoPlataforma,
        ...(rede === "tiktok" && opcoes.visibilidadeTiktok ? { visibilidade: opcoes.visibilidadeTiktok } : {}),
      });
      if (!r.ok) { marca(rede, "nao_passa_validacao", r.bloqueios); continue; }
      redes.push(rede);
    }
    pedidos.push({ videoId, redes });
  }
  return { pedidos, fora };
}

function contexto(db: Database.Database, agora: Date, deps: DepsAgendador) {
  return {
    agora,
    espacamentoMs: espacamentoMinutos(db) * 60_000,
    limites: deps.limites ?? limitesPadrao(),
    ocupados: ocupadosPorRede(db),
  };
}

export interface Previsao {
  planoAtivo: boolean;
  /** Quando cada (vídeo, rede) sairia. Em ordem de chegada. */
  itens: ItemEncaixe[];
  semVaga: SemVaga[];
  fora: RedeForaDaVez[];
}

/** O que a grade faria com estes vídeos AGORA. Não grava nada. Usa o mesmo cálculo do encaixe real. */
export async function preverEncaixe(
  db: Database.Database, videoIds: readonly number[], agora: Date,
  opcoes: OpcoesEncaixe = {}, deps: DepsAgendador = {}, plano: Plano = lerPlano(db),
): Promise<Previsao> {
  const el = await elegiveis(db, videoIds, opcoes, deps);
  const r = calcularEncaixe(plano, el.pedidos, contexto(db, agora, deps));
  return { planoAtivo: plano.ativo, itens: r.itens, semVaga: r.semVaga, fora: el.fora };
}

export interface ResultadoEncaixeReal extends Previsao {
  agendadas: Publicacao[];
  /** Falhas na hora de gravar (corrida com outra marcação). O resto segue. */
  erros: { videoId: number; rede: Rede; mensagem: string }[];
}

function gravar(db: Database.Database, itens: readonly ItemEncaixe[], opcoes: OpcoesEncaixe, agora: Date) {
  const agendadas: Publicacao[] = [];
  const erros: ResultadoEncaixeReal["erros"] = [];
  for (const it of itens) {
    try {
      agendadas.push(agendarPublicacao(db, {
        videoId: it.videoId, rede: it.rede, quando: it.horario.iso,
        ...(it.rede === "tiktok" ? { visibilidade: opcoes.visibilidadeTiktok } : {}),
        ...(opcoes.iaGerado !== undefined ? { iaGerado: opcoes.iaGerado } : {}),
      }, agora));
    } catch (e) {
      erros.push({ videoId: it.videoId, rede: it.rede, mensagem: e instanceof Error ? e.message : String(e) });
    }
  }
  return { agendadas, erros };
}

/** Encaixa os aprovados nas próximas vagas da grade, de verdade. Grade desligada: não agenda nada. */
export async function encaixarAprovados(
  db: Database.Database, videoIds: readonly number[], agora: Date,
  opcoes: OpcoesEncaixe = {}, deps: DepsAgendador = {}, plano: Plano = lerPlano(db),
): Promise<ResultadoEncaixeReal> {
  const p = await preverEncaixe(db, videoIds, agora, opcoes, deps, plano);
  const { agendadas, erros } = gravar(db, p.itens, opcoes, agora);
  return { ...p, agendadas, erros };
}

// ------------------------------------------------------- aprovar + agendar

export interface SugestaoRede {
  rede: Rede;
  /** Passa na validação e pode ser agendada. */
  passa: boolean;
  motivo?: MotivoFora | SemVaga["motivo"];
  bloqueios: ProblemaMidia[];
  /** Horário sugerido (só quando passa e há vaga). */
  sugestao?: ItemEncaixe;
}

export type ModoAprovar = "aprovar_e_agendar" | "aprovar_e_decidir_depois";

export interface RespostaAprovar {
  video: Video;
  modo: ModoAprovar;
  /** Sempre devolvida, nos dois modos: é o que a tela mostra após aprovar. */
  sugestoes: SugestaoRede[];
  agendadas: Publicacao[];
  erros: { rede: Rede; mensagem: string }[];
}

/**
 * Aprovar emendado no agendar. Aprovar continua sendo ato humano: esta função
 * só existe para ser chamada pela pessoa. Em "aprovar_e_decidir_depois" nada é
 * agendado, só sugerido. Rede em que o vídeo não passa nunca é agendada.
 */
export async function aprovarComSugestao(
  db: Database.Database, videoId: number, modo: ModoAprovar, agora: Date,
  opcoes: OpcoesEncaixe = {}, deps: DepsAgendador = {},
): Promise<RespostaAprovar> {
  if (modo !== "aprovar_e_agendar" && modo !== "aprovar_e_decidir_depois") {
    throw new ErroPublicacao('"modo" precisa ser "aprovar_e_agendar" ou "aprovar_e_decidir_depois".', 400, "modo_invalido");
  }
  const video = aprovarVideo(db, videoId); // lança ErroPortao se não estiver aguardando
  const plano = lerPlano(db);
  const el = await elegiveis(db, [videoId], opcoes, deps);
  const pedido = el.pedidos.find((p) => p.videoId === videoId) ?? { videoId, redes: [] };
  const enc = calcularEncaixe(plano, [pedido], contexto(db, agora, deps), { permitirLivre: true });

  const alvo = REDES.filter((r) => !opcoes.redes || opcoes.redes.includes(r));
  const sugestoes: SugestaoRede[] = alvo.map((rede) => {
    const f = el.fora.find((x) => x.videoId === videoId && x.rede === rede);
    if (f) return { rede, passa: false, motivo: f.motivo, bloqueios: f.bloqueios };
    const it = enc.itens.find((x) => x.rede === rede);
    if (it) return { rede, passa: true, bloqueios: [], sugestao: it };
    const sv = enc.semVaga.find((x) => x.rede === rede);
    return { rede, passa: true, ...(sv ? { motivo: sv.motivo } : {}), bloqueios: [] };
  });

  if (modo === "aprovar_e_decidir_depois") return { video, modo, sugestoes, agendadas: [], erros: [] };
  const { agendadas, erros } = gravar(db, enc.itens, opcoes, agora);
  return {
    video: obterVideo(db, videoId) ?? video, modo, sugestoes, agendadas,
    erros: erros.map((e) => ({ rede: e.rede, mensagem: e.mensagem })),
  };
}
