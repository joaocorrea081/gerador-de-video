import { test } from "node:test";
import assert from "node:assert/strict";
import { adaptadorJsonLd } from "./jsonld.js";
import { fixture } from "../teste-util.js";

test("genérico lê JSON-LD que NÃO é AutoCerto (@graph, tipo composto, foto relativa)", () => {
  const f = adaptadorJsonLd.extrairFicha(fixture("generico-detalhe-1.html"), "https://autosdoze.example.com.br/estoque/x");
  assert.equal(f.marca, "Fiat");
  assert.equal(f.modelo, "Argo Drive 1.0");
  assert.equal(f.ano, 2021);
  assert.equal(f.km, 38500);
  assert.equal(f.preco, 59900);
  assert.equal(f.moeda, "BRL");
  assert.deepEqual(f.fotos, [
    "https://autosdoze.example.com.br/fotos/argo-1.jpg",
    "https://autosdoze.example.com.br/fotos/argo-2.jpg",
  ]);
});

test("genérico: Vehicle com marca em texto, preço em priceSpecification; km em milhas fica ausente", () => {
  const f = adaptadorJsonLd.extrairFicha(fixture("generico-detalhe-2.html"));
  assert.equal(f.marca, "Volkswagen");
  assert.equal(f.ano, 2022);
  assert.equal(f.preco, 71000);
  assert.equal(f.km, undefined);
});

test("genérico: campo ausente fica ausente, sem placeholder", () => {
  const f = adaptadorJsonLd.extrairFicha(fixture("generico-detalhe-sem-preco.html"));
  assert.equal(f.marca, "Chevrolet");
  assert.equal(f.modelo, "Onix");
  for (const campo of ["ano", "km", "preco", "moeda"] as const) assert.equal(f[campo], undefined, campo);
  assert.deepEqual(f.fotos, []);
});

test("genérico: página sem Vehicle/Car (só AutoDealer) devolve ficha vazia", () => {
  const f = adaptadorJsonLd.extrairFicha(fixture("generico-home.html"));
  assert.deepEqual(f, { fotos: [] });
});

test("genérico: URLs de detalhe vêm do ItemList, completando as relativas", () => {
  const urls = adaptadorJsonLd.extrairUrlsDetalhe(fixture("generico-listagem.html"), "https://autosdoze.example.com.br/estoque");
  assert.deepEqual(urls, [
    "https://autosdoze.example.com.br/estoque/fiat-argo-2021-1001",
    "https://autosdoze.example.com.br/estoque/vw-polo-2022-1002",
    "https://autosdoze.example.com.br/estoque/gm-onix-2020-1003",
  ]);
});
