import assert from "node:assert/strict";
import { test } from "node:test";
import { montarCronograma } from "./cronograma.js";
import { calcularDuracaoFrames } from "./Composicao.js";
import { CONFIG, enquadrar, VARIANTES } from "./variantes.js";

test("escala nunca passa do teto da variante, em nenhum progresso", () => {
  for (const v of VARIANTES) {
    for (const [l, a] of [[1024, 768], [640, 480], [2000, 1500], [1024, 1024]] as const) {
      for (let i = 0; i <= 100; i++) {
        for (const zoomIn of [true, false]) {
          const q = enquadrar(l, a, v, i / 100, zoomIn, true);
          assert.ok(q.escala <= CONFIG[v].teto + 1e-9, `${v} ${l}x${a} escala ${q.escala}`);
        }
      }
    }
  }
});

test("cheia: 1024x768 vai de 1,094x a 1,146x (o carro inteiro manda; o teto 1,45x segue valendo); nitida de 1,055x a 1,08x", () => {
  const c0 = enquadrar(1024, 768, "cheia", 0, true, true);
  const c1 = enquadrar(1024, 768, "cheia", 1, true, true);
  assert.ok(Math.abs(c0.escala - 840 / 768) < 1e-9);
  assert.ok(Math.abs(c1.escala - 1080 / (1024 * 0.92)) < 1e-9);
  assert.ok(c1.escala <= 1.45);
  const n0 = enquadrar(1024, 768, "nitida", 0, true, true);
  const n1 = enquadrar(1024, 768, "nitida", 1, true, true);
  assert.ok(Math.abs(n0.escala - 1080 / 1024) < 1e-9);
  assert.ok(Math.abs(n1.escala - 1.08) < 1e-9);
});

test("a foto sempre cobre a janela (sem borda vazia)", () => {
  for (const v of VARIANTES) {
    for (let i = 0; i <= 20; i++) {
      const q = enquadrar(1024, 768, v, i / 20, i % 2 === 0, i % 3 === 0);
      assert.ok(1024 * q.escala + q.x >= q.larguraJanela - 1e-6);
      assert.ok(768 * q.escala + q.y >= q.alturaJanela - 1e-6);
      assert.ok(q.x <= 0 && q.y <= 0);
    }
  }
});

test("foto pequena nao e ampliada alem do teto: a janela encolhe", () => {
  const q = enquadrar(500, 375, "cheia", 1, true, true);
  assert.ok(q.escala <= 1.45 + 1e-9);
  assert.ok(q.larguraJanela <= 500 * 1.45 + 1e-9);
});

test("cronograma: tags em ordem, sem sobrepor, dentro do video, e duracao 28-32s", () => {
  for (const ritmo of ["rapido", "calmo"] as const) {
    for (const n of [1, 3, 8]) {
      const seg = calcularDuracaoFrames(n, ritmo) / 30;
      assert.ok(seg >= 28 && seg <= 32, `${ritmo} ${n} fotos: ${seg}s`);
      for (const corpo of [true, false]) {
        const c = montarCronograma(seg, 3, corpo, ritmo);
        c.tags.forEach((t, i) => {
          assert.ok(t.entra >= c.aberturaFim);
          assert.ok(t.sai + 0.45 <= c.fechamentoInicio + 1e-9);
          assert.ok(t.sai - t.entra <= 3.4 + 1e-9);
          const prox = c.tags[i + 1];
          if (prox) assert.ok(t.sai + 0.45 <= prox.entra + 1e-9);
        });
      }
    }
  }
});
