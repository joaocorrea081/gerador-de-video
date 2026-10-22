// Estilo fixo em código. O modelo (Claude) nunca inventa layout — ele só
// escolhe `fundo` e `ritmo` do cardápio (ver REGRAS-DE-NEGOCIO.md).
import { loadFont } from "@remotion/google-fonts/Inter";
import { loadFont as loadSerif } from "@remotion/google-fonts/PlayfairDisplay";
import type { CorEscolha, FundoEscolha } from "@gerador/core";
import { resolverDestaque, type RGB } from "./cor.js";

const { fontFamily: FONT_FAMILY } = loadFont("normal", {
  weights: ["700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export const FONT = FONT_FAMILY;

// Serifada só do modelo "editorial".
const { fontFamily: SERIF_FAMILY } = loadSerif("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
  ignoreTooManyRequestsWarning: true,
});

export const SERIF = SERIF_FAMILY;

/** Paleta de cada uma das três opções de fundo do cardápio. */
export interface Paleta {
  /** Fundo atrás da camada borrada, visível nas bordas em caso de letterbox. */
  base: string;
  /** Cor de overlay aplicada sobre a foto borrada (escurece / dá tom). */
  overlayFundo: string;
  /** Cor de fundo da faixa de texto. */
  faixa: string;
  /** Cor do texto principal (modelo). */
  textoPrincipal: string;
  /** Cor do texto secundário (marca, ano, km, revenda). */
  textoSecundario: string;
  /** Cor de destaque (preço, filetes). Já ajustada para passar no contraste. */
  destaque: string;
  /** Texto legível SOBRE o destaque (blocos preenchidos). */
  textoSobreDestaque: string;
}

const PALETAS_BASE: Record<FundoEscolha, Omit<Paleta, "textoSobreDestaque">> = {
  claro: {
    base: "#f3f1ec",
    // Overlays revisados pra cor do carro continuar aparecendo atrás do
    // blur (ver CarroCena.tsx) — com os valores antigos o fundo saía
    // preto chapado, sem entregar a cor que a camada 1 deveria dar.
    overlayFundo: "rgba(255,255,255,0.30)",
    faixa: "rgba(255,255,255,0.92)",
    textoPrincipal: "#17171a",
    textoSecundario: "#4b4b52",
    destaque: "#b5471b",
  },
  escuro: {
    base: "#0a0b0d",
    overlayFundo: "rgba(0,0,0,0.30)",
    faixa: "rgba(10,11,13,0.86)",
    textoPrincipal: "#ffffff",
    textoSecundario: "#b9bdc6",
    destaque: "#ffb545",
  },
  gradiente: {
    base: "#0d0b1a",
    overlayFundo:
      "linear-gradient(180deg, rgba(20,10,40,0.22) 0%, rgba(60,20,70,0.30) 55%, rgba(10,5,20,0.40) 100%)",
    // Magenta e índigo escuros (eram rosa e lilás claros): precisam casar com
    // SUPERFICIES.gradiente em cor.ts, que é contra o que o destaque é medido.
    faixa:
      "linear-gradient(90deg, rgba(122,26,88,0.92) 0%, rgba(61,35,153,0.92) 100%)",
    textoPrincipal: "#ffffff",
    textoSecundario: "#f1e6ff",
    destaque: "#ffe066",
  },
};

/**
 * Paleta final: fundo escolhido + cor de destaque resolvida (com contraste
 * garantido por cor.ts). `dominante` só é usado quando cor === "automatica".
 */
export function montarPaleta(fundo: FundoEscolha, cor: CorEscolha = "ambar", dominante: RGB | null = null): Paleta {
  const d = resolverDestaque(cor, fundo, dominante);
  return { ...PALETAS_BASE[fundo], destaque: d.hex, textoSobreDestaque: d.texto };
}
