// Os quatro MODELOS de vídeo: o jeito como a informação entra e se move.
// Cardápio fechado (MODELOS_ESCOLHA em @gerador/core). O visual de cada um é
// fixo aqui e em Sobreposicoes.tsx; o Claude só escolhe o id.
//
// Todos respeitam as mesmas regras duras (ver testes): foto real, tag fora da
// janela da foto, só fade() entre cenas, escala dentro do teto da variante,
// 28 a 32 s. O que muda é ritmo de entrada, tipografia, o que é protagonista
// e a duração do fade entre fotos.
import type { ModeloEscolha } from "@gerador/core";
import { ALTURA_QUADRO, CONFIG, type Variante } from "./variantes.js";

export interface ConfigModelo {
  id: ModeloEscolha;
  /** Nome legível para o painel. */
  nome: string;
  /** Uma linha: a personalidade e no que difere dos outros. */
  personalidade: string;
  /** Duração do fade entre fotos. Mais curto = corte mais marcado. */
  transicaoSegundos: number;
  /** Curva (bezier) do pan/zoom dentro de cada cena. */
  curvaCena: readonly [number, number, number, number];
  tag: {
    /** Segundos para a tag entrar / sair. */
    entrada: number;
    saida: number;
    /** Distância (px) que a tag percorre ao entrar/sair. */
    deslocamento: number;
    /** Direção da entrada: lateral (do lado da tag) ou vertical. */
    eixo: "lado" | "vertical";
    /** Tempo máximo que uma tag fica na tela. */
    maxSegundos: number;
    /** Fração do "slot" que a tag ocupa. */
    fracao: { rapido: number; calmo: number };
    /** Duração da contagem do número (0 -> valor final). */
    contagem: number;
  };
  /** Altura máxima (px) de cada bloco, ancorado na borda da foto crescendo para fora. */
  alturaMax: { tag: number; abertura: number; fechamento: number };
}

export const MODELOS: Record<ModeloEscolha, ConfigModelo> = {
  institucional: {
    id: "institucional",
    nome: "Institucional",
    personalidade:
      "O padrão aprovado, sóbrio: painéis sólidos com filete de cor, tags deslizando de lado em ritmo calmo, fade de 0,6 s; passa seriedade de concessionária.",
    transicaoSegundos: 0.6,
    curvaCena: [0.45, 0, 0.2, 1],
    tag: { entrada: 0.6, saida: 0.45, deslocamento: 220, eixo: "lado", maxSegundos: 3.4, fracao: { rapido: 0.72, calmo: 0.82 }, contagem: 1.1 },
    alturaMax: { tag: 240, abertura: 300, fechamento: 340 },
  },
  energico: {
    id: "energico",
    nome: "Enérgico",
    personalidade:
      "Rápido e agressivo: blocos preenchidos com a cor de destaque entram de lado em um golpe e saem rápido, mas amortecidas (nunca em corte seco); fotos trocam em fade curto; feito para chamar atenção no feed.",
    transicaoSegundos: 0.3,
    curvaCena: [0.1, 0.9, 0.2, 1],
    tag: { entrada: 0.22, saida: 0.3, deslocamento: 760, eixo: "lado", maxSegundos: 2.4, fracao: { rapido: 0.62, calmo: 0.72 }, contagem: 0.55 },
    alturaMax: { tag: 240, abertura: 300, fechamento: 340 },
  },
  numeros: {
    id: "numeros",
    nome: "Números",
    personalidade:
      "Preço e km como protagonistas: algarismos gigantes na cor de destaque contando de zero, quase sem moldura; o que o comprador procura primeiro fica impossível de não ver.",
    transicaoSegundos: 0.6,
    curvaCena: [0.45, 0, 0.2, 1],
    tag: { entrada: 0.5, saida: 0.4, deslocamento: 70, eixo: "vertical", maxSegundos: 3.4, fracao: { rapido: 0.76, calmo: 0.84 }, contagem: 1.5 },
    alturaMax: { tag: 270, abertura: 300, fechamento: 370 },
  },
  editorial: {
    id: "editorial",
    nome: "Editorial",
    personalidade:
      "Revista de carro: tipografia serifada grande sobre véu degradê, sem caixas, muito respiro, entradas lentas em fade; mais elegante e menos vendedor.",
    transicaoSegundos: 0.9,
    curvaCena: [0.3, 0, 0.3, 1],
    tag: { entrada: 1.0, saida: 0.8, deslocamento: 44, eixo: "vertical", maxSegundos: 3.4, fracao: { rapido: 0.8, calmo: 0.88 }, contagem: 1.4 },
    alturaMax: { tag: 260, abertura: 320, fechamento: 350 },
  },
};

/** Saída de tag nunca dura menos que isto (7,5 frames a 30 fps): abaixo disso lê como corte seco. */
export const SAIDA_MIN_SEGUNDOS = 0.25;

export const MODELO_PADRAO: ModeloEscolha = "institucional";

/** Folga entre a borda da foto e o bloco de texto. */
export const FOLGA_FOTO = 44;
/** Espaço livre mínimo que sobra entre o bloco e a borda do quadro. */
export const RESPIRO_BORDA = 20;

export interface Retangulo {
  top: number;
  bottom: number;
}

/** Janela nominal da foto numa variante (a janela real só encolhe, centrada: fica dentro dela). */
export function janelaNominal(variante: Variante): Retangulo {
  const topo = (ALTURA_QUADRO - CONFIG[variante].alturaJanela) / 2;
  return { top: topo, bottom: topo + CONFIG[variante].alturaJanela };
}

/** Espaço livre acima e abaixo da janela, já descontada a folga. */
export function espacoLivre(variante: Variante): { acima: number; abaixo: number } {
  const j = janelaNominal(variante);
  return { acima: j.top - FOLGA_FOTO, abaixo: ALTURA_QUADRO - (j.bottom + FOLGA_FOTO) };
}

/**
 * Retângulo vertical (px do quadro) que um bloco de texto ocupa, no PIOR caso
 * (altura máxima do modelo). É a MESMA conta que posiciona os blocos em
 * Sobreposicoes.tsx: acima da foto o bloco ancora na base e cresce para cima;
 * abaixo da foto ancora no topo e cresce para baixo.
 */
export function retanguloBloco(
  modelo: ModeloEscolha,
  variante: Variante,
  faixa: "topo" | "base",
  tipo: "tag" | "abertura" | "fechamento",
): Retangulo {
  const j = janelaNominal(variante);
  const h = MODELOS[modelo].alturaMax[tipo];
  return faixa === "topo"
    ? { top: j.top - FOLGA_FOTO - h, bottom: j.top - FOLGA_FOTO }
    : { top: j.bottom + FOLGA_FOTO, bottom: j.bottom + FOLGA_FOTO + h };
}
