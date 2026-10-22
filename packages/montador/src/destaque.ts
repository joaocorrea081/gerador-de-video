// Ponte entre o render (Node) e a composição (pura): extrai a cor dominante
// da foto com ffmpeg (já exigido pelo Remotion) e converte o hex de volta em RGB.
import { spawnSync } from "node:child_process";
import { corDominante, rgbParaHex } from "./cor.js";

/**
 * Cor dominante da foto, como hex, ou null se a extração falhar (ffmpeg
 * ausente, arquivo ilegível, carro sem cor: branco/prata/preto). Olha só o
 * centro da imagem (50%), onde está o carro, para pesar menos céu e asfalto.
 */
export function extrairCorDominanteHex(caminhoFoto: string): string | null {
  try {
    const r = spawnSync(
      "ffmpeg",
      ["-v", "error", "-i", caminhoFoto, "-vf", "crop=iw/2:ih/2,scale=48:36", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
      { maxBuffer: 1 << 20, timeout: 15000 },
    );
    if (r.status !== 0 || !r.stdout || r.stdout.length < 3) return null;
    const rgb = corDominante(r.stdout);
    return rgb ? rgbParaHex(rgb) : null;
  } catch {
    return null;
  }
}
