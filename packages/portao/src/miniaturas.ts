// Miniatura do vídeo: UM quadro tirado do MP4 com ffmpeg, guardado em cache ao lado do banco (dados/miniaturas).
// A tela nunca carrega o MP4 inteiro só para mostrar uma figura pequena.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { CAMINHO_BANCO } from "@gerador/core";

export type GeradorDeMiniatura = (mp4: string, destino: string) => Promise<void>;

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", ["-v", "error", "-y", ...args], { timeout: 30_000 }, (erro) => (erro ? reject(erro) : resolve()));
  });
}

/** Quadro do segundo 1 (ou do início, se o vídeo for mais curto), largura 360px. */
export const gerarComFfmpeg: GeradorDeMiniatura = async (mp4, destino) => {
  const base = ["-i", mp4, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", "-f", "image2"];
  try {
    await ffmpeg(["-ss", "1", ...base, destino]);
  } catch {
    await ffmpeg([...base, destino]);
  }
  if (!existsSync(destino)) throw new Error("ffmpeg não gerou a miniatura");
};

/** Muda quando o MP4 é refeito: entra na URL, para o navegador poder guardar a figura para sempre. */
export function versaoDoArquivo(mp4: string): string {
  try {
    const st = statSync(mp4);
    return `${Math.round(st.mtimeMs)}-${st.size}`;
  } catch {
    return "0";
  }
}

const emAndamento = new Map<string, Promise<string>>();

/** Caminho do JPG em cache (cria se faltar). Lança se o vídeo não existe ou o ffmpeg falha. */
export function miniaturaDoVideo(mp4: string, id: number, gerar: GeradorDeMiniatura = gerarComFfmpeg): Promise<string> {
  // O cache fica ao lado do banco (dados/miniaturas), ou onde GERADOR_PASTA_MINIATURAS mandar: nunca dentro da pasta dos vídeos.
  const pasta = process.env["GERADOR_PASTA_MINIATURAS"] ?? join(dirname(CAMINHO_BANCO), "miniaturas");
  const destino = join(pasta, `${id}-${versaoDoArquivo(mp4)}.jpg`);
  if (existsSync(destino)) return Promise.resolve(destino);
  const andando = emAndamento.get(destino);
  if (andando) return andando;
  const trabalho = (async () => {
    mkdirSync(pasta, { recursive: true });
    const temporario = `${destino}.parcial.jpg`;
    await gerar(mp4, temporario);
    renameSync(temporario, destino);
    return destino;
  })().finally(() => emAndamento.delete(destino));
  emAndamento.set(destino, trabalho);
  return trabalho;
}
