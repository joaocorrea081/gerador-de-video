// Adaptador genérico: lê QUALQUER página que traga JSON-LD schema.org de
// Vehicle/Car, sem depender de seletor de CSS de plataforma nenhuma.
// Campo ausente fica ausente: nada de deduzir, estimar ou pôr placeholder.

import * as cheerio from "cheerio";
import type { Adaptador, FichaLida } from "../adaptador.js";
import { paraAno, paraNumero } from "../numeros.js";

type Nodo = Record<string, unknown>;

const TIPOS_VEICULO = new Set(["Car", "Vehicle"]);

const ehObjeto = (v: unknown): v is Nodo => typeof v === "object" && v !== null && !Array.isArray(v);
const comoLista = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const texto = (v: unknown): string | undefined => {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
};

function ehVeiculo(n: Nodo): boolean {
  return comoLista(n["@type"] as string | string[] | undefined).some((t) => typeof t === "string" && TIPOS_VEICULO.has(t));
}

/** Achata blocos, arrays e `@graph` numa lista plana de nós (um nível de @graph, recursivo). */
function achatar(dado: unknown, saida: Nodo[]): void {
  if (Array.isArray(dado)) {
    for (const item of dado) achatar(item, saida);
  } else if (ehObjeto(dado)) {
    saida.push(dado);
    if (dado["@graph"] !== undefined) achatar(dado["@graph"], saida);
  }
}

/** Todos os nós JSON-LD da página (blocos malformados são ignorados). */
export function lerNodosJsonLd(html: string): Nodo[] {
  const $ = cheerio.load(html);
  const nodos: Nodo[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      achatar(JSON.parse($(el).text()), nodos);
    } catch {
      // JSON-LD malformado: ignora este bloco.
    }
  });
  return nodos;
}

/** Nós do tipo Vehicle/Car presentes na página. */
export function lerVeiculosJsonLd(html: string): Nodo[] {
  return lerNodosJsonLd(html).filter(ehVeiculo);
}

function nomeDe(v: unknown): string | undefined {
  if (ehObjeto(v)) return texto(v["name"]);
  return texto(v);
}

function absoluta(href: string, base: string | undefined): string | undefined {
  try {
    const u = base ? new URL(href, base) : new URL(href);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined; // relativa sem base: não dá para completar, fica de fora.
  }
}

function fotosDe(v: unknown, base: string | undefined): string[] {
  const urls: string[] = [];
  for (const item of comoLista(v as unknown)) {
    const bruto = ehObjeto(item) ? texto(item["url"] ?? item["contentUrl"]) : texto(item);
    const url = bruto ? absoluta(bruto, base) : undefined;
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function precoDe(offers: unknown): { preco?: number; moeda?: string } {
  for (const oferta of comoLista(offers as unknown)) {
    if (!ehObjeto(oferta)) continue;
    const spec = comoLista(oferta["priceSpecification"] as unknown).find(ehObjeto);
    const bruto = oferta["price"] ?? oferta["lowPrice"] ?? spec?.["price"];
    const preco = paraNumero(typeof bruto === "string" || typeof bruto === "number" ? bruto : undefined);
    if (preco !== undefined) {
      const moeda = texto(oferta["priceCurrency"] ?? spec?.["priceCurrency"]);
      return moeda ? { preco, moeda } : { preco };
    }
  }
  return {};
}

/** Km só se a unidade for quilômetro (ou não declarada). Milhas ficam ausentes: converter seria deduzir. */
function kmDe(v: unknown): number | undefined {
  const odometro = comoLista(v as unknown).find(ehObjeto);
  if (!odometro) return undefined;
  const unidade = texto(odometro["unitCode"])?.toUpperCase();
  if (unidade !== undefined && unidade !== "KMT" && unidade !== "KM") return undefined;
  const bruto = odometro["value"];
  return paraNumero(typeof bruto === "string" || typeof bruto === "number" ? bruto : undefined);
}

function fichaDe(v: Nodo, urlPagina: string | undefined): FichaLida {
  const ficha: FichaLida = { fotos: fotosDe(v["image"], urlPagina), opcionais: [] };
  const definir = <K extends keyof FichaLida>(chave: K, valor: FichaLida[K] | undefined): void => {
    if (valor !== undefined) ficha[chave] = valor;
  };
  definir("marca", nomeDe(v["brand"]) ?? nomeDe(v["manufacturer"]));
  const modelo = nomeDe(v["model"]);
  const config = texto(v["vehicleConfiguration"]);
  definir("modelo", [modelo, config].filter(Boolean).join(" ") || undefined);
  const ano = [v["vehicleModelDate"], v["modelDate"], v["productionDate"], v["dateVehicleFirstRegistered"]]
    .map((x) => paraAno(texto(x)))
    .find((x) => x !== undefined);
  definir("ano", ano);
  definir("km", kmDe(v["mileageFromOdometer"]));
  const { preco, moeda } = precoDe(v["offers"]);
  definir("preco", preco);
  definir("moeda", moeda);
  definir("cor", nomeDe(v["color"]));
  definir("combustivel", nomeDe(v["fuelType"]));
  definir("cambio", nomeDe(v["vehicleTransmission"]));
  const portas = paraNumero(typeof v["numberOfDoors"] === "string" || typeof v["numberOfDoors"] === "number" ? v["numberOfDoors"] : undefined);
  definir("portas", portas !== undefined && Number.isInteger(portas) && portas >= 1 && portas <= 6 ? portas : undefined);
  definir("descricaoRevenda", texto(v["description"]));
  return ficha;
}

// ---------------------------------------------------------------- listagem

const PALAVRA_DE_CARRO = /(ve[ií]culo|carro|auto|usado|seminovo|detalhe|estoque|comprar|anuncio|anúncio)/i;
const PALAVRA_DE_LISTAGEM = /(estoque|ve[ií]culos|carros|seminovos|usados)/i;

const semWww = (host: string): string => host.toLowerCase().replace(/^www\./, "");

function mesmoSite(a: URL, b: URL): boolean {
  return semWww(a.hostname) === semWww(b.hostname);
}

function urlDoItem(item: unknown, base: string): string | undefined {
  if (!ehObjeto(item)) return typeof item === "string" ? absoluta(item, base) : undefined;
  const direto = texto(item["url"]) ?? texto(item["@id"]);
  if (direto) return absoluta(direto, base);
  if (item["item"] !== undefined) return urlDoItem(item["item"], base);
  const oferta = comoLista(item["offers"] as unknown).find(ehObjeto);
  const deOferta = oferta ? texto(oferta["url"]) : undefined;
  return deOferta ? absoluta(deOferta, base) : undefined;
}

/** Links que parecem de carro, na própria página, quando não há JSON-LD que os liste. */
function linksParecidosComCarro(html: string, base: string): string[] {
  const $ = cheerio.load(html);
  const origem = new URL(base);
  const urls = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = href ? absoluta(href, base) : undefined;
    if (!url) return;
    const u = new URL(url);
    if (!mesmoSite(u, origem)) return;
    if (u.pathname === origem.pathname || u.pathname === "/") return;
    // Detalhe de carro: palavra de carro no caminho + um número (id ou ano).
    if (PALAVRA_DE_CARRO.test(u.pathname) && /\d{3,}/.test(u.pathname)) {
      u.hash = "";
      urls.add(u.toString());
    }
  });
  return [...urls];
}

/** Acha, na página, o link mais provável da listagem do estoque (para quem entrou pela home). */
export function descobrirUrlListagem(html: string, base: string): string | undefined {
  const $ = cheerio.load(html);
  const origem = new URL(base);
  const achados: URL[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = href ? absoluta(href, base) : undefined;
    if (!url) return;
    const u = new URL(url);
    if (!mesmoSite(u, origem) || u.pathname === "/" || u.pathname === origem.pathname) return;
    if (/\d{3,}/.test(u.pathname)) return; // com id/ano é detalhe, não listagem.
    if (PALAVRA_DE_LISTAGEM.test(u.pathname) || PALAVRA_DE_LISTAGEM.test($(el).text())) {
      u.hash = "";
      u.search = "";
      achados.push(u);
    }
  });
  achados.sort((a, b) => a.pathname.length - b.pathname.length);
  return achados[0]?.toString();
}

export const adaptadorJsonLd: Adaptador = {
  nome: "jsonld",

  /** Sem convenção de plataforma: a listagem é o endereço que a pessoa cadastrou. */
  urlListagem: (baseUrl) => baseUrl,

  extrairUrlsDetalhe(html: string, baseUrl: string): string[] {
    const urls = new Set<string>();
    const nodos = lerNodosJsonLd(html);
    // 1. Listas estruturadas (ItemList) e veículos que já trazem a própria URL.
    for (const n of nodos) {
      if (comoLista(n["@type"] as string | string[] | undefined).includes("ItemList")) {
        for (const item of comoLista(n["itemListElement"] as unknown)) {
          const url = urlDoItem(item, baseUrl);
          if (url) urls.add(url);
        }
      } else if (ehVeiculo(n)) {
        const url = urlDoItem(n, baseUrl);
        if (url) urls.add(url);
      }
    }
    // 2. Sem isso, links com cara de detalhe de carro (heurística; a leitura da
    //    ficha confirma ou descarta cada um).
    if (urls.size === 0) for (const u of linksParecidosComCarro(html, baseUrl)) urls.add(u);
    const pagina = baseUrl.replace(/#.*$/, "");
    urls.delete(pagina);
    return [...urls];
  },

  extrairFicha(html: string, url?: string): FichaLida {
    const veiculo = lerVeiculosJsonLd(html)[0];
    return veiculo ? fichaDe(veiculo, url) : { fotos: [], opcionais: [] };
  },
};
