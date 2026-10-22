// Matemática pura (sem React/Remotion) do enquadramento das duas variantes.
// Fica separada para ser testável: a regra de escala é a que o ETAPA-1-CRITERIO.md
// proíbe de quebrar (foto de 1024x768 não pode ser esticada até borrar).
import type { EnquadramentoEscolha, VideoCarroProps } from "@gerador/core";

/** "Variante" é o enquadramento (nome histórico); os valores são os do cardápio. */
export type Variante = EnquadramentoEscolha;
export const VARIANTES: readonly Variante[] = ["cheia", "nitida"];

/**
 * Props do vídeo. `variante`, se vier, vence `cardapio.enquadramento`.
 * `destaqueAutomatico` é o hex da cor dominante da foto, extraído por
 * renderizar.ts ANTES do render (null = falhou, cai na cor padrão).
 */
export type VideoCarroPropsMontador = VideoCarroProps & {
  variante?: Variante;
  destaqueAutomatico?: string | null;
};

export const LARGURA_QUADRO = 1080;
export const ALTURA_QUADRO = 1920;

export interface ConfigVariante {
  /** Janela onde a foto aparece, em px do quadro 1080x1920. */
  larguraJanela: number;
  alturaJanela: number;
  /** Escala máxima que o movimento pode atingir. */
  escalaAlvoMax: number;
  /** Teto absoluto de ampliação. Nada passa disso, nunca. */
  teto: number;
}

/**
 * CONTA DA ESCALA (foto de origem 1024x768, 4:3, sem versão maior no CDN):
 *
 * "cheia": janela 1080x1000 (1,08:1, quase quadrada). Recorte: 1080/1024 e
 *   1000/768 -> a escala mínima que cobre a janela é max(1,055; 1,302) =
 *   1,302x. O zoom vai de 1,302x a 1,45x (teto) e a janela mostra, no pior
 *   instante (1,45x), 745x690 px da origem (73% da largura). Um recorte
 *   central estático cortaria frente/traseira do carro (o carro ocupa ~90%
 *   da largura nas fotos laterais), por isso o pan percorre a largura toda:
 *   o carro inteiro passa pela janela ao longo da cena. Um 1:1 exato exigiria
 *   1,406x o tempo todo (quase sem zoom) e cortaria o mesmo.
 *   Escala final: 1,302x a 1,45x. Nunca acima de 1,45x.
 *
 * "nitida": janela 1080x810 = foto inteira em largura cheia, sem recorte.
 *   Escala base 1080/1024 = 1,055x. O movimento sobe até 1,08x (teto da
 *   variante), cortando no máximo 2,3% de cada lado no fim da cena.
 *   Escala final: 1,055x a 1,08x.
 */
export const CONFIG: Record<Variante, ConfigVariante> = {
  cheia: { larguraJanela: 1080, alturaJanela: 1000, escalaAlvoMax: 1.45, teto: 1.45 },
  nitida: { larguraJanela: 1080, alturaJanela: 810, escalaAlvoMax: 1.08, teto: 1.08 },
};

export interface Enquadramento {
  larguraJanela: number;
  alturaJanela: number;
  topoJanela: number;
  /** Escala no progresso pedido. Sempre <= teto da variante. */
  escala: number;
  escalaMin: number;
  escalaMax: number;
  /** Translate (px, negativos) para aplicar antes do scale, com origem 0 0. */
  x: number;
  y: number;
}

/**
 * Enquadramento da foto numa variante. `progresso` 0..1 já com easing.
 * `zoomIn` e `panAvanca` alternam por cena para não ficar repetitivo.
 * Foto menor que o previsto nunca é ampliada além do teto: a janela encolhe.
 */
export function enquadrar(
  larguraFoto: number,
  alturaFoto: number,
  variante: Variante,
  progresso: number,
  zoomIn: boolean,
  panAvanca: boolean,
): Enquadramento {
  const cfg = CONFIG[variante];
  const larguraJanela = Math.min(cfg.larguraJanela, larguraFoto * cfg.teto);
  const alturaJanela = Math.min(cfg.alturaJanela, alturaFoto * cfg.teto);
  const escalaMin = Math.max(larguraJanela / larguraFoto, alturaJanela / alturaFoto);
  const escalaMax = Math.max(escalaMin, Math.min(cfg.escalaAlvoMax, cfg.teto));
  const p = Math.min(1, Math.max(0, progresso));
  const pz = zoomIn ? p : 1 - p;
  const escala = Math.min(cfg.teto, escalaMin + (escalaMax - escalaMin) * pz);
  const folgaX = larguraFoto * escala - larguraJanela;
  const folgaY = alturaFoto * escala - alturaJanela;
  const pp = panAvanca ? p : 1 - p;
  return {
    larguraJanela,
    alturaJanela,
    topoJanela: (ALTURA_QUADRO - alturaJanela) / 2,
    escala,
    escalaMin,
    escalaMax,
    x: -Math.max(0, folgaX) * pp,
    y: -Math.max(0, folgaY) * 0.5,
  };
}
