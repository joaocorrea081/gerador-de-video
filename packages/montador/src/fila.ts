// Fila de render (ETAPA-3-CRITERIO.md): um worker por vez, estado persistido
// na tabela `job`, timeout por job, nova tentativa com teto de 3, e
// recuperação de job órfão ao subir. Concorrência é sempre 1 — fixa, não é
// parâmetro (ver INFRA.md: "renderizar dois ao mesmo tempo derruba os dois").

import { join } from "node:path";
import type Database from "better-sqlite3";
import {
  MAXIMO_TENTATIVAS_JOB,
  marcarJobConcluido,
  marcarJobEmExecucao,
  marcarJobFalhou,
  obterVideo,
  proximoJobPendente,
  recuperarJobsOrfaos,
  textoPadraoDaFicha,
  type FotoCarro,
  type VideoCarroProps,
} from "@gerador/core";
import { renderizarVideo } from "./renderizar.js";

/**
 * 47s de parede medidos na Etapa 1 para um vídeo de 31s (ETAPA-3-CRITERIO.md).
 * O timeout precisa de folga de verdade, não só um arredondamento: o
 * `renderizar.ts` empacota o bundle do Remotion a CADA render (não
 * reaproveita entre chamadas — ver comentário em renderizar.ts), e isso
 * soma minutos de Chrome headless + webpack em máquina já ocupada por outra
 * coisa. 180s dá quase 4x o medido, folga suficiente para absorver uma
 * máquina mais lenta ou um primeiro bundle mais pesado, sem deixar um
 * render de verdade travado segurar a fila por tempo indefinido.
 */
export const TIMEOUT_JOB_MS = 180_000;

export type FuncaoRenderizar = (props: VideoCarroProps, caminhoSaida: string) => Promise<void>;

export interface OpcoesFila {
  /** Função de render a usar. Padrão: `renderizarVideo` de verdade (Remotion). Trocável em teste. */
  renderizar?: FuncaoRenderizar;
  /** Timeout por job, em ms. Padrão: TIMEOUT_JOB_MS. */
  timeoutMs?: number;
  /** Teto de tentativas por job. Padrão: 3 (MAXIMO_TENTATIVAS_JOB). */
  maximoTentativas?: number;
  /** Pasta onde os MP4 concluídos são gravados. */
  pastaSaida: string;
}

class ErroTimeout extends Error {}

function comTimeout<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new ErroTimeout(`render não terminou em ${ms}ms`));
    }, ms);
    promessa
      .then((valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      })
      .catch((erro: unknown) => {
        clearTimeout(temporizador);
        reject(erro);
      });
  });
}

function buscarFotosDoVideo(db: Database.Database, produtoId: number, ordemFotosJson: string | null): FotoCarro[] {
  const linhas = db
    .prepare(
      "SELECT caminho_local as caminho, largura, altura FROM foto WHERE produto_id = ? AND caminho_local IS NOT NULL ORDER BY ordem ASC",
    )
    .all(produtoId) as { caminho: string; largura: number | null; altura: number | null }[];

  const fotos: FotoCarro[] = linhas.map((l) => ({
    caminho: l.caminho,
    largura: l.largura ?? 0,
    altura: l.altura ?? 0,
  }));

  if (!ordemFotosJson) return fotos;

  try {
    const ordem = JSON.parse(ordemFotosJson) as number[];
    const reordenadas = ordem.map((indice) => fotos[indice]).filter((f): f is FotoCarro => f !== undefined);
    return reordenadas.length > 0 ? reordenadas : fotos;
  } catch {
    return fotos;
  }
}

/** Monta as props do Remotion a partir das linhas `produto`/`video` já persistidas. */
function montarProps(db: Database.Database, videoId: number): VideoCarroProps {
  const video = obterVideo(db, videoId);
  if (!video) throw new Error(`vídeo ${videoId} não encontrado`);

  const produto = db.prepare("SELECT dados_json FROM produto WHERE id = ?").get(video.produtoId) as
    | { dados_json: string }
    | undefined;
  const dados = produto ? JSON.parse(produto.dados_json) : {};

  // O texto padrão (sem IA) é só marca+modelo reciclado do dado: tratar como
  // "sem texto escrito" evita título duplicado e corpo redundante no vídeo.
  const padrao = textoPadraoDaFicha(dados);
  const titulo = video.titulo?.trim() || undefined;
  const corpo = video.corpo?.trim() || undefined;
  const tituloEscrito = titulo && titulo !== padrao.titulo ? titulo : undefined;
  const corpoEscrito = corpo && corpo !== padrao.corpo ? corpo : undefined;

  return {
    dados,
    anuncio: { titulo: tituloEscrito, corpo: corpoEscrito },
    fotos: buscarFotosDoVideo(db, video.produtoId, video.ordemFotosJson),
    cardapio: {
      fundo: video.fundo ?? "claro",
      ritmo: video.ritmo ?? "calmo",
    },
  };
}

/**
 * Processa exatamente um job pendente, se houver. Devolve `null` se a fila
 * estava vazia. Concorrência 1: não chame isto de novo sem esperar a
 * promessa anterior terminar — é o próprio chamador (o loop em `rodarFila`)
 * quem garante isso aqui, nunca `Promise.all`.
 */
export async function processarProximoJob(
  db: Database.Database,
  opcoes: OpcoesFila,
): Promise<{ jobId: number; resultado: "concluido" | "falhou" | "retentar" } | null> {
  const job = proximoJobPendente(db);
  if (!job) return null;

  const renderizar = opcoes.renderizar ?? renderizarVideo;
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_JOB_MS;
  const maximoTentativas = opcoes.maximoTentativas ?? MAXIMO_TENTATIVAS_JOB;

  marcarJobEmExecucao(db, job.id, job.videoId);

  const caminhoSaida = join(opcoes.pastaSaida, `video-${job.videoId}.mp4`);

  try {
    const props = montarProps(db, job.videoId);
    await comTimeout(renderizar(props, caminhoSaida), timeoutMs);
    marcarJobConcluido(db, job.id, job.videoId, caminhoSaida);
    return { jobId: job.id, resultado: "concluido" };
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    const { esgotou } = marcarJobFalhou(db, job.id, job.videoId, mensagem, maximoTentativas);
    return { jobId: job.id, resultado: esgotou ? "falhou" : "retentar" };
  }
}

export interface Fila {
  /** Processa a fila até esvaziar (sem jobs pendentes). Usa concorrência 1 sempre. */
  esvaziar(): Promise<number>;
  /** Sobe um loop contínuo em background, revisitando a fila a cada `intervaloMs`. */
  iniciar(intervaloMs?: number): void;
  parar(): void;
}

/**
 * Cria a fila. Ao criar, já roda a recuperação de jobs órfãos (job que
 * ficou "em_execucao" quando o processo anterior morreu) — sem isso a fila
 * trava sozinha para sempre (ver ETAPA-3-CRITERIO.md).
 */
export function criarFila(db: Database.Database, opcoes: OpcoesFila): Fila {
  recuperarJobsOrfaos(db);

  let parando = false;
  let temporizador: NodeJS.Timeout | undefined;

  async function esvaziar(): Promise<number> {
    let processados = 0;
    // Laço sequencial, nunca paralelo: concorrência 1 fixa (INFRA.md).
    for (;;) {
      const resultado = await processarProximoJob(db, opcoes);
      if (!resultado) break;
      processados += 1;
    }
    return processados;
  }

  function iniciar(intervaloMs = 2000): void {
    parando = false;
    const loop = async (): Promise<void> => {
      if (parando) return;
      await esvaziar();
      if (!parando) {
        temporizador = setTimeout(loop, intervaloMs);
      }
    };
    void loop();
  }

  function parar(): void {
    parando = true;
    if (temporizador) clearTimeout(temporizador);
  }

  return { esvaziar, iniciar, parar };
}
