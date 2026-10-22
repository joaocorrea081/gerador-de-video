#!/usr/bin/env -S npx tsx
// Script de prova real: chama de VERDADE o provedor escolhido em PROVEDOR_IA,
// com a chave lida do ambiente, e imprime o JSON devolvido e a contagem de
// tokens. Nunca inventa chave, nunca procura chave em outra pasta, nunca cria
// .env — se a variável de ambiente não estiver definida, diz isso de forma
// clara e sai com código 1, sem stack trace feio.

import { criarProvedorPorEnv, ErroConfiguracaoProvedor, escreverAnuncio } from "./src/index.js";

async function principal(): Promise<void> {
  const provedor = criarProvedorPorEnv();

  const resultado = await escreverAnuncio(
    {
      dados: {
        marca: "Toyota",
        modelo: "Corolla",
        ano: 2020,
        km: 48000,
        preco: 15500,
        revenda: "Revenda Teste",
      },
      quantidadeFotos: 6,
      idioma: "pt-BR",
    },
    provedor,
    [],
  );

  console.log("=== JSON devolvido (validado) ===");
  console.log(JSON.stringify(resultado.escolha, null, 2));
  console.log("");
  console.log(`tokens de entrada: ${resultado.tokensEntrada}`);
  console.log(`tokens de saída: ${resultado.tokensSaida}`);
  console.log(`tentativas usadas: ${resultado.tentativasUsadas}`);
}

principal().catch((erro: unknown) => {
  if (erro instanceof ErroConfiguracaoProvedor) {
    console.error(`Não foi possível rodar a prova real: ${erro.message}`);
    process.exit(1);
  }
  console.error(`Falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
