import assert from "node:assert/strict";
import { test } from "node:test";
import { ErroEscritorEsgotado, escreverAnuncio } from "./escritor.js";
import { acharTiquesDeIA, lerOpcoesHumanizacao } from "./humanizacao.js";
import { montarSistemaLegendas, REGRAS_POR_REDE, validarLegendaRede } from "./redes.js";
import { montarPedidoSistema } from "./prompt.js";
import { ProvedorFalso } from "./testes/provedor-falso.js";
import type { PedidoEscritor } from "./tipos.js";
import { ErroValidacao, validarResposta } from "./validacao.js";

const PEDIDO: PedidoEscritor = {
  dados: { marca: "Chevrolet", modelo: "Astra", ano: 2010, km: 92991, preco: 41900, revenda: "Rota 66" },
  quantidadeFotos: 3,
  idioma: "pt-BR",
};
const resp = (titulo: string, corpo: string) =>
  JSON.stringify({ texto: { titulo, corpo }, cardapio: { fundo: "claro", ritmo: "calmo" }, ordemFotos: [0] });
const LIMPO = resp("Astra sedan, revisado", "Sedan com ar-condicionado e direção hidráulica. Venha tomar um café e ver o carro.");

test("'oportunidade única' é recusado e o escritor tenta de novo com o motivo", async () => {
  const p = new ProvedorFalso([resp("Astra", "Oportunidade única: carro revisado."), LIMPO]);
  const r = await escreverAnuncio(PEDIDO, p);
  assert.equal(r.tentativasUsadas, 2);
  const seguinte = p.pedidos[1]!.usuario;
  assert.ok(seguinte.includes("[como escrever]"));
  assert.ok(seguinte.includes("oportunidade unica"));
});

test("três exclamações são recusadas", () => {
  assert.throws(() => validarResposta(resp("Astra!", "Revisado! Pronto! Venha."), 3, "pt-BR"), ErroValidacao);
});

test("uma exclamação passa", () => {
  validarResposta(resp("Astra sedan", "Único dono e revisões na concessionária!"), 3, "pt-BR");
});

test("pergunta retórica de abertura é recusada (título e corpo)", () => {
  assert.throws(() => validarResposta(resp("Procurando um sedan?", "Astra 2010."), 3, "pt-BR"), /abre com pergunta/);
  assert.throws(() => validarResposta(resp("Astra 2010", "Quer um sedan? Este tem ar."), 3, "pt-BR"), /abre com pergunta/);
});

test("frase longa demais é recusada em qualquer idioma", () => {
  const longa = Array(35).fill("palavra").join(" ") + ".";
  assert.throws(() => validarResposta(resp("a", longa), 3, "ru"), /frase com 35 palavras/);
});

test("texto limpo passa de primeira", async () => {
  const p = new ProvedorFalso([LIMPO]);
  const r = await escreverAnuncio(PEDIDO, p);
  assert.equal(r.tentativasUsadas, 1);
});

test("esgotar as 3 tentativas lança o erro explícito, nunca texto padrão", async () => {
  const ruim = resp("Astra", "Imperdível! Não perca! Corra!");
  const p = new ProvedorFalso([ruim]);
  await assert.rejects(() => escreverAnuncio(PEDIDO, p), (e: unknown) => {
    assert.ok(e instanceof ErroEscritorEsgotado);
    assert.equal(e.tentativas.length, 3);
    return true;
  });
  assert.equal(p.pedidos.length, 3);
});

test("romeno e russo: sem lista de palavra, mas recusam exclamação demais", () => {
  const ro = resp("Dacia", "Ocazie unică, nu rata, vino acum.");
  const ru = resp("Лада", "Уникальная возможность, не упустите.");
  validarResposta(ro, 3, "ro");
  validarResposta(ru, 3, "ru-RU");
  assert.throws(() => validarResposta(resp("Dacia!", "Mașină bună! Vino!"), 3, "ro"), /exclamações/);
  assert.throws(() => validarResposta(resp("Лада!", "Хорошая машина! Приходите!"), 3, "ru"), /exclamações/);
});

test("inglês usa a lista do unslop", () => {
  assert.throws(() => validarResposta(resp("Astra", "A hidden gem, don't miss it."), 3, "en"), ErroValidacao);
});

test("ajuste desliga só a recusa", () => {
  const ruim = resp("Astra!", "Imperdível! Corra!");
  validarResposta(ruim, 3, "pt-BR", { recusarTiques: false });
  assert.deepEqual(lerOpcoesHumanizacao({ ESCRITOR_RECUSAR_TIQUES: "0" }), { recusarTiques: false });
  assert.deepEqual(lerOpcoesHumanizacao({}), { recusarTiques: true });
});

test("preço/ano/km/modelo continuam descartados com a humanização ligada", () => {
  const j = JSON.stringify({ ...JSON.parse(LIMPO), preco: 1, ano: 1900, modelo: "Falso" });
  const e = validarResposta(j, 3, "pt-BR");
  assert.deepEqual(Object.keys(e).sort(), ["cardapio", "ordemFotos", "texto"]);
});

test("regras entram no prompt do sistema", () => {
  assert.ok(montarPedidoSistema().includes("NÃO INVENTE"));
});

test("sem idioma conhecido, só regras sem idioma", () => {
  assert.deepEqual(acharTiquesDeIA("a", "Imperdível.", undefined), []);
});

// ---- regras por rede ----
const TAGS = ["#astra", "#sedan", "#carrousado"];

test("cada rede tem bloco próprio no prompt", () => {
  const s = montarSistemaLegendas();
  for (const r of ["Instagram", "TikTok", "Facebook"]) assert.ok(s.includes(r));
  assert.ok(montarSistemaLegendas(["tiktok"]).includes("TikTok"));
  assert.ok(!montarSistemaLegendas(["tiktok"]).includes("Facebook:"));
  assert.equal(Object.keys(REGRAS_POR_REDE).length, 3);
});

test("Instagram: gancho acima de 125 caracteres é recusado", () => {
  const longa = "Sedan " + "x".repeat(130) + ".";
  const m = validarLegendaRede("instagram", longa, TAGS, "pt-BR");
  assert.ok(m.some((x) => x.startsWith("[regra do Instagram Reels]")));
});

test("TikTok: mais de 2 frases e sem hashtag são recusados", () => {
  const m = validarLegendaRede("tiktok", "Um. Dois. Três.", [], "pt-BR");
  assert.equal(m.filter((x) => x.startsWith("[regra do TikTok]")).length, 2);
});

test("Facebook: uma frase só e hashtags demais são recusados", () => {
  const m = validarLegendaRede("facebook", "Astra.", ["#a", "#b", "#c"], "pt-BR");
  assert.equal(m.filter((x) => x.startsWith("[regra do Facebook]")).length, 2);
});

test("legenda que falha nas duas regras mostra as duas etiquetas", () => {
  const m = validarLegendaRede("tiktok", "Imperdível! Corra! Já!", ["#a"], "pt-BR");
  assert.ok(m.some((x) => x.startsWith("[regra do TikTok]")));
  assert.ok(m.some((x) => x.startsWith("[como escrever]")));
});

test("legenda boa passa nas duas", () => {
  assert.deepEqual(validarLegendaRede("tiktok", "Astra sedan com ar. Visita na Rota Sessenta e Seis.", TAGS, "pt-BR"), []);
});

test("ajuste desliga a humanização mas mantém a regra da rede", () => {
  const m = validarLegendaRede("tiktok", "Imperdível.", [], "pt-BR", { recusarTiques: false });
  assert.equal(m.length, 1);
  assert.ok(m[0]!.startsWith("[regra do TikTok]"));
});
