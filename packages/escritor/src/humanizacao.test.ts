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
  assert.deepEqual(lerOpcoesHumanizacao({ ESCRITOR_RECUSAR_TIQUES: "0" }), { recusarTiques: false, recusarNumeros: true });
  assert.deepEqual(lerOpcoesHumanizacao({}), { recusarTiques: true, recusarNumeros: true });
  assert.equal(lerOpcoesHumanizacao({ ESCRITOR_RECUSAR_NUMEROS: "0" }).recusarNumeros, false);
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

// ---- número no texto do vídeo ----
const CTX = PEDIDO.dados;
const num = (t: string, c: string, d = CTX) => validarResposta(resp(t, c), 3, "pt-BR", {}, d);

test("corpo com preço escrito é recusado", () => {
  assert.throws(() => num("Astra sedan", "Disponível na Rota 66 por R$ 41.900."), /\[números\].*41\.900/);
  assert.throws(() => num("Astra sedan", "Disponível por R$41.900."), /41\.900/);
});

test("corpo com km escrito é recusado", () => {
  assert.throws(() => num("Astra sedan", "Sedan com 92.991 km rodados."), /92\.991/);
});

test("ano verdadeiro em prosa também é recusado (o sistema já mostra)", () => {
  assert.throws(() => num("Astra 2010", "Sedan com ar-condicionado."), /2010/);
});

test("número do nome do modelo passa: Astra 2.0 e Compass 2.0 16V Flex", () => {
  num("Astra 2.0 sedan", "Sedan com ar-condicionado.", { ...CTX, modelo: "Astra 2.0" });
  num("Compass 2.0 16V Flex", "SUV com câmera de ré.", { marca: "Jeep", modelo: "Compass 2.0 16V" });
  num("C4 Cactus e 208", "Hatch compacto.", { marca: "Citroën", modelo: "C4 Cactus 208" });
});

test("corpo que inventa km diferente da ficha é recusado, mesmo com modelo numerado", () => {
  assert.throws(
    () => num("Astra 2.0", "Sedan com 50.000 km.", { ...CTX, modelo: "Astra 2.0" }),
    /50\.000/,
  );
});

test("modelo sem número: '2.0' escrito pelo modelo de linguagem é recusado", () => {
  assert.throws(() => num("Astra 2.0", "Sedan."), /2\.0/);
});

test("'venha ver de perto' e variações com 'ver' são recusados", () => {
  for (const c of ["Venha ver de perto.", "Vale ver de perto este sedan.", "Venha ver o carro de perto."]) {
    assert.throws(() => num("Astra sedan", c), /expressão de anúncio genérico/, c);
  }
});

test("ajuste libera número no texto", () => {
  validarResposta(resp("Astra", "Por R$ 41.900."), 3, "pt-BR", { recusarNumeros: false }, CTX);
});

test("número recusado dispara nova tentativa com o motivo no pedido", async () => {
  const p = new ProvedorFalso([resp("Astra", "Sedan com 92.991 km."), LIMPO]);
  const r = await escreverAnuncio(PEDIDO, p);
  assert.equal(r.tentativasUsadas, 2);
  assert.ok(p.pedidos[1]!.usuario.includes("escreva sem citar número"));
});

test("prompt manda não repetir preço, ano e km", () => {
  assert.ok(montarPedidoSistema().includes("NÃO escreva número nenhum"));
});

// ---- ficha rica: opcionais e texto da loja ----
import { montarPedidoUsuario } from "./prompt.js";

const LOJA = "Laudo cautelar e garantia de procedência. Aceitamos entrada no cartão de crédito. Av. Brasil 100, Centro.";
const RICA: PedidoEscritor = {
  dados: {
    marca: "Peugeot", modelo: "208 1.6 Griffe", ano: 2016, km: 66157, preco: 59900, revenda: "Rota 66",
    cor: "Prata", opcionais: ["Teto panorâmico", "Câmera 360", "Bancos de Couro"], descricaoRevenda: LOJA,
  },
  quantidadeFotos: 3,
  idioma: "pt-BR",
};

test("ficha com opcionais: o prompt os inclui e manda escolher, sem listar todos", () => {
  const u = montarPedidoUsuario(RICA, []);
  assert.ok(u.includes("- Câmera 360") && u.includes("- Teto panorâmico") && u.includes("Cor: Prata"));
  assert.ok(montarPedidoSistema().includes("NÃO liste todos"));
});

test("ficha sem opcionais nem cor: prompt diz que não existem e nada quebra", () => {
  const u = montarPedidoUsuario(PEDIDO, []);
  assert.ok(!u.includes("Opcionais ("));
  assert.match(u, /NÃO informado na ficha[^\n]*cor[^\n]*opcionais/);
  assert.ok(!u.includes("Texto livre da loja"));
});

test("texto da loja entra marcado como FONTE, nunca fato", () => {
  assert.match(montarPedidoUsuario(RICA, []), /FONTE, NUNCA FATO/);
});

test("anúncio que copia frase do texto padrão da loja é recusado", () => {
  const copia = resp("Peugeot 208", "Prata, com teto panorâmico. Laudo cautelar e garantia de procedência.");
  assert.throws(() => validarResposta(copia, 3, "pt-BR", {}, RICA.dados), /\[texto da loja\]/);
});

test("promessa da loja parafraseada (garantia) é recusada", () => {
  const r = resp("Peugeot 208", "Prata, teto panorâmico e câmera 360. Vem com garantia da casa.");
  assert.throws(() => validarResposta(r, 3, "pt-BR", {}, RICA.dados), /promessa da loja/);
});

test("fato da ficha que a loja também citou não é recusado (opcional)", () => {
  const dados = { ...RICA.dados, descricaoRevenda: "Carro completo com bancos de couro, câmera 360 e teto panorâmico, muito conservado." };
  const ok = resp("Peugeot 208 Griffe", "Prata, com bancos de Couro, Câmera 360 e Teto panorâmico.");
  validarResposta(ok, 3, "pt-BR", {}, dados);
});

test("sem texto da loja, nada é recusado por esse motivo", () => {
  validarResposta(resp("Peugeot 208", "Prata, com garantia de fábrica e teto panorâmico."), 3, "pt-BR", {}, { ...RICA.dados, descricaoRevenda: "" });
});

test("superlativo de estado continua recusado, mesmo com opcional real na frase", () => {
  const r = resp("Peugeot 208", "Em excelente estado, com teto panorâmico e câmera 360.");
  assert.throws(() => validarResposta(r, 3, "pt-BR", {}, RICA.dados), /\[como escrever\]/);
});

test("'completo' ancorado em opcionais reais da lista passa", () => {
  validarResposta(resp("Peugeot 208 Griffe", "Completo: teto panorâmico, câmera 360 e bancos de couro."), 3, "pt-BR", {}, RICA.dados);
});

test("número no nome da revenda ('Rota 66') e no opcional ('Câmera 360') passa; outro número não", () => {
  validarResposta(resp("Peugeot 208", "Na Rota 66, Prata com Câmera 360."), 3, "pt-BR", {}, RICA.dados);
  assert.throws(() => validarResposta(resp("Peugeot 208", "Na Rota 66, Prata com 70 mil rodados."), 3, "pt-BR", {}, RICA.dados), /\[números\]/);
});

test("imperativo com 'veja' e formas vizinhas são recusados", () => {
  for (const c of ["Veja o carro de perto.", "Veja de perto.", "Confira de perto.", "Vem conferir.", "Veja pessoalmente.", "Venha conhecer.", "Agende uma visita.", "Para ver ao vivo."]) {
    assert.ok(acharTiquesDeIA("Astra", c, "pt-BR").length > 0, c);
  }
});

test("'venha ver' sozinho continua passando", () => {
  assert.deepEqual(acharTiquesDeIA("Astra", "Pronto pra rodar, venha ver.", "pt-BR"), []);
});

test("índice do pacote exporta formatarFicha e acharAfirmacoesDaLoja", async () => {
  const indice = await import("./index.js");
  assert.equal(typeof indice.formatarFicha, "function");
  assert.equal(typeof indice.acharAfirmacoesDaLoja, "function");
});
