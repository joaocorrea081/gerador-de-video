// Leitura das características reais do MP4 (ffprobe) e validação por rede.
// Números vêm de PUBLICACAO.md (medidos lá). Nada aqui é chute: o que o
// documento não especifica vira aviso ou fica de fora.

import { execFile } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export type Rede = "instagram" | "facebook" | "tiktok";
export const REDES: readonly Rede[] = ["instagram", "facebook", "tiktok"];

export interface CaracteristicasMidia {
  duracaoSegundos: number;
  tamanhoBytes: number;
  largura: number;
  altura: number;
  fps: number;
  codecVideo: string;
  codecAudio: string | null;
  perfilAudio: string | null;
  taxaAmostragemAudio: number | null;
  bitrateAudio: number | null;
  moovNoInicio: boolean;
  temEditList: boolean;
}

export interface ProblemaMidia {
  codigo: string;
  mensagem: string;
}

export interface ResultadoValidacao {
  rede: Rede;
  ok: boolean;
  bloqueios: ProblemaMidia[];
  avisos: ProblemaMidia[];
}

export const LIMITES_MIDIA = {
  instagram: { duracaoMin: 3, duracaoMax: 15 * 60, tamanhoMax: 300 * 1024 * 1024, larguraMax: 1920, fpsMin: 23, fpsMax: 60 },
  facebook: { duracaoMin: 3, duracaoMax: 90, larguraMin: 540, alturaMin: 960 },
} as const;

const RAZAO_9_16 = 9 / 16;
const eh9por16 = (l: number, a: number): boolean => a > 0 && Math.abs(l / a - RAZAO_9_16) < 0.01;

export interface ContextoValidacao {
  /** TikTok: a auditoria da plataforma foi aprovada? */
  auditoriaAprovada?: boolean;
  visibilidade?: "publica" | "privada";
}

export function validarMidiaParaRede(
  rede: Rede,
  c: CaracteristicasMidia,
  ctx: ContextoValidacao = {},
): ResultadoValidacao {
  const bloqueios: ProblemaMidia[] = [];
  const avisos: ProblemaMidia[] = [];
  const barra = (codigo: string, mensagem: string) => bloqueios.push({ codigo, mensagem });
  const avisa = (codigo: string, mensagem: string) => avisos.push({ codigo, mensagem });
  const dur = c.duracaoSegundos.toFixed(1).replace(".", ",");

  if (rede === "instagram") {
    const L = LIMITES_MIDIA.instagram;
    if (c.duracaoSegundos < L.duracaoMin || c.duracaoSegundos > L.duracaoMax) {
      barra("duracao", `Duração de ${dur}s fora do aceito pelo Instagram Reels (3s a 15 minutos).`);
    }
    if (c.tamanhoBytes > L.tamanhoMax) {
      barra("tamanho", `Arquivo com ${(c.tamanhoBytes / 1048576).toFixed(0)} MB passa do limite de 300 MB do Instagram.`);
    }
    if (c.largura > L.larguraMax) barra("largura", `Largura de ${c.largura}px passa do máximo de 1920px do Instagram.`);
    if (c.codecVideo !== "h264" && c.codecVideo !== "hevc") {
      barra("codec_video", `Vídeo em ${c.codecVideo.toUpperCase()}: o Instagram só aceita H264 ou HEVC.`);
    }
    if (c.codecAudio === null) avisa("sem_audio", "O arquivo não tem faixa de áudio.");
    else if (c.codecAudio !== "aac") barra("codec_audio", `Áudio em ${c.codecAudio.toUpperCase()}: o Instagram exige AAC.`);
    if (c.fps < L.fpsMin || c.fps > L.fpsMax) {
      barra("fps", `${c.fps.toFixed(0)} quadros por segundo: o Instagram aceita de 23 a 60.`);
    }
    if (!eh9por16(c.largura, c.altura)) avisa("proporcao", "Proporção diferente de 9:16 (recomendada pelo Instagram).");
    if (!c.moovNoInicio) barra("moov", "O índice do MP4 (moov) está no fim do arquivo; o Instagram exige no começo.");
    if (c.temEditList) avisa("edit_list", "O arquivo tem edit list; o Instagram pede arquivo sem edit lists.");
  }

  if (rede === "facebook") {
    const L = LIMITES_MIDIA.facebook;
    if (!eh9por16(c.largura, c.altura)) {
      barra("proporcao", `Proporção ${c.largura}x${c.altura}: o Facebook Reels exige 9:16 (vertical).`);
    }
    if (c.largura < L.larguraMin || c.altura < L.alturaMin) {
      barra("resolucao", `Resolução ${c.largura}x${c.altura} abaixo do mínimo de 540x960 do Facebook.`);
    } else if (c.largura < 1080 || c.altura < 1920) {
      avisa("resolucao_recomendada", "O Facebook recomenda 1080x1920.");
    }
    if (c.duracaoSegundos < L.duracaoMin || c.duracaoSegundos > L.duracaoMax) {
      barra("duracao", `Duração de ${dur}s fora do aceito pelo Facebook Reels (3 a 90 segundos).`);
    }
    if (c.codecAudio === null) avisa("sem_audio", "O arquivo não tem faixa de áudio.");
    else {
      if (c.codecAudio !== "aac" || (c.perfilAudio !== null && c.perfilAudio !== "LC")) {
        barra("codec_audio", "O Facebook exige áudio AAC-LC.");
      }
      if (c.taxaAmostragemAudio !== null && c.taxaAmostragemAudio !== 48000) {
        avisa("audio_48k", "O Facebook recomenda áudio a 48 kHz.");
      }
      if (c.bitrateAudio !== null && c.bitrateAudio < 128000) {
        avisa("audio_bitrate", "O Facebook recomenda áudio estéreo de 128 kbps ou mais.");
      }
    }
  }

  if (rede === "tiktok") {
    if (ctx.visibilidade === "privada") {
      avisa(
        "tiktok_privado",
        "Sem auditoria o TikTok só aceita visibilidade privada (SELF_ONLY), em conta privada, para no máximo 5 usuários por 24 horas.",
      );
    } else if (!ctx.auditoriaAprovada) {
      barra(
        "tiktok_sem_auditoria",
        "O TikTok não permite publicação pública antes da auditoria do app ser aprovada. Sem auditoria, só é possível publicar em modo privado.",
      );
    }
  }

  return { rede, ok: bloqueios.length === 0, bloqueios, avisos };
}

// ------------------------------------------------------------------ ffprobe

interface SaidaFfprobe {
  streams?: {
    codec_type?: string;
    codec_name?: string;
    profile?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    avg_frame_rate?: string;
    sample_rate?: string;
    bit_rate?: string;
    duration?: string;
  }[];
  format?: { duration?: string; size?: string };
}

function fracao(texto: string | undefined): number {
  if (!texto) return 0;
  const [a, b] = texto.split("/").map(Number);
  if (a === undefined || !Number.isFinite(a)) return 0;
  if (b === undefined) return a;
  return b ? a / b : 0;
}

/** Percorre as caixas de topo do MP4: moov antes de mdat? E há 'elst' dentro do moov? */
export function inspecionarEstruturaMp4(caminho: string): { moovNoInicio: boolean; temEditList: boolean } {
  const fd = openSync(caminho, "r");
  try {
    const total = fstatSync(fd).size;
    let pos = 0;
    let moovPos = -1;
    let mdatPos = -1;
    let temEditList = false;
    const cab = Buffer.alloc(16);
    while (pos + 8 <= total) {
      readSync(fd, cab, 0, 16, pos);
      let tamanho = cab.readUInt32BE(0);
      const tipo = cab.toString("latin1", 4, 8);
      if (tamanho === 1) tamanho = Number(cab.readBigUInt64BE(8));
      if (tamanho === 0) tamanho = total - pos;
      if (tamanho < 8) break;
      if (tipo === "moov") {
        moovPos = pos;
        if (tamanho < 64 * 1024 * 1024) {
          const buf = Buffer.alloc(tamanho);
          readSync(fd, buf, 0, tamanho, pos);
          temEditList = buf.includes("elst", 0, "latin1");
        }
      }
      if (tipo === "mdat" && mdatPos < 0) mdatPos = pos;
      pos += tamanho;
    }
    return { moovNoInicio: moovPos >= 0 && (mdatPos < 0 || moovPos < mdatPos), temEditList };
  } finally {
    closeSync(fd);
  }
}

export function lerCaracteristicas(caminho: string): Promise<CaracteristicasMidia> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", caminho],
      { maxBuffer: 8 * 1024 * 1024 },
      (erro, stdout) => {
        if (erro) {
          reject(new Error("não foi possível ler o vídeo com o ffprobe (arquivo ausente, corrompido ou ffprobe não instalado)"));
          return;
        }
        try {
          const j = JSON.parse(stdout) as SaidaFfprobe;
          const v = j.streams?.find((s) => s.codec_type === "video");
          const a = j.streams?.find((s) => s.codec_type === "audio");
          if (!v) throw new Error("sem faixa de vídeo");
          const estrutura = inspecionarEstruturaMp4(caminho);
          resolve({
            duracaoSegundos: Number(j.format?.duration ?? v.duration ?? 0),
            tamanhoBytes: Number(j.format?.size ?? 0),
            largura: v.width ?? 0,
            altura: v.height ?? 0,
            fps: fracao(v.avg_frame_rate) || fracao(v.r_frame_rate),
            codecVideo: v.codec_name ?? "desconhecido",
            codecAudio: a ? (a.codec_name ?? "desconhecido") : null,
            perfilAudio: a?.profile ?? null,
            taxaAmostragemAudio: a?.sample_rate ? Number(a.sample_rate) : null,
            bitrateAudio: a?.bit_rate ? Number(a.bit_rate) : null,
            ...estrutura,
          });
        } catch (e) {
          reject(new Error(`ffprobe devolveu algo ilegível: ${e instanceof Error ? e.message : String(e)}`));
        }
      },
    );
  });
}
