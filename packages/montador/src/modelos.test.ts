import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CORES_DESTAQUE,
  CORES_ESCOLHA,
  ENQUADRAMENTOS_ESCOLHA,
  FUNDOS_ESCOLHA,
  MODELOS_ESCOLHA,
  RITMOS_ESCOLHA,
  type CardapioCompleto,
} from "@gerador/core";
import {
  ajustarParaFundo,
  CONTRASTE_MIN_DESTAQUE,
  CONTRASTE_MIN_TEXTO,
  contraste,
  corDominante,
  hexParaRgb,
  resolverDestaque,
  SUPERFICIES,
  textoSobre,
} from "./cor.js";
import { calcularDuracaoFrames, FPS } from "./Composicao.js";
import { montarCronograma } from "./cronograma.js";
import { espacoLivre, MODELOS, retanguloBloco, RESPIRO_BORDA } from "./modelos.js";
import { sugerirVariacoes } from "./variacoes.js";
import { CONFIG, enquadrar, VARIANTES } from "./variantes.js";
import { ALTURA_QUADRO } from "./variantes.js";

// ---------- contraste ----------

test("contraste: valores conhecidos da WCAG", () => {
  assert.ok(Math.abs(contraste("#000000", "#ffffff") - 21) < 1e-9);
  assert.ok(Math.abs(contraste("#ffffff", "#ffffff") - 1) < 1e-9);
  assert.ok(Math.abs(contraste("#777777", "#ffffff") - 4.48) < 0.01);
  assert.equal(contraste("#123456", "#fedcba"), contraste("#fedcba", "#123456"));
});

test("toda cor da paleta, em todo fundo: destaque >= 3:1 em todas as superficies e texto sobre ela >= 4,5:1", () => {
  for (const cor of CORES_ESCOLHA) {
    for (const fundo of FUNDOS_ESCOLHA) {
      const d = resolverDestaque(cor, fundo, cor === "automatica" ? [200, 30, 40] : null);
      for (const s of SUPERFICIES[fundo]) {
        assert.ok(contraste(d.hex, s) >= CONTRASTE_MIN_DESTAQUE, `${cor}/${fundo}: ${d.hex} sobre ${s}`);
      }
      assert.ok(contraste(d.hex, d.texto) >= CONTRASTE_MIN_TEXTO, `${cor}/${fundo}: texto ${d.texto} sobre ${d.hex}`);
    }
  }
});

test("textoSobre escolhe o de maior contraste (nao garante 4,5 para qualquer cor; por isso o destaque so e aceito se passar)", () => {
  for (const hex of ["#ffb545", "#3d8bff", "#6666ff", "#000000", "#ffffff"]) {
    const t = textoSobre(hex);
    const outro = t === "#ffffff" ? "#111114" : "#ffffff";
    assert.ok(contraste(hex, t) >= contraste(hex, outro), hex);
  }
});

test("cor automatica: extracao falhou (null) cai no ambar padrao", () => {
  const d = resolverDestaque("automatica", "escuro", null);
  assert.equal(d.origem, "padrao");
  assert.equal(d.hex, resolverDestaque("ambar", "escuro", null).hex);
});

test("cor automatica: carro vermelho vira destaque vermelho legivel, vindo da foto", () => {
  for (const fundo of FUNDOS_ESCOLHA) {
    const d = resolverDestaque("automatica", fundo, [190, 30, 35]);
    assert.equal(d.origem, "foto");
    assert.ok(contraste(d.hex, SUPERFICIES[fundo][0]!) >= CONTRASTE_MIN_DESTAQUE);
  }
});

test("ajustarParaFundo devolve null quando nao ha como passar no contraste dentro do limite", () => {
  // cinza medio num fundo escuro com limite 0 (nao pode mexer): reprova
  assert.equal(ajustarParaFundo("#303030", "escuro", CONTRASTE_MIN_DESTAQUE, 0), null);
});

test("corDominante: pixels vermelhos -> vermelho; cinza/preto/branco -> null", () => {
  const vermelho = new Uint8Array(3 * 100);
  for (let i = 0; i < 100; i++) vermelho.set([200, 30, 30], i * 3);
  const c = corDominante(vermelho)!;
  assert.ok(c[0] > 150 && c[1] < 80 && c[2] < 80);
  const cinza = new Uint8Array(3 * 100).fill(128);
  assert.equal(corDominante(cinza), null);
  assert.equal(corDominante(new Uint8Array(0)), null);
  void hexParaRgb;
});

// ---------- modelos ----------

test("cada modelo, cada ritmo, 1 a 12 fotos: duracao entre 28 e 32 s", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const ritmo of RITMOS_ESCOLHA)
      for (let n = 0; n <= 12; n++) {
        const s = calcularDuracaoFrames(n, ritmo, modelo) / FPS;
        assert.ok(s >= 28 && s <= 32, `${modelo} ${ritmo} ${n} fotos: ${s}s`);
      }
});

test("os quatro modelos sao diferentes entre si (transicao, entrada ou eixo)", () => {
  const assinaturas = MODELOS_ESCOLHA.map((m) => {
    const c = MODELOS[m];
    return [c.transicaoSegundos, c.tag.entrada, c.tag.saida, c.tag.eixo, c.tag.deslocamento].join("|");
  });
  assert.equal(new Set(assinaturas).size, MODELOS_ESCOLHA.length);
  assert.equal(MODELOS_ESCOLHA.length, 4);
});

test("escala: nenhum modelo/enquadramento passa do teto (cheia 1,45x; nitida 1,08x)", () => {
  assert.equal(CONFIG.cheia.teto, 1.45);
  assert.ok(CONFIG.nitida.teto <= 1.08);
  for (const modelo of MODELOS_ESCOLHA) {
    const [x1, y1, x2, y2] = MODELOS[modelo].curvaCena;
    // a curva so serve para dar progresso; enquadrar() trava em [0,1]
    for (let i = 0; i <= 50; i++) {
      for (const v of VARIANTES) {
        const q = enquadrar(1024, 768, v, (i / 50) * 1.2 - 0.1, i % 2 === 0, true);
        assert.ok(q.escala <= CONFIG[v].teto + 1e-9, `${modelo} ${v}`);
      }
    }
    assert.ok(x1 >= 0 && x2 <= 1 && y1 >= 0 && y2 <= 1);
  }
});

test("tag nunca cobre o carro: todo bloco de texto fica fora da janela da foto, dentro do quadro", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const v of VARIANTES)
      for (const [l, a] of [[1024, 768], [500, 375], [2000, 1500]] as const) {
        const q = enquadrar(l, a, v, 0.5, true, true);
        const janela = { top: q.topoJanela, bottom: q.topoJanela + q.alturaJanela };
        for (const tipo of ["tag", "abertura", "fechamento"] as const)
          for (const faixa of ["topo", "base"] as const) {
            const r = retanguloBloco(modelo, v, faixa, tipo);
            const sobrepoe = r.top < janela.bottom && r.bottom > janela.top;
            assert.ok(!sobrepoe, `${modelo} ${v} ${l}x${a} ${tipo}/${faixa} [${r.top},${r.bottom}] x janela [${janela.top},${janela.bottom}]`);
            assert.ok(r.top >= 0 && r.bottom <= ALTURA_QUADRO, `${modelo} ${v} ${tipo}/${faixa} sai do quadro`);
          }
      }
});

test("o bloco mais alto de cada modelo cabe no espaco livre com respiro", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const v of VARIANTES) {
      const livre = espacoLivre(v);
      for (const h of Object.values(MODELOS[modelo].alturaMax)) {
        assert.ok(h <= Math.min(livre.acima, livre.abaixo) - RESPIRO_BORDA, `${modelo} ${v} altura ${h}`);
      }
    }
});

test("cronograma por modelo: uma tag por vez, em ordem, dentro do video", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const ritmo of RITMOS_ESCOLHA)
      for (const n of [1, 3, 8])
        for (const corpo of [true, false]) {
          const seg = calcularDuracaoFrames(n, ritmo, modelo) / FPS;
          const c = montarCronograma(seg, 3, corpo, ritmo, modelo);
          const m = MODELOS[modelo].tag;
          c.tags.forEach((t, i) => {
            assert.ok(t.entra >= c.aberturaFim, `${modelo}`);
            assert.ok(t.sai + m.saida <= c.fechamentoInicio + 1e-9, `${modelo} sai tarde`);
            assert.ok(t.sai - t.entra <= Math.max(m.maxSegundos, m.entrada) + 1e-9);
            const prox = c.tags[i + 1];
            if (prox) assert.ok(t.sai + m.saida <= prox.entra + 1e-9, `${modelo} tags sobrepostas`);
          });
        }
});

// ---------- regenerar com variacao ----------

function atual(over: Partial<CardapioCompleto> = {}): CardapioCompleto {
  return {
    fundo: "escuro",
    ritmo: "calmo",
    enquadramento: "nitida",
    modelo: "institucional",
    cor: "ambar",
    ordemFotos: [0, 1, 2],
    ...over,
  };
}
const chave = (c: CardapioCompleto) => `${c.modelo}|${c.cor}|${c.enquadramento}`;

test("variacoes: nunca repete a atual nem devolve duas iguais, para varias entradas e sementes", () => {
  for (const modelo of MODELOS_ESCOLHA)
    for (const cor of CORES_ESCOLHA)
      for (const enquadramento of ENQUADRAMENTOS_ESCOLHA)
        for (const fundo of FUNDOS_ESCOLHA)
          for (const semente of [1, 2, 99]) {
            const a = atual({ modelo, cor, enquadramento, fundo });
            for (const n of [1, 3, 6]) {
              const v = sugerirVariacoes(a, n, semente);
              assert.equal(v.length, n);
              const chaves = v.map(chave);
              assert.equal(new Set(chaves).size, v.length, "duplicadas");
              assert.ok(!chaves.includes(chave(a)), "devolveu a atual");
              for (const x of v) {
                assert.equal(x.fundo, a.fundo);
                assert.equal(x.ritmo, a.ritmo);
                assert.deepEqual(x.ordemFotos, a.ordemFotos);
                assert.ok(MODELOS_ESCOLHA.includes(x.modelo) && CORES_ESCOLHA.includes(x.cor));
              }
            }
          }
});

test("variacoes: primeiras sugestoes mudam uma coisa so; semente diferente da lista diferente; mesma semente repete", () => {
  const a = atual();
  const v = sugerirVariacoes(a, 3, 5);
  for (const x of v) {
    const mudou = [x.modelo !== a.modelo, x.cor !== a.cor, x.enquadramento !== a.enquadramento].filter(Boolean).length;
    assert.equal(mudou, 1);
  }
  assert.deepEqual(sugerirVariacoes(a, 3, 5), v);
  assert.notDeepEqual(sugerirVariacoes(a, 3, 6).map(chave), v.map(chave));
});

test("variacoes: pedir mais do que existe devolve todas as possiveis, sem repetir; n=0 devolve vazio", () => {
  const a = atual({ fundo: "claro" });
  const total = MODELOS_ESCOLHA.length * CORES_ESCOLHA.length * ENQUADRAMENTOS_ESCOLHA.length - 1;
  const v = sugerirVariacoes(a, 1000, 3);
  assert.equal(v.length, total);
  assert.equal(new Set(v.map(chave)).size, total);
  assert.equal(sugerirVariacoes(a, 0).length, 0);
});

test("variacoes: grafite nao e sugerido sobre fundo escuro (viraria cinza branco)", () => {
  const v = sugerirVariacoes(atual({ fundo: "escuro" }), 1000, 1);
  assert.ok(v.every((x) => x.cor !== "grafite"));
  void CORES_DESTAQUE;
});
