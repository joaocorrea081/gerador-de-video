// Adaptador da plataforma AutoCerto (static.autocerto.com), usada por
// rota66bh.com.br (site de teste, ver ETAPA-4-CRITERIO.md) e por muita
// revenda brasileira. Quando chegar o link do cliente, se a plataforma dele
// for outra, escreve-se outro adaptador — este arquivo não muda.

import * as cheerio from "cheerio";
import type { Adaptador, FichaLida } from "../adaptador.js";
import { paraAno, paraNumero } from "../numeros.js";

interface JsonLdCar {
  "@type"?: string;
  name?: string;
  brand?: { name?: string };
  model?: string;
  vehicleConfiguration?: string;
  vehicleModelDate?: string;
  productionDate?: string;
  mileageFromOdometer?: { value?: number | string };
  image?: string[] | string;
  color?: string;
  fuelType?: string;
  vehicleTransmission?: string;
  numberOfDoors?: number | string;
  description?: string;
  offers?: { price?: string | number; priceCurrency?: string };
}

/** Lê todos os blocos JSON-LD da página e devolve o primeiro do tipo "Car". */
function lerJsonLdCar($: cheerio.CheerioAPI): JsonLdCar | undefined {
  const blocos = $('script[type="application/ld+json"]');
  for (let i = 0; i < blocos.length; i++) {
    const texto = $(blocos[i]).text();
    let dado: unknown;
    try {
      dado = JSON.parse(texto);
    } catch {
      continue; // JSON-LD malformado: ignora este bloco, tenta o próximo.
    }
    if (dado && typeof dado === "object" && (dado as JsonLdCar)["@type"] === "Car") {
      return dado as JsonLdCar;
    }
  }
  return undefined;
}

/** Plano B: marca/modelo pelo `h1.vd-title` + `.vd-subtitle`, vistos no site de teste. */
function marcaModeloPorCss($: cheerio.CheerioAPI): { marca?: string; modelo?: string } {
  const titulo = $("h1.vd-title").first();
  if (titulo.length === 0) return {};

  const marca = titulo.find("small").first().text().trim() || undefined;
  const modeloTitulo = titulo.clone().find("small").remove().end().text().trim();
  const subtitulo = $(".vd-subtitle").first().text().trim();
  const modelo = [modeloTitulo, subtitulo].filter(Boolean).join(" ").trim() || undefined;

  const resultado: { marca?: string; modelo?: string } = {};
  if (marca !== undefined) resultado.marca = marca;
  if (modelo !== undefined) resultado.modelo = modelo;
  return resultado;
}

/** Plano B: lê um rótulo dentro de `.vd-spec-text` (ex: "Ano", "Km"), vistos no site de teste. */
function specPorCss($: cheerio.CheerioAPI, rotuloProcurado: string): string | undefined {
  let valor: string | undefined;
  $(".vd-spec-text").each((_, el) => {
    const rotulo = $(el).find("small").text().trim().toLowerCase();
    if (rotulo === rotuloProcurado.toLowerCase()) {
      valor = $(el).find("strong").text().trim();
    }
  });
  return valor;
}

/** Plano B: preço por `.precoVeiculo strong`, visto no site de teste. */
function precoPorCss($: cheerio.CheerioAPI): { preco?: number; moeda?: string } {
  const texto = $(".precoVeiculo strong").first().text().trim();
  const preco = paraNumero(texto);
  if (preco === undefined) return {};
  return { preco, moeda: "BRL" };
}

/**
 * Fotos pelos `data-src` do carrossel (lazy load). É a fonte MAIS confiável
 * para fotos nesta plataforma: o `image` do JSON-LD às vezes traz menos
 * fotos que o carrossel real (recon confirmado em rota66bh.com.br).
 */
function fotosPorDataSrc($: cheerio.CheerioAPI): string[] {
  const urls: string[] = [];
  $("[data-src]").each((_, el) => {
    const src = $(el).attr("data-src");
    if (src && /\.(jpe?g|png|webp)(\?|$)/i.test(src) && !urls.includes(src)) {
      urls.push(src);
    }
  });
  return urls;
}

const limpa = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\s+/g, " ") : undefined;

/** Portas: inteiro de 1 a 6; qualquer outra coisa fica ausente. */
function paraPortas(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : undefined;
  return n !== undefined && Number.isInteger(n) && n >= 1 && n <= 6 ? n : undefined;
}

/** Plano B: itens da seção "Opcionais" (`.opcionais_anuncio .vd-feature-grid li`), sem repetir. */
function opcionaisPorCss($: cheerio.CheerioAPI): string[] {
  const itens: string[] = [];
  $(".opcionais_anuncio .vd-feature-grid li").each((_, el) => {
    const t = limpa($(el).text());
    if (t && !itens.includes(t)) itens.push(t);
  });
  return itens;
}

/** Texto "Sobre este Veículo" (`.vd-about`) com as quebras de linha preservadas. */
function sobrePorCss($: cheerio.CheerioAPI): string | undefined {
  const bloco = $(".vd-about").first();
  if (bloco.length === 0) return undefined;
  const copia = bloco.clone();
  copia.find("br").replaceWith("\n");
  const texto = copia
    .text()
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto || undefined;
}

export const adaptadorAutoCerto: Adaptador = {
  nome: "autocerto",

  urlListagem(baseUrl: string): string {
    return new URL("/Veiculos", baseUrl).toString();
  },

  extrairUrlsDetalhe(html: string, baseUrl: string): string[] {
    const $ = cheerio.load(html);
    const urls = new Set<string>();
    $('a[href*="/Veiculo/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href && /\/Veiculo\/.+\/\d+\/detalhes/.test(href)) {
        urls.add(new URL(href, baseUrl).toString());
      }
    });
    return [...urls];
  },

  extrairFicha(html: string): FichaLida {
    const $ = cheerio.load(html);
    const car = lerJsonLdCar($);

    const ficha: FichaLida = { fotos: [], opcionais: [] };
    const definir = <K extends keyof FichaLida>(chave: K, valor: FichaLida[K] | undefined): void => {
      if (valor !== undefined) ficha[chave] = valor;
    };

    if (car) {
      // 1. JSON-LD primeiro — ver ordem obrigatória em ETAPA-4-CRITERIO.md.
      definir("marca", car.brand?.name);

      const modeloPartes = [car.model, car.vehicleConfiguration]
        .filter((parte): parte is string => Boolean(parte && parte.trim()))
        .join(" ");
      if (modeloPartes) definir("modelo", modeloPartes);

      definir("ano", paraAno(car.vehicleModelDate) ?? paraAno(car.productionDate));
      definir("km", paraNumero(car.mileageFromOdometer?.value));
      const preco = paraNumero(car.offers?.price);
      definir("preco", preco);
      if (preco !== undefined) {
        definir("moeda", car.offers?.priceCurrency ?? "BRL");
      }
      definir("cor", limpa(car.color));
      definir("combustivel", limpa(car.fuelType));
      definir("cambio", limpa(car.vehicleTransmission));
      definir("portas", paraPortas(car.numberOfDoors));
      definir("descricaoRevenda", limpa(car.description));
    }

    // 2. Fotos: prioriza data-src do carrossel; JSON-LD é plano B.
    ficha.fotos = fotosPorDataSrc($);
    if (ficha.fotos.length === 0 && car) {
      const imagens = car.image;
      if (Array.isArray(imagens)) ficha.fotos = imagens;
      else if (typeof imagens === "string") ficha.fotos = [imagens];
    }

    // 3. Seletor de CSS só como plano B, para o que faltou no JSON-LD.
    if (ficha.marca === undefined || ficha.modelo === undefined) {
      const { marca, modelo } = marcaModeloPorCss($);
      if (ficha.marca === undefined) definir("marca", marca);
      if (ficha.modelo === undefined) definir("modelo", modelo);
    }
    if (ficha.ano === undefined) {
      definir("ano", paraAno(specPorCss($, "Ano")));
    }
    if (ficha.km === undefined) {
      definir("km", paraNumero(specPorCss($, "Km")));
    }
    if (ficha.preco === undefined) {
      const { preco, moeda } = precoPorCss($);
      definir("preco", preco);
      definir("moeda", moeda);
    }

    if (ficha.cor === undefined) definir("cor", limpa(specPorCss($, "Cor")));
    if (ficha.combustivel === undefined) definir("combustivel", limpa(specPorCss($, "Combustível")));
    if (ficha.cambio === undefined) definir("cambio", limpa(specPorCss($, "Câmbio")));
    if (ficha.portas === undefined) definir("portas", paraPortas(specPorCss($, "Portas")));
    // O bloco "Sobre este Veículo" mantém as quebras de linha; vale mais que o
    // description do JSON-LD (que vem em linha única).
    definir("descricaoRevenda", sobrePorCss($) ?? ficha.descricaoRevenda);
    ficha.opcionais = opcionaisPorCss($);

    // 4. Campo ainda ausente fica ausente — nunca estimado (ETAPA-4-CRITERIO.md).
    return ficha;
  },
};
