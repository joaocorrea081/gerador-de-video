import assert from "node:assert/strict";
import { test } from "node:test";
import { ErroValidacao, validarResposta } from "./validacao.js";

test("descarta preço/ano/km/modelo mesmo quando o modelo os devolve", () => {
  const jsonMalicioso = JSON.stringify({
    texto: { titulo: "Corolla pronto pra rodar", corpo: "Carro revisado, pronto pra buscar." },
    cardapio: { fundo: "claro", ritmo: "calmo" },
    ordemFotos: [0, 1, 2],
    // campos que o modelo NUNCA deveria escrever — injetados de propósito:
    preco: 999999,
    ano: 1900,
    km: 1,
    modelo: "Ferrari Falso",
  });

  console.log("ANTES — JSON cru (malicioso) devolvido pelo modelo:");
  console.log(jsonMalicioso);

  const escolha = validarResposta(jsonMalicioso, 5);

  console.log("DEPOIS — escolha validada (sem os campos proibidos):");
  console.log(JSON.stringify(escolha));

  assert.deepEqual(Object.keys(escolha).sort(), ["cardapio", "ordemFotos", "texto"]);
  const serializado = JSON.stringify(escolha);
  assert.ok(!serializado.includes("999999"), "preco não pode atravessar");
  assert.ok(!serializado.includes("1900"), "ano não pode atravessar");
  assert.ok(!serializado.includes("Ferrari"), "modelo não pode atravessar");
  assert.equal(escolha.texto.titulo, "Corolla pronto pra rodar");
  assert.equal(escolha.cardapio.fundo, "claro");
});

test("fundo fora do cardápio dispara ErroValidacao", () => {
  const bruto = JSON.stringify({
    texto: { titulo: "a", corpo: "b" },
    cardapio: { fundo: "azul", ritmo: "calmo" },
    ordemFotos: [0],
  });
  assert.throws(() => validarResposta(bruto, 3), ErroValidacao);
});

test("ritmo fora do cardápio dispara ErroValidacao", () => {
  const bruto = JSON.stringify({
    texto: { titulo: "a", corpo: "b" },
    cardapio: { fundo: "claro", ritmo: "frenetico" },
    ordemFotos: [0],
  });
  assert.throws(() => validarResposta(bruto, 3), ErroValidacao);
});

test("texto.titulo acima do limite dispara ErroValidacao", () => {
  const bruto = JSON.stringify({
    texto: { titulo: "x".repeat(81), corpo: "b" },
    cardapio: { fundo: "claro", ritmo: "calmo" },
    ordemFotos: [0],
  });
  assert.throws(() => validarResposta(bruto, 3), ErroValidacao);
});

test("texto.corpo acima do limite dispara ErroValidacao", () => {
  const bruto = JSON.stringify({
    texto: { titulo: "a", corpo: "x".repeat(401) },
    cardapio: { fundo: "claro", ritmo: "calmo" },
    ordemFotos: [0],
  });
  assert.throws(() => validarResposta(bruto, 3), ErroValidacao);
});

test("JSON inválido dispara ErroValidacao", () => {
  assert.throws(() => validarResposta("isto não é json", 3), ErroValidacao);
});

test("índice de foto inexistente é descartado, duplicata removida, resto mantido", () => {
  const bruto = JSON.stringify({
    texto: { titulo: "a", corpo: "b" },
    cardapio: { fundo: "escuro", ritmo: "rapido" },
    ordemFotos: [0, 99, 1, 1, 2, -1],
  });
  const escolha = validarResposta(bruto, 3); // só os índices 0, 1, 2 existem
  assert.deepEqual(escolha.ordemFotos, [0, 1, 2]);
});
