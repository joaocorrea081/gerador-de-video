import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { adaptadorAutoCerto } from "./autocerto.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const lerFixture = (nome: string) =>
  readFileSync(join(AQUI, "..", "fixtures", nome), "utf8");

test("listagem: extrai URLs de detalhe do HTML real salvo em fixture", () => {
  const html = lerFixture("listagem.html");
  const urls = adaptadorAutoCerto.extrairUrlsDetalhe(html, "https://rota66bh.com.br/Veiculos");

  assert.ok(urls.length >= 3, `esperava pelo menos 3 URLs, achou ${urls.length}`);
  for (const url of urls) {
    assert.match(url, /^https:\/\/rota66bh\.com\.br\/Veiculo\/.+\/\d+\/detalhes$/);
  }
});

test("detalhe: lê a ficha completa via JSON-LD (caminho feliz)", () => {
  const html = lerFixture("detalhe-com-preco.html");
  const ficha = adaptadorAutoCerto.extrairFicha(html);

  assert.equal(ficha.marca, "PEUGEOT");
  assert.equal(ficha.modelo, "2008 1.6 16V FLEX STYLE 4P AUTOMÁTICO");
  assert.equal(ficha.ano, 2023);
  assert.equal(ficha.km, 47606);
  assert.equal(ficha.preco, 82700);
  assert.equal(ficha.moeda, "BRL");
  assert.ok(ficha.fotos.length > 0);
  assert.match(ficha.fotos[0]!, /^https:\/\/www\.autocerto\.com\/fotos\//);
});

test("detalhe sem JSON-LD de Car: cai no plano B de CSS sem quebrar", () => {
  const html = lerFixture("detalhe-sem-jsonld.html");
  const ficha = adaptadorAutoCerto.extrairFicha(html);

  // Sem JSON-LD, o plano B de CSS cobre marca, modelo, ano, km e preço
  // (h1.vd-title, .vd-spec-text, .precoVeiculo), medidos no site real.
  assert.equal(ficha.marca, "PEUGEOT");
  assert.equal(ficha.ano, 2023);
  assert.equal(ficha.preco, 82700);
  assert.equal(ficha.km, 47606);
  assert.ok(ficha.fotos.length > 0);
});

test("detalhe sem preço: campo fica ausente, nunca 0 nem placeholder", () => {
  const html = lerFixture("detalhe-sem-preco.html");
  const ficha = adaptadorAutoCerto.extrairFicha(html);

  assert.equal(ficha.preco, undefined);
  assert.equal(ficha.moeda, undefined);
  // O resto da ficha continua lido normalmente.
  assert.equal(ficha.marca, "PEUGEOT");
  assert.equal(ficha.km, 47606);
});

test("fotos: prioriza data-src do carrossel sobre o array `image` do JSON-LD", () => {
  const html = lerFixture("detalhe-com-preco.html");
  const ficha = adaptadorAutoCerto.extrairFicha(html);
  // O carrossel real desta fixture tem mais fotos que o array `image` do JSON-LD.
  assert.ok(ficha.fotos.length >= 10, `esperava >= 10 fotos do carrossel, achou ${ficha.fotos.length}`);
});

test("conversão de número no formato brasileiro (ponto de milhar, vírgula decimal)", () => {
  const html = `<!doctype html><html><body>
    <div class="precoVeiculo"><strong>R$ 82.700,00</strong></div>
    <div class="vd-spec"><span class="vd-spec-text"><small>Km</small><strong>47.606</strong></span></div>
  </body></html>`;
  const ficha = adaptadorAutoCerto.extrairFicha(html);
  assert.equal(ficha.preco, 82700, "R$ 82.700,00 deve virar 82700, nunca 82.7 nem 8270000");
  assert.equal(ficha.km, 47606, "47.606 (ponto de milhar) deve virar 47606, nunca 47.606 nem 47");
});
