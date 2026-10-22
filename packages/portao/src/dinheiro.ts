// Dinheiro e quilometragem na tela. O idioma da INTERFACE não decide o jeito de escrever o valor:
// o preço é escrito pela moeda do DADO (separadores da terra daquela moeda), e quando essa moeda não é a que
// a pessoa esperaria no idioma escolhido, o código da moeda aparece junto. Sem moeda no dado, nunca se inventa uma.
import { comIdioma, idiomaAtual, localeDe, t, type Idioma } from "./idioma/index.js";

/** Onde cada moeda é escrita "em casa" (separador de milhar e de centavos). */
const CASA: Record<string, string> = { BRL: "pt-BR", USD: "en-US", GBP: "en-GB", RON: "ro-RO", MDL: "ro-MD", RUB: "ru-RU" };
/** A moeda que quem lê cada idioma de interface esperaria; as outras levam o código à vista. */
const ESPERADA: Record<Idioma, string | null> = { en: null, "pt-BR": "BRL", ro: "RON", ru: "RUB" };

export function formatarPreco(valor: number, moeda: string | undefined | null, idioma: Idioma = idiomaAtual()): string {
  const codigo = typeof moeda === "string" ? moeda.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(codigo)) {
    // moeda desconhecida: só o número, sem símbolo, e dito com todas as letras
    const numero = new Intl.NumberFormat(localeDe(idioma), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
    return `${numero} (${comIdioma(idioma, () => t("cartao.moedaNaoInformada"))})`;
  }
  let texto: string;
  try {
    texto = new Intl.NumberFormat(CASA[codigo] ?? "en-US", { style: "currency", currency: codigo }).format(valor);
  } catch {
    texto = `${codigo} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(valor)}`;
  }
  return ESPERADA[idioma] === codigo ? texto : `${texto} (${codigo})`;
}

/** Inteiro com milhar sem ambiguidade: ponto em português, espaço fixo nos outros idiomas ("92 991"). */
export function formatarKm(km: number, idioma: Idioma = idiomaAtual()): string {
  const n = Math.round(km).toString().replace(/\B(?=(\d{3})+(?!\d))/g, idioma === "pt-BR" ? "." : " ");
  return comIdioma(idioma, () => t("cartao.km", { km: n }));
}
