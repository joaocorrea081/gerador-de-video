#!/usr/bin/env -S node
// Teste de conexão de um site pela linha de comando (o mesmo que o botão
// "Testar site" do painel chama). Uso: pnpm --filter @gerador/leitor testar-site <endereço> [playwright|navegador-da-pessoa|automatico]
import { testarSite } from "./descoberta.js";
import { ehModoNavegacao } from "./navegador-modos.js";

const endereco = process.argv[2];
if (!endereco) {
  console.error("Uso: testar-site <endereço>");
  process.exit(1);
}
const modo = process.argv[3] ?? "playwright";
if (!ehModoNavegacao(modo)) {
  console.error(`Modo desconhecido: ${modo}`);
  process.exit(1);
}
const r = await testarSite(endereco, { modo });
console.log(JSON.stringify(r, null, 2));
process.exit(r.legivel ? 0 : 2);
