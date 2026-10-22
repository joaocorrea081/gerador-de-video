// Camada de tradução do painel. Todo texto visível sai de um catálogo por idioma (idioma/*.ts).
// O idioma da pessoa vem do cookie "painel-idioma"; sem cookie, inglês (a língua da conversa com o cliente).
// A requisição inteira roda dentro de comIdioma(), então t() sabe o idioma sem passá-lo de mão em mão.
import { AsyncLocalStorage } from "node:async_hooks";
import { EN } from "./en.js";
import { PT_BR } from "./pt-BR.js";
import { RO, PENDENTES_RO } from "./ro.js";
import { RU, PENDENTES_RU } from "./ru.js";

export const IDIOMAS = ["en", "pt-BR", "ro", "ru"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export type Chave = keyof typeof EN;

/** Padrão do produto: inglês. */
export const IDIOMA_PADRAO: Idioma = "en";
/** Fora de uma requisição (testes, código de biblioteca, rotinas em segundo plano) o texto sai em português. */
export const IDIOMA_SEM_REQUISICAO: Idioma = "pt-BR";
export const NOME_DO_COOKIE = "painel-idioma";

/** Cada idioma escrito no próprio idioma: quem não lê o idioma atual ainda acha o seu. */
export const NOME_NATIVO: Record<Idioma, string> = { en: "English", "pt-BR": "Português (Brasil)", ro: "Română", ru: "Русский" };

export const CATALOGOS: Record<Idioma, Record<string, string>> = { en: EN, "pt-BR": PT_BR, ro: RO, ru: RU };
/** Chaves que o romeno e o russo ainda não têm com confiança: caem para o inglês, de propósito. */
export const PENDENTES: Record<Idioma, readonly string[]> = { en: [], "pt-BR": [], ro: PENDENTES_RO, ru: PENDENTES_RU };

const LOCALE: Record<Idioma, string> = { en: "en-GB", "pt-BR": "pt-BR", ro: "ro-RO", ru: "ru-RU" };

const contexto = new AsyncLocalStorage<Idioma>();

export function ehIdioma(v: unknown): v is Idioma {
  return typeof v === "string" && (IDIOMAS as readonly string[]).includes(v);
}

export function comIdioma<T>(idioma: Idioma, fn: () => T): T {
  return contexto.run(idioma, fn);
}

export function idiomaAtual(): Idioma {
  return contexto.getStore() ?? IDIOMA_SEM_REQUISICAO;
}

export function localeDe(idioma: Idioma = idiomaAtual()): string {
  return LOCALE[idioma];
}

/** Lê o idioma do cabeçalho Cookie. Valor desconhecido ou ausente = padrão. */
export function idiomaDoCookie(cabecalho: string | undefined): Idioma {
  if (!cabecalho) return IDIOMA_PADRAO;
  for (const par of cabecalho.split(";")) {
    const i = par.indexOf("=");
    if (i < 0) continue;
    if (par.slice(0, i).trim() !== NOME_DO_COOKIE) continue;
    let v = par.slice(i + 1).trim();
    try { v = decodeURIComponent(v); } catch { /* valor torto: cai no padrão */ }
    return ehIdioma(v) ? v : IDIOMA_PADRAO;
  }
  return IDIOMA_PADRAO;
}

function achar(idioma: Idioma, chave: string): string | undefined {
  return CATALOGOS[idioma][chave] ?? EN[chave as Chave];
}

function preencher(modelo: string, params?: Record<string, string | number>): string {
  if (!params) return modelo;
  return modelo.replace(/\{(\w+)\}/g, (m, nome: string) => (params[nome] === undefined ? m : String(params[nome])));
}

/** Texto do catálogo no idioma atual; sem a chave nesse idioma, o inglês; sem nenhum, a própria chave. */
export function t(chave: Chave, params?: Record<string, string | number>): string {
  return preencher(achar(idiomaAtual(), chave) ?? chave, params);
}

/** Texto cuja chave é montada na hora (ex.: "estado.aprovado"). Devolve undefined se a chave não existir. */
export function tOpcional(chave: string, params?: Record<string, string | number>): string | undefined {
  const m = achar(idiomaAtual(), chave);
  return m === undefined ? undefined : preencher(m, params);
}

/** Plural pelo idioma: procura "base.one", "base.few", "base.many" ou "base.other" (Intl.PluralRules). */
export function tp(base: string, n: number, params: Record<string, string | number> = {}, idioma: Idioma = idiomaAtual()): string {
  // Português do Brasil: só o 1 é singular ("0 vídeos"), como o painel sempre escreveu; o CLDR trata o 0 como singular.
  const categoria = idioma === "pt-BR" ? (n === 1 ? "one" : "other") : new Intl.PluralRules(localeDe(idioma)).select(n);
  const m = achar(idioma, `${base}.${categoria}`) ?? achar(idioma, `${base}.other`) ?? base;
  return preencher(m, { n, ...params });
}

/** Chaves que o JavaScript do navegador também usa. As "js.*" são só dele; as outras são divididas com o servidor. */
const PREFIXOS_NAVEGADOR = ["js.", "ia.", "app.", "acao.", "redes.origem.", "redes.limite", "redes.mais", "redes.previaContagem", "tempo.fuso", "motivo."];

/** O pedaço do catálogo que vai para o navegador, já no idioma pedido. Inglês cobre o que faltar. */
export function catalogoDoNavegador(idioma: Idioma): Record<string, string> {
  const saida: Record<string, string> = {};
  const serve = (k: string): boolean => PREFIXOS_NAVEGADOR.some((p) => k.startsWith(p));
  for (const [k, v] of Object.entries(EN)) if (serve(k)) saida[k] = v;
  for (const [k, v] of Object.entries(CATALOGOS[idioma])) if (serve(k)) saida[k] = v;
  return saida;
}

/** "estado.x" traduzido, ou o próprio código quando não há tradução. */
export function rotuloDe(prefixo: string, valor: string): string {
  return tOpcional(`${prefixo}.${valor}`) ?? valor;
}
