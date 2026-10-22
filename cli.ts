#!/usr/bin/env -S node
// CLI mínima da raiz. Hoje só tem `status`: abre o banco, roda migrações
// e imprime a contagem por tabela.
import { abrirBanco, contarTabelas } from "@gerador/core";

function comandoStatus(): void {
  const db = abrirBanco();
  const contagens = contarTabelas(db);
  db.close();

  console.log("gerador-de-video — status");
  for (const [tabela, total] of Object.entries(contagens)) {
    console.log(`  ${tabela}: ${total}`);
  }
}

const comando = process.argv[2];

switch (comando) {
  case "status":
    comandoStatus();
    break;
  default:
    console.error(`comando desconhecido: ${comando ?? "(nenhum)"}`);
    console.error("uso: pnpm cli status");
    process.exit(1);
}
