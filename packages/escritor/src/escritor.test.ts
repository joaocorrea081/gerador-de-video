import assert from "node:assert/strict";
import { test } from "node:test";
import { ErroEscritorEsgotado, escreverAnuncio } from "./escritor.js";
import { ProvedorFalso } from "./testes/provedor-falso.js";
import type { PedidoEscritor } from "./tipos.js";

const PEDIDO: PedidoEscritor = {
  dados: { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 50000, preco: 15000 },
  quantidadeFotos: 5,
  idioma: "pt-BR",
};

test("descarta preço/ano/km/modelo de ponta a ponta, passando pelo fluxo completo", async () => {
  const jsonMalicioso = JSON.stringify({
    texto: { titulo: "Corolla revisado", corpo: "Pronto pra rodar, venha ver." },
    cardapio: { fundo: "gradiente", ritmo: "calmo" },
    ordemFotos: [0, 1],
    preco: 999999,
    ano: 1900,
    km: 1,
    modelo: "Ferrari Falso",
  });

  console.log("ANTES — JSON malicioso devolvido pelo provedor falso:", jsonMalicioso);

  const provedor = new ProvedorFalso([jsonMalicioso]);
  const resultado = await escreverAnuncio(PEDIDO, provedor);

  console.log("DEPOIS — ResultadoEscritor.escolha:", JSON.stringify(resultado.escolha));

  assert.ok(!JSON.stringify(resultado.escolha).includes("999999"));
  assert.ok(!JSON.stringify(resultado.escolha).includes("Ferrari"));
  assert.equal(resultado.tentativasUsadas, 1);
});

test("esgota as 3 tentativas e lança ErroEscritorEsgotado explícito", async () => {
  const provedor = new ProvedorFalso(["isso não é json", '{"texto":{}}', "ainda inválido"]);

  await assert.rejects(
    () => escreverAnuncio(PEDIDO, provedor),
    (erro: unknown) => {
      assert.ok(erro instanceof ErroEscritorEsgotado);
      assert.equal(erro.tentativas.length, 3);
      return true;
    },
  );

  assert.equal(provedor.pedidos.length, 3, "deve ter chamado o provedor exatamente 3 vezes");
  // a segunda e a terceira tentativa devem reinjetar o erro da anterior
  assert.ok(provedor.pedidos[1]?.usuario.includes("A tentativa anterior falhou"));
  assert.ok(provedor.pedidos[2]?.usuario.includes("A tentativa anterior falhou"));
});

test("campo fora do cardápio na 1ª tentativa, sucede na 2ª (reinjeta erro)", async () => {
  const provedor = new ProvedorFalso([
    JSON.stringify({
      texto: { titulo: "a", corpo: "b" },
      cardapio: { fundo: "azul", ritmo: "calmo" },
      ordemFotos: [0],
    }),
    JSON.stringify({
      texto: { titulo: "a", corpo: "b" },
      cardapio: { fundo: "claro", ritmo: "calmo" },
      ordemFotos: [0],
    }),
  ]);

  const resultado = await escreverAnuncio(PEDIDO, provedor);
  assert.equal(resultado.tentativasUsadas, 2);
  assert.equal(resultado.escolha.cardapio.fundo, "claro");
  assert.ok(provedor.pedidos[1]?.usuario.includes('cardapio.fundo "azul" fora do cardápio'));
});

test("índice de foto inexistente é descartado e duplicata removida (fim a fim)", async () => {
  const provedor = new ProvedorFalso([
    JSON.stringify({
      texto: { titulo: "a", corpo: "b" },
      cardapio: { fundo: "escuro", ritmo: "rapido" },
      ordemFotos: [0, 99, 1, 1, 2],
    }),
  ]);

  const resultado = await escreverAnuncio(PEDIDO, provedor);
  assert.deepEqual(resultado.escolha.ordemFotos, [0, 1, 2]);
});

test("soma tokens de entrada e saída de todas as tentativas", async () => {
  const provedor = new ProvedorFalso([
    "inválido",
    JSON.stringify({
      texto: { titulo: "a", corpo: "b" },
      cardapio: { fundo: "claro", ritmo: "calmo" },
      ordemFotos: [0],
    }),
  ]);

  const resultado = await escreverAnuncio(PEDIDO, provedor);
  assert.equal(resultado.tokensEntrada, 20); // 10 por tentativa falsa, 2 tentativas
  assert.equal(resultado.tokensSaida, 20);
});
