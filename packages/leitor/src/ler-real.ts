#!/usr/bin/env -S node
// Rodada real contra o site de teste (rota66bh.com.br), de ponta a ponta:
// lê a listagem, lê N carros de detalhe, baixa as fotos e grava em
// produto/foto via @gerador/core. Ver ETAPA-4-CRITERIO.md.
//
// Uso: pnpm --filter @gerador/leitor ler-real [quantidade] [baseUrl]

import { join } from "node:path";
import { abrirBanco, RAIZ_PROJETO } from "@gerador/core";
import { adaptadorAutoCerto } from "./adaptadores/autocerto.js";
import { abrirNavegador } from "./navegador.js";
import { Leitor } from "./leitor.js";
import { baixarFotos } from "./fotos.js";
import { salvarFotos, salvarProduto } from "./persistencia.js";

async function main(): Promise<void> {
  const quantidade = Number.parseInt(process.argv[2] ?? "4", 10);
  const baseUrl = process.argv[3] ?? "https://rota66bh.com.br";

  console.log(`Lendo até ${quantidade} carro(s) de ${baseUrl}, intervalo >= 2s entre requisições...`);

  const navegador = await abrirNavegador();
  const leitor = new Leitor(adaptadorAutoCerto, navegador);
  const db = abrirBanco();

  try {
    const urls = await leitor.lerListagem(baseUrl);
    console.log(`Listagem: ${urls.length} URL(s) de detalhe encontradas.`);

    const alvo = urls.slice(0, quantidade);
    for (const url of alvo) {
      const inicio = new Date().toISOString();
      const { ficha } = await leitor.lerDetalhe(url);
      console.log(`\n[${inicio}] ${url}`);
      console.log(JSON.stringify(ficha, null, 2));

      const produtoId = salvarProduto(db, url, ficha);

      const pastaFotos = join(RAIZ_PROJETO, "dados", "fotos", String(produtoId));
      const { baixadas, descartadas } = await baixarFotos(ficha.fotos, pastaFotos);
      salvarFotos(db, produtoId, baixadas);

      console.log(
        `  produto #${produtoId}: ${baixadas.length} foto(s) salva(s), ${descartadas.length} descartada(s)`,
      );
      for (const d of descartadas) {
        console.log(`    descartada (${d.motivo}): ${d.url} ${d.detalhe ?? ""}`);
      }
    }
  } finally {
    db.close();
    await navegador.fechar();
  }
}

main().catch((erro) => {
  console.error("erro na leitura real:", erro);
  process.exitCode = 1;
});
