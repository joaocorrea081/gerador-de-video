import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { baixarFotos } from "./fotos.js";
import { lerDimensoes } from "./dimensoes-imagem.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const GRANDE = readFileSync(join(AQUI, "fixtures", "fotos", "grande.jpg")); // 1024x768
const PEQUENA = readFileSync(join(AQUI, "fixtures", "fotos", "pequena.jpg")); // 100x100

test("lerDimensoes lê largura/altura reais de um JPEG", () => {
  assert.deepEqual(lerDimensoes(GRANDE), { largura: 1024, altura: 768 });
  assert.deepEqual(lerDimensoes(PEQUENA), { largura: 100, altura: 100 });
});

test("descarta foto abaixo de 800px de largura", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-fotos-"));
  try {
    const resultado = await baixarFotos(
      ["https://exemplo/pequena.jpg"],
      pasta,
      async () => PEQUENA,
    );
    assert.equal(resultado.baixadas.length, 0);
    assert.equal(resultado.descartadas.length, 1);
    assert.equal(resultado.descartadas[0]!.motivo, "pequena");
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test("descarta duplicata pelo HASH DO CONTEÚDO, mesmo com nomes de URL diferentes", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-fotos-"));
  try {
    const resultado = await baixarFotos(
      ["https://exemplo/foto-a.jpg", "https://exemplo/foto-b-nome-diferente.jpg"],
      pasta,
      async () => GRANDE, // mesmo conteúdo para as duas URLs
    );
    assert.equal(resultado.baixadas.length, 1, "só a primeira deve passar");
    assert.equal(resultado.descartadas.length, 1);
    assert.equal(resultado.descartadas[0]!.motivo, "duplicada");
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

test("foto grande e única é baixada e registrada com dimensões", async () => {
  const pasta = await mkdtemp(join(tmpdir(), "leitor-fotos-"));
  try {
    const resultado = await baixarFotos(["https://exemplo/grande.jpg"], pasta, async () => GRANDE);
    assert.equal(resultado.baixadas.length, 1);
    assert.equal(resultado.baixadas[0]!.largura, 1024);
    assert.equal(resultado.baixadas[0]!.altura, 768);
    const bytesNoDisco = readFileSync(resultado.baixadas[0]!.caminhoLocal);
    assert.deepEqual(bytesNoDisco, GRANDE);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});
