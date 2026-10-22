// Baixa fotos de carro para o disco com filtro de qualidade:
// descarta abaixo de 800px de largura, descarta duplicata por hash do
// CONTEÚDO (não do nome do arquivo) — ETAPA-4-CRITERIO.md / ARQUITETURA.md.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lerDimensoes } from "./dimensoes-imagem.js";

export const LARGURA_MINIMA_PX = 800;

export interface FotoBaixada {
  url: string;
  caminhoLocal: string;
  largura: number;
  altura: number;
  ordem: number;
}

export interface FotoDescartada {
  url: string;
  motivo: "pequena" | "duplicada" | "erro";
  detalhe?: string;
}

export interface ResultadoFotos {
  baixadas: FotoBaixada[];
  descartadas: FotoDescartada[];
}

/** Busca os bytes de uma URL. Trocável nos testes para não depender de rede. */
export type Buscador = (url: string) => Promise<Buffer>;

const buscadorPadrao: Buscador = async (url) => {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  return Buffer.from(await resposta.arrayBuffer());
};

/**
 * Baixa cada URL em `urls`, filtra por largura mínima e por duplicata de
 * conteúdo (hash SHA-256), e salva o que passar em `pastaDestino`.
 */
export async function baixarFotos(
  urls: string[],
  pastaDestino: string,
  buscar: Buscador = buscadorPadrao,
): Promise<ResultadoFotos> {
  await mkdir(pastaDestino, { recursive: true });

  const baixadas: FotoBaixada[] = [];
  const descartadas: FotoDescartada[] = [];
  const hashesVistos = new Set<string>();
  let ordem = 0;

  for (const url of urls) {
    try {
      const buffer = await buscar(url);

      const hash = createHash("sha256").update(buffer).digest("hex");
      if (hashesVistos.has(hash)) {
        descartadas.push({ url, motivo: "duplicada", detalhe: hash });
        continue;
      }

      const dimensoes = lerDimensoes(buffer);
      if (!dimensoes || dimensoes.largura < LARGURA_MINIMA_PX) {
        descartadas.push({
          url,
          motivo: "pequena",
          detalhe: dimensoes ? `${dimensoes.largura}px` : "dimensão ilegível",
        });
        continue;
      }

      hashesVistos.add(hash);
      const extensao = url.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? "jpg";
      const nomeArquivo = `${String(ordem).padStart(2, "0")}_${hash.slice(0, 8)}.${extensao}`;
      const caminhoLocal = join(pastaDestino, nomeArquivo);
      await writeFile(caminhoLocal, buffer);

      baixadas.push({
        url,
        caminhoLocal,
        largura: dimensoes.largura,
        altura: dimensoes.altura,
        ordem,
      });
      ordem++;
    } catch (erro) {
      descartadas.push({
        url,
        motivo: "erro",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return { baixadas, descartadas };
}
