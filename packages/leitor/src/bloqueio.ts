// Reconhece quando o site NÃO quer ser lido por robô: 403, desafio do
// Cloudflare, captcha, página vazia no lugar do catálogo, redirecionamento
// para login. Ao reconhecer, o leitor PARA e diz qual sinal apareceu — nunca
// insiste nem martela o site (INFRA.md, "comportar-se como gente").
//
// Pura: recebe resposta/HTML e decide. Testável com arquivos salvos.

import * as cheerio from "cheerio";

export type SinalBloqueio =
  | "http-403" // acesso negado
  | "http-429" // muitas requisições
  | "desafio-cloudflare" // "Just a moment...", Turnstile, cf-chl
  | "captcha" // reCAPTCHA / hCaptcha numa página sem catálogo
  | "login" // redirecionado para tela de entrar
  | "pagina-vazia"; // 200 mas sem conteúdo onde deveria ter catálogo

export const DESCRICAO_SINAL: Record<SinalBloqueio, string> = {
  "http-403": "o site respondeu 403 (acesso negado)",
  "http-429": "o site respondeu 429 (muitas requisições)",
  "desafio-cloudflare": "o site mostrou a verificação do Cloudflare",
  captcha: "o site pediu um captcha",
  login: "o site mandou para uma tela de login",
  "pagina-vazia": "a página veio vazia, sem catálogo",
};

export class BloqueioError extends Error {
  constructor(
    readonly sinal: SinalBloqueio,
    readonly url: string,
  ) {
    super(`Bloqueio em ${url}: ${DESCRICAO_SINAL[sinal]}.`);
  }
}

export interface RespostaLida {
  /** Endereço pedido. */
  url: string;
  /** Endereço depois dos redirecionamentos, se conhecido. */
  urlFinal?: string;
  /** Código HTTP, se o navegador informa (o do navegador da pessoa não informa). */
  status?: number;
  /** Cabeçalho `cf-mitigated`, se visto. */
  cfMitigated?: string;
  html: string;
}

const CAMINHO_DE_LOGIN = /\/(login|signin|sign-in|entrar|acesso|auth|account\/login|wp-login\.php)(\/|$|\?)/i;

/** Devolve o sinal de bloqueio, ou undefined se a página parece normal. */
export function detectarBloqueio(r: RespostaLida): SinalBloqueio | undefined {
  const $ = cheerio.load(r.html);
  const titulo = $("title").first().text().trim();
  const corpo = $("body").clone().find("script,style,noscript").remove().end().text().replace(/\s+/g, " ").trim();
  const temDadoDeVeiculo = /"@type"\s*:\s*(\[[^\]]*)?"(Car|Vehicle)"/.test(r.html);

  if (
    r.cfMitigated?.toLowerCase() === "challenge" ||
    /^(just a moment|um momento|attention required|verificando se você é humano|checking your browser)/i.test(titulo) ||
    /challenge-platform|cf-chl-|cf-browser-verification|id="challenge-form"|cf-turnstile/i.test(r.html)
  ) {
    if (!temDadoDeVeiculo) return "desafio-cloudflare";
  }

  if (r.status === 429) return "http-429";
  if (r.status === 403 || r.status === 401) return "http-403";

  if (!temDadoDeVeiculo && corpo.length < 1500 && /g-recaptcha|h-captcha|hcaptcha|recaptcha\/api|captcha-delivery|px-captcha/i.test(r.html)) {
    return "captcha";
  }

  if (r.urlFinal) {
    try {
      const pedida = new URL(r.url);
      const final = new URL(r.urlFinal);
      if (CAMINHO_DE_LOGIN.test(final.pathname + final.search) && !CAMINHO_DE_LOGIN.test(pedida.pathname + pedida.search)) {
        return "login";
      }
    } catch {
      // endereço ilegível: segue para os outros sinais.
    }
  }
  if (!temDadoDeVeiculo && $('input[type="password"]').length > 0 && corpo.length < 1500) return "login";

  if (corpo.length < 50 && $("a[href]").length < 2 && !temDadoDeVeiculo) return "pagina-vazia";

  return undefined;
}

/** Lança `BloqueioError` se a resposta tem sinal de bloqueio. */
export function exigirSemBloqueio(r: RespostaLida): void {
  const sinal = detectarBloqueio(r);
  if (sinal) throw new BloqueioError(sinal, r.url);
}
