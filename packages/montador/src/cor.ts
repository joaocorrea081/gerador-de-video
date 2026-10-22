// Matemática de cor pura (sem React/Remotion): contraste WCAG, ajuste de
// destaque e extração da cor dominante. Fica separada para ser testável.
// A regra: nunca entregar texto ilegível. Toda cor de destaque que sai daqui
// passou no contraste mínimo contra as superfícies onde ela aparece.
import type { CorDestaque, CorEscolha, FundoEscolha } from "@gerador/core";

export type RGB = readonly [number, number, number];

/** Contraste mínimo de destaque (texto grande/barras) sobre o fundo: WCAG AA large. */
export const CONTRASTE_MIN_DESTAQUE = 3;
/** Contraste mínimo do texto SOBRE a cor de destaque: WCAG AA normal. */
export const CONTRASTE_MIN_TEXTO = 4.5;

/** Cor padrão (âmbar): é para onde tudo cai quando algo falha. */
export const COR_PADRAO: CorDestaque = "ambar";

/** Tom base de cada cor da paleta fechada. O ajuste de contraste mexe só na luminosidade. */
export const HEX_BASE: Record<CorDestaque, string> = {
  ambar: "#ffb545",
  azul: "#3d8bff",
  verde: "#2fc16b",
  vermelho: "#f0443a",
  roxo: "#9b5cf6",
  grafite: "#5b616e",
};

/**
 * Superfícies sólidas onde o destaque é desenhado, por fundo. São as cores
 * opacas equivalentes das faixas/painéis (o painel real é translúcido sobre a
 * foto borrada, então usar a cor sólida é o caso aproximado; os painéis são
 * quase opacos, 0,86 a 0,92).
 */
export const SUPERFICIES: Record<FundoEscolha, readonly string[]> = {
  claro: ["#f3f1ec", "#ffffff"],
  escuro: ["#0a0b0d", "#14161a"],
  gradiente: ["#0d0b1a", "#7a1a58", "#3d2399"],
};

export function hexParaRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbParaHex([r, g, b]: RGB): string {
  const f = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Luminância relativa WCAG 2.x (0 preto .. 1 branco). */
export function luminancia(rgb: RGB): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** Razão de contraste WCAG entre duas cores hex (1 a 21). */
export function contraste(hexA: string, hexB: string): number {
  const la = luminancia(hexParaRgb(hexA));
  const lb = luminancia(hexParaRgb(hexB));
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

export function rgbParaHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslParaRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Pior (menor) contraste de `hex` contra todas as superfícies do fundo. */
export function contrasteContraFundo(hex: string, fundo: FundoEscolha): number {
  return Math.min(...SUPERFICIES[fundo].map((s) => contraste(hex, s)));
}

/**
 * Quase-preto ou branco, o que tiver mais contraste sobre `hex`. Para certos
 * tons médios (ex.: #6666ff) nenhum chega a 4,5:1; por isso ajustarParaFundo
 * só aceita um destaque se o texto sobre ele passar.
 */
export function textoSobre(hex: string): string {
  return contraste(hex, "#ffffff") >= contraste(hex, "#111114") ? "#ffffff" : "#111114";
}

/**
 * Move a luminosidade (HSL) de `hex` na direção que aumenta o contraste contra
 * o fundo (clarear em fundo escuro, escurecer em fundo claro), em passos de
 * 0,02, até passar de `minimo`. `limite` é o quanto de luminosidade pode
 * andar (1 = livre). Devolve null se não houver como.
 */
export function ajustarParaFundo(
  hex: string,
  fundo: FundoEscolha,
  minimo = CONTRASTE_MIN_DESTAQUE,
  limite = 1,
): string | null {
  const [h, s, l0] = rgbParaHsl(hexParaRgb(hex));
  const claroPeloFundo = fundo === "claro" ? -1 : 1;
  for (let passo = 0; passo * 0.02 <= limite + 1e-9; passo++) {
    const l = l0 + claroPeloFundo * passo * 0.02;
    if (l < 0.04 || l > 0.96) break;
    const candidato = rgbParaHex(hslParaRgb(h, s, l));
    if (contrasteContraFundo(candidato, fundo) >= minimo && contraste(candidato, textoSobre(candidato)) >= CONTRASTE_MIN_TEXTO) {
      return candidato;
    }
  }
  return null;
}

/**
 * Cor dominante a partir de pixels RGB crus (3 bytes por pixel). Agrupa por
 * matiz (24 baldes) e pesa por saturação e por luminosidade média, para que
 * céu estourado, asfalto e preto não ganhem do corpo colorido. Devolve null se
 * a imagem for praticamente cinza (carro branco/prata/preto): nesse caso não
 * existe "cor da foto" para usar.
 */
export function corDominante(pixels: Uint8Array | Buffer): RGB | null {
  const BALDES = 24;
  const peso = new Array<number>(BALDES).fill(0);
  const soma = Array.from({ length: BALDES }, () => [0, 0, 0] as [number, number, number]);
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    const rgb: RGB = [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
    const [h, s, l] = rgbParaHsl(rgb);
    if (s < 0.25 || l < 0.12 || l > 0.9) continue;
    const w = s * (1 - Math.abs(2 * l - 1));
    const b = Math.min(BALDES - 1, Math.floor((h / 360) * BALDES));
    peso[b]! += w;
    soma[b]![0] += rgb[0] * w;
    soma[b]![1] += rgb[1] * w;
    soma[b]![2] += rgb[2] * w;
  }
  const total = peso.reduce((a, b) => a + b, 0);
  const melhor = peso.reduce((m, v, i) => (v > peso[m]! ? i : m), 0);
  // exige que a cor vencedora tenha presença mínima
  if (total === 0 || peso[melhor]! < 0.02 * (pixels.length / 3)) return null;
  const w = peso[melhor]!;
  return [soma[melhor]![0] / w, soma[melhor]![1] / w, soma[melhor]![2] / w];
}

export interface DestaqueResolvido {
  hex: string;
  /** Texto legível para colocar SOBRE o destaque (preenchimentos). */
  texto: string;
  /** De onde veio: nome da paleta, a foto, ou a cor padrão por falha. */
  origem: "paleta" | "foto" | "padrao";
}

function destaqueDaPaleta(cor: CorDestaque, fundo: FundoEscolha, origem: "paleta" | "padrao"): DestaqueResolvido {
  const hex = ajustarParaFundo(HEX_BASE[cor], fundo) ?? ajustarParaFundo(HEX_BASE[COR_PADRAO], fundo) ?? (fundo === "claro" ? "#8a4b00" : "#ffd27a");
  return { hex, texto: textoSobre(hex), origem };
}

/**
 * Resolve a cor de destaque final. Para "automatica", `dominante` é a cor
 * extraída da foto (ou null se a extração falhou): pega o matiz dela com
 * saturação e luminosidade de destaque, e só aceita se o contraste passar
 * ajustando a luminosidade em até 0,25. Se não passar, cai no padrão.
 */
export function resolverDestaque(cor: CorEscolha, fundo: FundoEscolha, dominante: RGB | null): DestaqueResolvido {
  if (cor !== "automatica") return destaqueDaPaleta(cor, fundo, "paleta");
  if (!dominante) return destaqueDaPaleta(COR_PADRAO, fundo, "padrao");
  const [h, s] = rgbParaHsl(dominante);
  const base = rgbParaHex(hslParaRgb(h, Math.min(0.9, Math.max(0.6, s)), fundo === "claro" ? 0.38 : 0.62));
  const hex = ajustarParaFundo(base, fundo, CONTRASTE_MIN_DESTAQUE, 0.25);
  if (!hex) return destaqueDaPaleta(COR_PADRAO, fundo, "padrao");
  return { hex, texto: textoSobre(hex), origem: "foto" };
}

/** Hex válido (#rrggbb) para RGB, ou null. Usado para a cor automática vinda por prop. */
export function corParaRgb(hex: string | null | undefined): RGB | null {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? hexParaRgb(hex) : null;
}
