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

// ---------------------------------------------------------------- ficha enriquecida

test("ficha completa: cor, combustível, câmbio, portas, opcionais e texto da revenda são lidos", () => {
  const ficha = adaptadorAutoCerto.extrairFicha(lerFixture("detalhe-ficha-completa.html"));

  assert.equal(ficha.cor, "Prata");
  assert.equal(ficha.combustivel, "Flex");
  assert.equal(ficha.cambio, "Automático");
  assert.equal(ficha.portas, 4);
  assert.equal(ficha.opcionais?.length, 28);
  assert.ok(ficha.opcionais?.includes("Ar condicionado"));
  assert.ok(ficha.opcionais?.includes("Direção Hidraulica"));
  assert.match(ficha.descricaoRevenda ?? "", /laudo cautelar/);
  // O que já funcionava continua vindo do dado.
  assert.equal(ficha.preco, 59900);
  assert.equal(ficha.km, 66157);
  assert.equal(ficha.ano, 2016);
});

test("ficha sem a seção técnica: campos novos ficam AUSENTES e nada quebra", () => {
  const ficha = adaptadorAutoCerto.extrairFicha(lerFixture("detalhe-sem-ficha.html"));

  for (const campo of ["cor", "combustivel", "cambio", "portas", "descricaoRevenda"] as const) {
    assert.equal(ficha[campo], undefined, `${campo} devia estar ausente`);
    assert.equal(campo in ficha, false, `${campo} não pode existir nem como undefined`);
  }
  assert.deepEqual(ficha.opcionais, []);
  assert.equal(ficha.preco, 82700);
  assert.equal(ficha.km, 47606);
  assert.ok(ficha.fotos.length > 0);
});

test("opcionais: lista vazia sem a seção, preenchida e sem repetição com ela", () => {
  assert.deepEqual(adaptadorAutoCerto.extrairFicha(lerFixture("detalhe-sem-ficha.html")).opcionais, []);
  const cheia = adaptadorAutoCerto.extrairFicha(lerFixture("detalhe-ficha-completa-2.html")).opcionais ?? [];
  assert.ok(cheia.length > 0);
  assert.equal(new Set(cheia).size, cheia.length);
});

test("texto livre da revenda fica no próprio campo e não vaza para outros", () => {
  const ficha = adaptadorAutoCerto.extrairFicha(lerFixture("detalhe-ficha-completa-2.html"));
  assert.match(ficha.descricaoRevenda ?? "", /^PEUGEOT 2008/);
  assert.ok((ficha.descricaoRevenda ?? "").includes("\n"), "preserva quebras de linha");
  for (const campo of ["marca", "modelo", "cor", "combustivel", "cambio"] as const) {
    assert.ok(!(ficha[campo] ?? "").includes("SUV compacto"), `${campo} contaminado`);
  }
  assert.ok(!(ficha.opcionais ?? []).some((o) => o.includes("SUV compacto")));
});

test("plano B de CSS: sem JSON-LD, lê cor, câmbio, combustível e portas da ficha", () => {
  const html = lerFixture("detalhe-ficha-completa.html").replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  const ficha = adaptadorAutoCerto.extrairFicha(html);
  assert.equal(ficha.cor, "Prata");
  assert.equal(ficha.cambio, "Automático");
  assert.equal(ficha.combustivel, "Flex");
  assert.equal(ficha.portas, 4);
});
