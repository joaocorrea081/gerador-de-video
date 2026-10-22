import { test } from "node:test";
import assert from "node:assert/strict";
import type { Adaptador } from "./adaptador.js";
import type { Navegador } from "./navegador.js";
import { Leitor, CaminhoProibidoError } from "./leitor.js";

const ROBOTS_TEXTO = `
User-agent: *
Allow: /
Disallow: /Home/OrdenarVeiculos
`;

/** Navegador falso: nunca abre rede de verdade, só registra o que pediram. */
function navegadorFalso(html: string): Navegador & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async abrirERolar(url: string) {
      chamadas.push(url);
      return html;
    },
    async fechar() {},
  };
}

const adaptadorFalso: Adaptador = {
  nome: "falso",
  urlListagem: (baseUrl) => new URL("/Veiculos", baseUrl).toString(),
  extrairUrlsDetalhe: () => [],
  extrairFicha: () => ({ fotos: [] }),
};

test("respeita robots.txt: caminho proibido é recusado sem nem chamar o navegador", async (t) => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(ROBOTS_TEXTO, { status: 200 })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
  });

  const navegador = navegadorFalso("<html></html>");
  const leitor = new Leitor(adaptadorFalso, navegador, { intervaloMs: 0 });

  await assert.rejects(
    () => leitor.lerDetalhe("https://exemplo.com/Home/OrdenarVeiculos?x=1"),
    CaminhoProibidoError,
  );
  assert.equal(navegador.chamadas.length, 0, "não deveria ter aberto o navegador");
});

test("respeita robots.txt: caminho permitido segue normalmente", async (t) => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(ROBOTS_TEXTO, { status: 200 })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = fetchOriginal;
  });

  const navegador = navegadorFalso("<html></html>");
  const leitor = new Leitor(adaptadorFalso, navegador, { intervaloMs: 0 });

  const resultado = await leitor.lerDetalhe("https://exemplo.com/Veiculo/x/1/detalhes");
  assert.equal(resultado.url, "https://exemplo.com/Veiculo/x/1/detalhes");
  assert.equal(navegador.chamadas.length, 1);
});
