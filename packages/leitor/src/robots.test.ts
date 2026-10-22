import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarRobots, podeBuscar } from "./robots.js";

// Texto real do robots.txt de rota66bh.com.br (lido em 20/10/2026).
const ROBOTS_ROTA66 = `
User-agent: *
Allow: /

Disallow: /Home/OrdenarVeiculos
Disallow: /Home/ObterMarcasPorTipo
Disallow: /Upload/
Disallow: /Obrigado

Sitemap: https://rota66bh.com.br/sitemap.xml
`;

test("caminho permitido (catálogo liberado por Allow: /)", () => {
  const robots = interpretarRobots(ROBOTS_ROTA66);
  assert.equal(podeBuscar(robots, "/Veiculos"), true);
  assert.equal(
    podeBuscar(robots, "/Veiculo/2008-1.6-16v-flex-style-4p-automatico-2023/5487491/detalhes"),
    true,
  );
});

test("caminho proibido (Disallow mais específico vence)", () => {
  const robots = interpretarRobots(ROBOTS_ROTA66);
  assert.equal(podeBuscar(robots, "/Home/OrdenarVeiculos"), false);
  assert.equal(podeBuscar(robots, "/Upload/foto.jpg"), false);
  assert.equal(podeBuscar(robots, "/Obrigado"), false);
});

test("sem regra alguma: permite por padrão", () => {
  const robots = interpretarRobots("");
  assert.equal(podeBuscar(robots, "/qualquer-coisa"), true);
});

test("Allow mais específico vence sobre Disallow mais genérico", () => {
  const robots = interpretarRobots(`
User-agent: *
Disallow: /privado/
Allow: /privado/publico/
`);
  assert.equal(podeBuscar(robots, "/privado/segredo"), false);
  assert.equal(podeBuscar(robots, "/privado/publico/pagina"), true);
});
