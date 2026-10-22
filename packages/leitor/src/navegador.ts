// Abre páginas com Playwright, se comportando como gente (INFRA.md):
// User-Agent de navegador real, viewport normal, rolagem para disparar o
// lazy load. Técnica de rolagem reaproveitada de
// referencia/captura-portfolio.js.

import { chromium, type Browser, type Page } from "playwright";
import { exigirSemBloqueio } from "./bloqueio.js";
import { ehStatusDePaginaInexistente, PaginaInexistenteError } from "./pagina-inexistente.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export interface Navegador {
  /** Abre `url`, espera carregar e rola a página inteira para disparar o lazy load. */
  abrirERolar(url: string): Promise<string>;
  fechar(): Promise<void>;
}

async function rolarPaginaInteira(page: Page): Promise<void> {
  // Mesma técnica de referencia/captura-portfolio.js: rola em passos,
  // esperando entre cada um, até cobrir a altura total da página — é isso
  // que dispara o `data-src` -> `src` do lazy load.
  let altura = 0;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    altura = await page.evaluate(
      () =>
        Math.max(
          document.body.scrollHeight || 0,
          document.documentElement.scrollHeight || 0,
        ),
    );
    if (altura > 0) break;
    await page.waitForTimeout(300);
  }

  for (let y = 0; y < altura; y += 600) {
    await page.evaluate((valor) => window.scrollTo(0, valor), y);
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

export async function abrirNavegador(): Promise<Navegador & { browser: Browser }> {
  const browser = await chromium.launch();
  const contexto = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });

  return {
    browser,
    async abrirERolar(url: string): Promise<string> {
      const page = await contexto.newPage();
      try {
        const resposta = await page.goto(url, { waitUntil: "load", timeout: 45000 });
        // 404/410 = a página saiu do ar. Antes de qualquer outra coisa, para
        // quem chama poder distinguir isto de bloqueio ou de site fora do ar.
        if (resposta && ehStatusDePaginaInexistente(resposta.status())) {
          throw new PaginaInexistenteError(url, resposta.status() as 404 | 410);
        }
        const cf = resposta ? await resposta.headerValue("cf-mitigated") : null;
        await rolarPaginaInteira(page);
        const html = await page.content();
        // 403, desafio do Cloudflare, captcha, login ou página vazia: para aqui, sem insistir.
        exigirSemBloqueio({
          url,
          urlFinal: page.url(),
          html,
          ...(resposta ? { status: resposta.status() } : {}),
          ...(cf ? { cfMitigated: cf } : {}),
        });
        return html;
      } finally {
        await page.close();
      }
    },
    async fechar(): Promise<void> {
      await browser.close();
    },
  };
}
