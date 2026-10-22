// Testes que impedem a volta dos defeitos do video-21 (Astra, enérgico, cheia).
// Mesmo estilo dos outros: cálculo, sem renderizar. Os textos são os REAIS que o
// sistema já produziu (dados/gerador.db), não "lorem ipsum". As regras e o porquê
// de cada medida estão em PADRAO-VIDEO.md.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MODELOS_ESCOLHA, type DadosVeiculo } from "@gerador/core";
import {
  blocoTag,
  blocosAbertura,
  blocosFechamento,
  bordasForma,
  FOLGA_TEXTO,
  LARGURA_UTIL,
  MANCHETE_MAX_CARACTERES,
  MARGEM,
  MAX_LINHAS_CHAMADA,
  montarTags,
  opacidadeBloco,
  posicionar,
  presenca,
  tratarModelo,
  violacoesForma,
  type Bloco,
} from "./layout.js";
import { FPS } from "./Composicao.js";
import { FOLGA_FOTO, MODELOS, RESPIRO_BORDA, SAIDA_MIN_SEGUNDOS } from "./modelos.js";
import { ALTURA_QUADRO, CONFIG, enquadrar, VARIANTES, ZONA_CARRO } from "./variantes.js";

/** Sobra máxima (px) num dos lados de um bloco dentro da sua faixa. Ver PADRAO-VIDEO.md. */
const SOBRA_MAX_PE = 200;

// Textos reais do banco (os 10 produtos lidos) e os limites reais do escritor.
const MODELOS_REAIS = [
  ["CHEVROLET", "SPIN PREMIER 7L 1.8 8V ECONOFLEX 4P C/AR - AUTOMÁTICO"], // 53, o mais longo
  ["CHEVROLET", "ASTRA 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL"], // o do video-21
  ["CHEVROLET", "MERIVA 1.8 MPFI SS 8V FLEX 4P AUTOMATIZADO"],
  ["CHEVROLET", "VECTRA 2.0 MPFI ELEGANCE 8V FLEX 4P MANUAL"],
  ["CHEVROLET", "S10 2.8 16V TURBO DIESEL LS CD 4X4 MANUAL"],
  ["CHEVROLET", "TRACKER 1.2 TURBO FLEX PREMIER AUTOMÁTICO"],
  ["CITROEN", "C4 CACTUS 1.6 THP FLEX SHINE PACK EAT6"],
  ["CITROEN", "C3 1.0 FIREFLY FLEX FEEL MANUAL"],
  ["AIMA", "TIGER X6 SCOOTER ELÉTRICA"],
  ["CHEVROLET", "ONIX 1.0 FLEX LT MANUAL"],
] as const;
const TITULOS_REAIS = [
  "Chevrolet Astra Advantage 2010: potência e estilo no seu dia a dia", // 66, escrito pelo Claude
  "Scooter elétrica AIMA Tiger X6: mobilidade prática e moderna",
  // 80 caracteres = LIMITE_TITULO do escritor (o pior que pode chegar)
  "Chevrolet Spin Premier 2023: sete lugares, câmbio automático e revisão em dia ok",
];
const REVENDAS = [undefined, "Rota 66 BH", "Rota 66 Veículos"]; // revenda do testar.ts e a da placa das fotos

function dadosDe(marca: string, modelo: string, revenda?: string): DadosVeiculo {
  // km e preço mais largos do banco: 321.594 km (Meriva) e R$ 145.900 (S10)
  return { marca, modelo, ano: 2010, km: 321594, preco: 145900, ...(revenda ? { revenda } : {}) } as DadosVeiculo;
}

function todosOsBlocos(modelo: (typeof MODELOS_ESCOLHA)[number]) {
  const blocos: { rotulo: string; bloco: Bloco }[] = [];
  for (const [marca, nome] of MODELOS_REAIS)
    for (const revenda of REVENDAS)
      for (const titulo of [undefined, ...TITULOS_REAIS]) {
        const dados = dadosDe(marca, nome, revenda);
        const rotulo = `${modelo} ${nome} rev=${revenda ?? "-"} tit=${titulo?.length ?? "-"}`;
        for (const t of montarTags(dados)) blocos.push({ rotulo: `${rotulo} tag ${t.chave}`, bloco: blocoTag(modelo, t) });
        for (const b of blocosAbertura(modelo, dados)) blocos.push({ rotulo: `${rotulo} abertura ${b.chave}`, bloco: b });
        for (const b of blocosFechamento(modelo, { dados, titulo })) blocos.push({ rotulo: `${rotulo} fechamento ${b.chave}`, bloco: b });
      }
  return blocos;
}

// ---------- 1. texto dentro da forma, com a inclinação ----------

test("nenhum texto passa da borda da forma que o contém, linha a linha, em nenhum modelo", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const { rotulo, bloco } of todosOsBlocos(modelo)) {
      assert.deepEqual(violacoesForma(bloco), [], rotulo);
      const left = bloco.largura === 1080 ? 0 : MARGEM;
      assert.ok(bloco.largura <= (bloco.largura === 1080 ? 1080 : LARGURA_UTIL) && left >= 0, `${rotulo} largura ${bloco.largura}`);
    }
});

test("o verificador pega o defeito original: texto posicionado como se a forma fosse retângulo", () => {
  // Reprodução do video-21: paralelogramo de 968 px, texto com recuo fixo de 52 px, 1ª linha de 954 px.
  const ruim: Bloco = {
    chave: "x", tipo: "abertura", faixa: "base", lado: "dir", largura: 968, altura: 186, alinha: "esq", inclinacao: 48,
    itens: [
      { tipo: "texto", texto: "ASTRA 2.0 MPFI ADVANTAGE", fonte: 54, espaco: 0, entrelinha: 1.08, peso: 700, cor: "principal", opacidade: 1, x: 52, y: 60, w: 880, h: 58 },
    ],
  };
  assert.ok(violacoesForma(ruim).length > 0);
  // E a borda recua de fato com a altura: embaixo a direita é S px menor que em cima.
  const e = bordasForma(ruim, 0), f = bordasForma(ruim, 186);
  assert.equal(e.direita - f.direita, 48);
  assert.equal(e.esquerda - f.esquerda, 48);
});

test("a forma inclinada recua a borda: a linha de baixo recebe menos largura que a de cima", () => {
  const dados = dadosDe("CHEVROLET", "ASTRA 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL", "Rota 66 BH");
  const [, modelo] = blocosAbertura("energico", dados);
  assert.ok(modelo && modelo.inclinacao > 0);
  const textos = modelo.itens.filter((i) => i.tipo === "texto");
  const folgas = textos.map((i) => bordasForma(modelo, i.y + i.h).direita - (i.x + i.w));
  assert.ok(folgas.every((x) => x >= FOLGA_TEXTO));
  // o painel é tão largo quanto a linha mais exigente exige: a folga mínima é justa, não sobra um vazio azul
  assert.ok(Math.min(...folgas) < 30, `folga mínima ${Math.min(...folgas)}`);
});

// ---------- 2. sobra no pé do quadro ----------

test(`bloco centrado na faixa: sobra igual dos dois lados e no máximo ${SOBRA_MAX_PE}px no pé, nunca menos que o respiro`, () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const v of VARIANTES)
      for (const { rotulo, bloco } of todosOsBlocos(modelo)) {
        const p = posicionar(bloco, v);
        const j = (ALTURA_QUADRO - CONFIG[v].alturaJanela) / 2;
        const acima = bloco.faixa === "topo" ? p.top : p.top - (j + CONFIG[v].alturaJanela);
        const abaixo = bloco.faixa === "topo" ? j - p.bottom : ALTURA_QUADRO - p.bottom;
        assert.ok(Math.abs(acima - abaixo) < 1e-6, `${rotulo} ${v}: ${acima} x ${abaixo}`);
        assert.ok(acima >= Math.max(FOLGA_FOTO, RESPIRO_BORDA), `${rotulo} ${v}: encosta (${acima})`);
        if (bloco.faixa === "base") assert.ok(abaixo <= SOBRA_MAX_PE, `${rotulo} ${v}: sobra morta no pé ${abaixo}px`);
      }
});

test("a altura real de todo bloco cabe no teto de altura do modelo (alturaMax)", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const { rotulo, bloco } of todosOsBlocos(modelo)) {
      const teto = MODELOS[modelo].alturaMax[bloco.tipo === "tag" ? "tag" : bloco.tipo === "abertura" ? "abertura" : "fechamento"];
      assert.ok(bloco.altura <= teto, `${rotulo}: ${bloco.altura} > ${teto}`);
    }
});

// ---------- 3. o carro cabe em todo o percurso ----------

test("o carro cabe na janela em todo enquadramento, em todo o zoom e em todo o pan", () => {
  const fotos = [[1024, 768], [640, 480], [2000, 1500], [1024, 1024], [1600, 900], [800, 800]] as const;
  for (const v of VARIANTES)
    for (const [l, a] of fotos)
      for (let i = 0; i <= 50; i++)
        for (const zoomIn of [true, false])
          for (const panAvanca of [true, false]) {
            const q = enquadrar(l, a, v, i / 50, zoomIn, panAvanca);
            const larguraAmp = l * q.escala;
            const esquerda = -q.x / larguraAmp;
            const direita = esquerda + q.larguraJanela / larguraAmp;
            const topo = -q.y / (a * q.escala);
            const base = topo + q.alturaJanela / (a * q.escala);
            const id = `${v} ${l}x${a} p=${i / 50} zoomIn=${zoomIn} pan=${panAvanca}`;
            assert.ok(esquerda <= ZONA_CARRO.x0 + 1e-9, `${id}: corta a frente (${esquerda.toFixed(3)})`);
            assert.ok(direita >= ZONA_CARRO.x1 - 1e-9, `${id}: corta a traseira (${direita.toFixed(3)})`);
            assert.ok(topo <= ZONA_CARRO.y0 + 1e-9 && base >= ZONA_CARRO.y1 - 1e-9, `${id}: corta em altura`);
            assert.ok(q.escala <= CONFIG[v].teto + 1e-9);
          }
});

// ---------- 4. saída nunca é corte seco ----------

test(`saída de tag dura no mínimo ${SAIDA_MIN_SEGUNDOS}s e é gradual, quadro a quadro, em todo modelo`, () => {
  for (const modelo of MODELOS_ESCOLHA) {
    const m = MODELOS[modelo].tag;
    assert.ok(m.saida >= SAIDA_MIN_SEGUNDOS, `${modelo}: saída ${m.saida}s`);
    const sai = 5;
    let anterior = 1;
    let quadrosIntermediarios = 0;
    for (let f = Math.round(sai * FPS); f <= Math.round((sai + m.saida) * FPS) + 1; f++) {
      const { ent, sa } = presenca(f / FPS, 1, sai, m.entrada, m.saida);
      const o = opacidadeBloco(ent, sa);
      assert.ok(anterior - o <= 0.5 + 1e-9, `${modelo}: opacidade cai ${anterior - o} num quadro só`);
      assert.ok(o <= anterior + 1e-9, `${modelo}: opacidade sobe durante a saída`);
      if (o > 0.02 && o < 0.98) quadrosIntermediarios++;
      anterior = o;
    }
    assert.ok(anterior < 1e-9, `${modelo}: não termina invisível`);
    assert.ok(quadrosIntermediarios >= 5, `${modelo}: só ${quadrosIntermediarios} quadros de transição`);
  }
});

test("o enérgico continua mais rápido que os outros (a diferença de ritmo entre os modelos fica)", () => {
  const e = MODELOS.energico.tag;
  for (const outro of ["institucional", "numeros", "editorial"] as const) {
    assert.ok(e.entrada < MODELOS[outro].tag.entrada);
    assert.ok(e.saida <= MODELOS[outro].tag.saida);
  }
});

// ---------- 5. nome de modelo longo ----------

test("nome de modelo com 45 caracteres ou mais não estoura o bloco, em nenhum modelo", () => {
  const longos = MODELOS_REAIS.filter(([, n]) => n.length >= 45);
  assert.ok(longos.length >= 1, "precisa existir ao menos um modelo real >= 45");
  // 45 exatos: o mais longo real, cortado em palavra inteira, mais o tamanho do Astra
  const de45 = "CHEVROLET SPIN PREMIER 7L 1.8 8V ECONOFLEX 4P".slice(0, 45);
  assert.equal(de45.length, 45);
  for (const modelo of MODELOS_ESCOLHA)
    for (const nome of [...longos.map(([, n]) => n), de45.replace("CHEVROLET ", "") + " TURBO PLUS AUT", de45]) {
      for (const b of blocosAbertura(modelo, dadosDe("CHEVROLET", nome))) {
        assert.deepEqual(violacoesForma(b), [], `${modelo} ${nome}`);
        assert.ok(b.itens.filter((i) => i.tipo === "texto").length <= 3, "abertura: no máximo marca + manchete + versão");
      }
      for (const b of blocosFechamento(modelo, { dados: dadosDe("CHEVROLET", nome) }))
        assert.deepEqual(violacoesForma(b), [], `${modelo} ${nome}`);
    }
});

test("tratarModelo: só corta, nunca acrescenta; manchete curta; versão é o resto", () => {
  for (const [, nome] of MODELOS_REAIS) {
    const { manchete, versao } = tratarModelo(nome);
    assert.equal([manchete, versao].filter(Boolean).join(" "), nome, "manchete + versão tem de recompor o dado");
    assert.ok(manchete.length > 0 && manchete.length <= MANCHETE_MAX_CARACTERES, nome);
    assert.ok(!/^\d/.test(manchete.split(" ").at(-1)!) || manchete.split(" ").length === 1, nome);
  }
  assert.deepEqual(tratarModelo("ASTRA 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL"), { manchete: "ASTRA", versao: "2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL" });
  assert.deepEqual(tratarModelo("C4 CACTUS 1.6 THP FLEX SHINE PACK EAT6"), { manchete: "C4 CACTUS", versao: "1.6 THP FLEX SHINE PACK EAT6" });
  assert.deepEqual(tratarModelo("C3 1.0 FIREFLY FLEX FEEL MANUAL"), { manchete: "C3", versao: "1.0 FIREFLY FLEX FEEL MANUAL" });
  assert.deepEqual(tratarModelo(undefined), { manchete: "", versao: "" });
  assert.deepEqual(tratarModelo("  GOL  "), { manchete: "GOL", versao: "" });
});

test(`a chamada do fechamento tem no máximo ${MAX_LINHAS_CHAMADA} linhas, mesmo com título de 80 caracteres e revenda`, () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const titulo of TITULOS_REAIS) {
      assert.ok(titulo.length <= 80);
      for (const revenda of REVENDAS) {
        const [, base] = blocosFechamento(modelo, { dados: dadosDe("CHEVROLET", "ASTRA 2.0", revenda), titulo });
        const chamada = base!.itens.filter((i) => i.tipo === "texto" && i.texto !== "VALOR" && !i.texto.startsWith("R$"));
        assert.ok(chamada.length >= 1 && chamada.length <= MAX_LINHAS_CHAMADA, `${modelo} ${titulo.length}: ${chamada.length} linhas`);
      }
    }
});
