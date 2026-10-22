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
 * ZONA DO CARRO: a faixa horizontal da foto (fração da largura) que o recorte
 * NUNCA pode cortar. Não há detector de carro: é uma suposição conservadora,
 * conferida nas fotos do estoque (Astra lateral: 4,4% a 90,3%; traseira: 16,6%
 * a 80,9%). Vertical: o carro vive entre 15% e 90% da altura.
 * Regra completa e porquê em PADRAO-VIDEO.md.
 */
export const ZONA_CARRO = { x0: 0.04, x1: 0.96, y0: 0.15, y1: 0.9 } as const;

/**
 * CONTA DA ESCALA (foto de origem 1024x768, 4:3, sem versão maior no CDN):
 *
 * O carro inteiro manda. A janela precisa mostrar a ZONA_CARRO (92% da
 * largura) em todo instante do zoom e do pan. Com janela de 1080 px isso
 * limita a escala a 1080/(1024*0,92) = 1,146x, bem abaixo do teto 1,45x.
 * O teto continua valendo (nada passa dele); a escala efetiva é a menor entre
 * o alvo, o teto e o que deixa o carro caber.
 *
 * "cheia": janela 1080x840. Escala mínima que cobre a janela:
 *   max(1080/1024; 840/768) = 1,094x. Vai até 1,146x. É a janela mais alta
 *   (840 contra 810) com recorte mínimo: enche mais o quadro sem cortar o
 *   carro. Antes era 1080x1000 (1,302x a 1,45x) e cortava o para-choque.
 *
 * "nitida": janela 1080x810 = foto inteira em largura cheia, sem recorte.
 *   Escala 1,055x a 1,08x (teto da variante).
 */
export const CONFIG: Record<Variante, ConfigVariante> = {
  cheia: { larguraJanela: 1080, alturaJanela: 840, escalaAlvoMax: 1.45, teto: 1.45 },
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
  // Escala que ainda deixa a zona do carro inteira dentro da janela.
  const escalaCarro = larguraJanela / (larguraFoto * (ZONA_CARRO.x1 - ZONA_CARRO.x0));
  // Foto mais larga que 4:3: a janela encolhe em altura em vez de cortar o carro.
  const alturaJanela = Math.min(cfg.alturaJanela, alturaFoto * cfg.teto, alturaFoto * escalaCarro);
  const escalaMin = Math.max(larguraJanela / larguraFoto, alturaJanela / alturaFoto);
  const escalaCarroY = alturaJanela / (alturaFoto * (ZONA_CARRO.y1 - ZONA_CARRO.y0));
  const escalaMax = Math.max(escalaMin, Math.min(cfg.escalaAlvoMax, cfg.teto, escalaCarro, escalaCarroY));
  const p = Math.min(1, Math.max(0, progresso));
  const pz = zoomIn ? p : 1 - p;
  const escala = Math.min(cfg.teto, escalaMin + (escalaMax - escalaMin) * pz);
  // Vertical: a janela se centra na zona do carro (não no meio da foto), sem sair da foto.
  const visivelY = Math.min(1, alturaJanela / (alturaFoto * escala));
  const centroCarro = (ZONA_CARRO.y0 + ZONA_CARRO.y1) / 2;
  const topoY = Math.min(1 - visivelY, Math.max(0, centroCarro - visivelY / 2));
  const pp = panAvanca ? p : 1 - p;
  // Pan: a borda esquerda da janela (fração da foto ampliada) só anda onde a
  // zona do carro continua inteira dentro dela.
  const visivel = Math.min(1, larguraJanela / (larguraFoto * escala));
  const minimo = Math.max(0, ZONA_CARRO.x1 - visivel);
  const maximo = Math.min(1 - visivel, ZONA_CARRO.x0);
  const esquerda =
    minimo <= maximo
      ? minimo + (maximo - minimo) * pp
      : Math.min(1 - visivel, Math.max(0, (ZONA_CARRO.x0 + ZONA_CARRO.x1) / 2 - visivel / 2));
  return {
    larguraJanela,
    alturaJanela,
    topoJanela: (ALTURA_QUADRO - alturaJanela) / 2,
    escala,
    escalaMin,
    escalaMax,
    x: -esquerda * larguraFoto * escala,
    y: -topoY * alturaFoto * escala,
  };
}
