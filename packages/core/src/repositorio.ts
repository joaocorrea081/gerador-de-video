// Acesso a `video`, `job`, `rejeicao` e `ajuste` — compartilhado pela fila de
// render (packages/montador) e pelo portão (packages/portao). Fica em core
// porque os dois pacotes precisam do mesmo contrato contra o mesmo banco
// (ver ETAPA-3-CRITERIO.md).

import type Database from "better-sqlite3";
import {
  MOTIVOS_REJEICAO,
  type Ajuste,
  type EstadoJob,
  type EstadoVideo,
  type CorEscolha,
  type EnquadramentoEscolha,
  type FundoEscolha,
  type ModeloEscolha,
  type Job,
  type MotivoRejeicao,
  type Rejeicao,
  type RitmoEscolha,
  type Video,
} from "./tipos.js";
import { sistemaPausado } from "./pausa.js";

/** Teto de novas tentativas por job (ver ETAPA-3-CRITERIO.md: "falhou 3 vezes, para"). */
export const MAXIMO_TENTATIVAS_JOB = 3;

interface LinhaVideo {
  id: number;
  produto_id: number;
  estado: EstadoVideo;
  caminho_mp4: string | null;
  criado_em: string;
  atualizado_em: string;
  titulo: string | null;
  corpo: string | null;
  fundo: string | null;
  ritmo: string | null;
  ordem_fotos_json: string | null;
  modelo: string | null;
  enquadramento: string | null;
  cor: string | null;
}

function linhaParaVideo(l: LinhaVideo): Video {
  return {
    id: l.id,
    produtoId: l.produto_id,
    estado: l.estado,
    caminhoMp4: l.caminho_mp4,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
    titulo: l.titulo,
    corpo: l.corpo,
    fundo: l.fundo as FundoEscolha | null,
    ritmo: l.ritmo as RitmoEscolha | null,
    ordemFotosJson: l.ordem_fotos_json,
    modelo: l.modelo as ModeloEscolha | null,
    enquadramento: l.enquadramento as EnquadramentoEscolha | null,
    cor: l.cor as CorEscolha | null,
  };
}

interface LinhaJob {
  id: number;
  video_id: number;
  estado: EstadoJob;
  tentativas: number;
  erro: string | null;
  criado_em: string;
  iniciado_em: string | null;
  terminado_em: string | null;
}

function linhaParaJob(l: LinhaJob): Job {
  return {
    id: l.id,
    videoId: l.video_id,
    estado: l.estado,
    tentativas: l.tentativas,
    erro: l.erro,
    criadoEm: l.criado_em,
    iniciadoEm: l.iniciado_em,
    terminadoEm: l.terminado_em,
  };
}

export interface NovoVideoEntrada {
  produtoId: number;
  titulo: string;
  corpo: string;
  fundo: FundoEscolha;
  ritmo: RitmoEscolha;
  ordemFotos: readonly number[];
  /** Opcionais: ausente = NULL = padrão do montador. */
  modelo?: ModeloEscolha;
  enquadramento?: EnquadramentoEscolha;
  cor?: CorEscolha;
}

/** Cria o vídeo (estado inicial "rascunho") e o job pendente que o acompanha, numa transação. */
export function criarVideoComJob(db: Database.Database, entrada: NovoVideoEntrada): { video: Video; job: Job } {
  const agora = new Date().toISOString();

  const transacao = db.transaction(() => {
    const resultadoVideo = db
      .prepare(
        `INSERT INTO video
          (produto_id, estado, caminho_mp4, criado_em, atualizado_em, titulo, corpo, fundo, ritmo, ordem_fotos_json, modelo, enquadramento, cor)
         VALUES (?, 'rascunho', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entrada.produtoId,
        agora,
        agora,
        entrada.titulo,
        entrada.corpo,
        entrada.fundo,
        entrada.ritmo,
        JSON.stringify(entrada.ordemFotos),
        entrada.modelo ?? null,
        entrada.enquadramento ?? null,
        entrada.cor ?? null,
      );
    const videoId = Number(resultadoVideo.lastInsertRowid);

    const resultadoJob = db
      .prepare(
        `INSERT INTO job (video_id, estado, tentativas, erro, criado_em, iniciado_em, terminado_em)
         VALUES (?, 'pendente', 0, NULL, ?, NULL, NULL)`,
      )
      .run(videoId, agora);
    const jobId = Number(resultadoJob.lastInsertRowid);

    return { videoId, jobId };
  });

  const { videoId, jobId } = transacao();
  return {
    video: obterVideo(db, videoId)!,
    job: obterJob(db, jobId)!,
  };
}

export function obterVideo(db: Database.Database, id: number): Video | undefined {
  const l = db.prepare("SELECT * FROM video WHERE id = ?").get(id) as LinhaVideo | undefined;
  return l ? linhaParaVideo(l) : undefined;
}

export function obterJob(db: Database.Database, id: number): Job | undefined {
  const l = db.prepare("SELECT * FROM job WHERE id = ?").get(id) as LinhaJob | undefined;
  return l ? linhaParaJob(l) : undefined;
}

export function obterJobDoVideo(db: Database.Database, videoId: number): Job | undefined {
  const l = db
    .prepare("SELECT * FROM job WHERE video_id = ? ORDER BY id DESC LIMIT 1")
    .get(videoId) as LinhaJob | undefined;
  return l ? linhaParaJob(l) : undefined;
}

export function listarVideosPorEstado(db: Database.Database, estados: readonly EstadoVideo[]): Video[] {
  const marcadores = estados.map(() => "?").join(",");
  const linhas = db
    .prepare(`SELECT * FROM video WHERE estado IN (${marcadores}) ORDER BY criado_em ASC`)
    .all(...estados) as LinhaVideo[];
  return linhas.map(linhaParaVideo);
}

/**
 * Pega o próximo job pendente, mais antigo primeiro (FIFO). Não marca nada —
 * quem chama decide quando (e se) vai de fato começar a execução.
 */
export function proximoJobPendente(db: Database.Database): Job | undefined {
  // Freio de mão (pausa.ts): sem render novo. O que já está renderizando termina.
  if (sistemaPausado(db)) return undefined;
  const l = db
    .prepare("SELECT * FROM job WHERE estado = 'pendente' ORDER BY criado_em ASC, id ASC LIMIT 1")
    .get() as LinhaJob | undefined;
  return l ? linhaParaJob(l) : undefined;
}

/**
 * Marca o job como em execução e o vídeo como "renderizando". Grava também o
 * snapshot do dado do produto: é exatamente o que o render vai ler agora, e
 * serve de "antes" para a conferência de preço na hora de publicar.
 */
export function marcarJobEmExecucao(db: Database.Database, jobId: number, videoId: number): void {
  const agora = new Date().toISOString();
  const transacao = db.transaction(() => {
    db.prepare("UPDATE job SET estado = 'em_execucao', iniciado_em = ? WHERE id = ?").run(agora, jobId);
    db.prepare(
      `UPDATE video SET estado = 'renderizando', atualizado_em = ?,
         dados_snapshot_json = (SELECT p.dados_json FROM produto p WHERE p.id = video.produto_id)
       WHERE id = ?`,
    ).run(agora, videoId);
  });
  transacao();
}

/** Job terminou bem: fica concluído, e o vídeo vai para a aprovação. */
export function marcarJobConcluido(
  db: Database.Database,
  jobId: number,
  videoId: number,
  caminhoMp4: string,
): void {
  const agora = new Date().toISOString();
  const transacao = db.transaction(() => {
    db.prepare("UPDATE job SET estado = 'concluido', terminado_em = ? WHERE id = ?").run(agora, jobId);
    db.prepare(
      "UPDATE video SET estado = 'aguardando_aprovacao', caminho_mp4 = ?, atualizado_em = ? WHERE id = ?",
    ).run(caminhoMp4, agora, videoId);
  });
  transacao();
}

/**
 * Job terminou mal (erro ou timeout). Incrementa `tentativas`; abaixo do
 * teto volta para "pendente" (nova tentativa), no teto marca "falhou" de
 * vez e grava o erro — no vídeo também, para aparecer no painel.
 */
export function marcarJobFalhou(
  db: Database.Database,
  jobId: number,
  videoId: number,
  mensagemErro: string,
  maximoTentativas: number = MAXIMO_TENTATIVAS_JOB,
): { tentativas: number; esgotou: boolean } {
  const agora = new Date().toISOString();
  const job = obterJob(db, jobId);
  const tentativas = (job?.tentativas ?? 0) + 1;
  const esgotou = tentativas >= maximoTentativas;

  const transacao = db.transaction(() => {
    if (esgotou) {
      db.prepare(
        "UPDATE job SET estado = 'falhou', tentativas = ?, erro = ?, terminado_em = ? WHERE id = ?",
      ).run(tentativas, mensagemErro, agora, jobId);
      db.prepare("UPDATE video SET estado = 'erro', atualizado_em = ? WHERE id = ?").run(agora, videoId);
    } else {
      db.prepare(
        "UPDATE job SET estado = 'pendente', tentativas = ?, erro = ?, iniciado_em = NULL WHERE id = ?",
      ).run(tentativas, mensagemErro, jobId);
    }
  });
  transacao();

  return { tentativas, esgotou };
}

/**
 * Recuperação após queda (ETAPA-3-CRITERIO.md): todo job que ficou
 * "em_execucao" é, por definição, órfão quando o processo acabou de subir —
 * nenhum worker novo nasceu já rodando algo. Devolve-os para "pendente" para
 * a fila não travar sozinha para sempre. Chamar uma vez, ao iniciar.
 */
export function recuperarJobsOrfaos(db: Database.Database): number {
  // O vídeo ligado já está em "renderizando" (foi setado quando o job
  // começou) — não precisa mudar, só o job volta para a fila.
  const resultado = db
    .prepare("UPDATE job SET estado = 'pendente', iniciado_em = NULL WHERE estado = 'em_execucao'")
    .run();
  return resultado.changes;
}

/** Erro de pedido de aprovação/rejeição inválido — o servidor devolve 400 nesse caso. */
export class ErroPortao extends Error {}

export function aprovarVideo(db: Database.Database, videoId: number): Video {
  const video = obterVideo(db, videoId);
  if (!video) throw new ErroPortao(`vídeo ${videoId} não encontrado`);
  if (video.estado !== "aguardando_aprovacao") {
    throw new ErroPortao(`vídeo ${videoId} não está aguardando aprovação (estado atual: ${video.estado})`);
  }
  db.prepare("UPDATE video SET estado = 'aprovado', atualizado_em = ? WHERE id = ?").run(
    new Date().toISOString(),
    videoId,
  );
  return obterVideo(db, videoId)!;
}

export interface EntradaRejeicao {
  videoId: number;
  motivo: unknown;
  observacao?: string | null;
}

/**
 * Rejeita um vídeo. Motivo é obrigatório e precisa ser um dos 5 do enum
 * fechado — nunca texto livre (ver REGRAS-DE-NEGOCIO.md). Qualquer outra
 * coisa é recusada com ErroPortao (o servidor HTTP traduz isso para 400).
 */
export function rejeitarVideo(db: Database.Database, entrada: EntradaRejeicao): { video: Video; rejeicao: Rejeicao } {
  const video = obterVideo(db, entrada.videoId);
  if (!video) throw new ErroPortao(`vídeo ${entrada.videoId} não encontrado`);
  if (video.estado !== "aguardando_aprovacao") {
    throw new ErroPortao(
      `vídeo ${entrada.videoId} não está aguardando aprovação (estado atual: ${video.estado})`,
    );
  }

  if (typeof entrada.motivo !== "string" || entrada.motivo.trim().length === 0) {
    throw new ErroPortao("motivo é obrigatório — é um botão, não texto livre");
  }
  if (!(MOTIVOS_REJEICAO as readonly string[]).includes(entrada.motivo)) {
    throw new ErroPortao(
      `motivo "${entrada.motivo}" é inválido — use um de: ${MOTIVOS_REJEICAO.join(", ")}`,
    );
  }
  const motivo = entrada.motivo as MotivoRejeicao;
  const agora = new Date().toISOString();

  const transacao = db.transaction(() => {
    db.prepare("UPDATE video SET estado = 'rejeitado', atualizado_em = ? WHERE id = ?").run(agora, entrada.videoId);
    const resultado = db
      .prepare("INSERT INTO rejeicao (video_id, motivo, observacao, criado_em) VALUES (?, ?, ?, ?)")
      .run(entrada.videoId, motivo, entrada.observacao ?? null, agora);
    return Number(resultado.lastInsertRowid);
  });

  const rejeicaoId = transacao();
  const rejeicao = db.prepare("SELECT * FROM rejeicao WHERE id = ?").get(rejeicaoId) as {
    id: number;
    video_id: number;
    motivo: MotivoRejeicao;
    observacao: string | null;
    criado_em: string;
  };

  return {
    video: obterVideo(db, entrada.videoId)!,
    rejeicao: {
      id: rejeicao.id,
      videoId: rejeicao.video_id,
      motivo: rejeicao.motivo,
      observacao: rejeicao.observacao,
      criadoEm: rejeicao.criado_em,
    },
  };
}

/** Rejeições agrupadas por motivo — critério de pronto do aprendizado (REGRAS-DE-NEGOCIO.md). */
export function contarRejeicoesPorMotivo(db: Database.Database): Record<MotivoRejeicao, number> {
  const linhas = db
    .prepare("SELECT motivo, COUNT(*) as total FROM rejeicao GROUP BY motivo")
    .all() as { motivo: MotivoRejeicao; total: number }[];

  const contagens = Object.fromEntries(MOTIVOS_REJEICAO.map((m) => [m, 0])) as Record<MotivoRejeicao, number>;
  for (const linha of linhas) {
    contagens[linha.motivo] = linha.total;
  }
  return contagens;
}

/** As N rejeições mais recentes de um motivo, para o escritor usar como exemplo do que evitar. */
export function rejeicoesRecentesPorMotivo(
  db: Database.Database,
  motivo: MotivoRejeicao,
  limite: number,
): Rejeicao[] {
  const linhas = db
    .prepare("SELECT * FROM rejeicao WHERE motivo = ? ORDER BY criado_em DESC LIMIT ?")
    .all(motivo, limite) as { id: number; video_id: number; motivo: MotivoRejeicao; observacao: string | null; criado_em: string }[];
  return linhas.map((l) => ({
    id: l.id,
    videoId: l.video_id,
    motivo: l.motivo,
    observacao: l.observacao,
    criadoEm: l.criado_em,
  }));
}

export function obterAjuste(db: Database.Database, chave: string): string | undefined {
  const l = db.prepare("SELECT valor FROM ajuste WHERE chave = ?").get(chave) as { valor: string } | undefined;
  return l?.valor;
}

export function listarAjustes(db: Database.Database): Ajuste[] {
  return db.prepare("SELECT chave, valor FROM ajuste ORDER BY chave ASC").all() as Ajuste[];
}

export function definirAjuste(db: Database.Database, chave: string, valor: string): void {
  db.prepare(
    "INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(chave, valor);
}
