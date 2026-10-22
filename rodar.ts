#!/usr/bin/env -S node
// O comando único: liga as quatro partes numa tacada só.
//
//   leitor -> escritor -> montador (fila) -> portão
//
// Uso: pnpm rodar [quantidadeDeCarros] [baseUrl]
//
// O escritor só entra se houver chave de API no ambiente. Sem chave, o texto
// do anúncio fica sendo a ficha lida, sem copy nenhuma — e o script DIZ isso,
// em vez de fingir que escreveu (ver ESTADO.md).
import { join } from "node:path";
import { abrirBanco, contarTabelas, RAIZ_PROJETO } from "@gerador/core";
import { abrirFonteReal, executarRodada } from "@gerador/leitor";
import { criarFila } from "@gerador/montador";

const PASTA_VIDEOS = join(RAIZ_PROJETO, "dados", "videos");

function titulo(dados: Record<string, unknown>): string {
  return [dados["marca"], dados["modelo"]].filter(Boolean).join(" ");
}

async function main(): Promise<void> {
  const quantidade = Number.parseInt(process.argv[2] ?? "3", 10);
  const baseUrl = process.argv[3] ?? "https://rota66bh.com.br";

  const temChave = Boolean(process.env["ANTHROPIC_API_KEY"] ?? process.env["DEEPSEEK_API_KEY"]);

  console.log("=".repeat(64));
  console.log("GERADOR DE VÍDEO — rodada completa");
  console.log("=".repeat(64));
  console.log(`Site:   ${baseUrl}`);
  console.log(`Carros: ${quantidade}`);
  console.log(
    temChave
      ? "Texto:  escritor com chave de API"
      : "Texto:  SEM chave de API — o anúncio fica sendo a ficha lida, sem copy",
  );
  console.log();

  const db = abrirBanco();

  // ---------- 1. LEITOR (+ decidir se mudou + enfileirar) ----------
  // Mesmo caminho do agendador do painel: executarRodada em @gerador/leitor.
  console.log("[1/4] LEITOR — lendo o site com navegador de verdade");
  const { fonte, fechar } = await abrirFonteReal();
  try {
    const resumo = await executarRodada(db, fonte, { baseUrl, quantidade }, (item, lido) => {
      const preco = typeof lido.dados["preco"] === "number" ? `R$ ${lido.dados["preco"]}` : "sem preço";
      console.log(
        `      #${item.produtoId} ${titulo(lido.dados)} ${lido.dados["ano"] ?? ""} — ${preco} — ` +
          `${lido.baixadas} foto(s), ${lido.descartadas} descartada(s) — ${item.caso}`,
      );
    });
    console.log(`      ${resumo.itens.filter((i) => i.enfileirado).length} vídeo(s) enfileirado(s)`);
  } finally {
    await fechar();
  }

  // ---------- 2. ESCRITOR ----------
  console.log();
  console.log("[2/4] ESCRITOR — texto do anúncio e escolhas do cardápio");
  if (!temChave) {
    console.log("      PULADO: sem chave de API no ambiente.");
    console.log("      O vídeo sai com a ficha lida, sem texto escrito.");
    console.log("      Para ligar: echo 'DEEPSEEK_API_KEY=sk-...' >> .env");
  }

  // ---------- 3. MONTADOR ----------
  console.log();
  console.log("[3/4] MONTADOR — fila de render, um vídeo por vez");

  const fila = criarFila(db, { pastaSaida: PASTA_VIDEOS });
  const inicio = Date.now();
  const processados = await fila.esvaziar();
  const segundos = Math.round((Date.now() - inicio) / 1000);
  console.log(`      ${processados} vídeo(s) renderizado(s) em ${segundos}s`);

  // ---------- 4. PORTÃO ----------
  console.log();
  console.log("[4/4] PORTÃO — esperando aprovação humana");
  const contagens = contarTabelas(db);
  console.log(`      banco: ${JSON.stringify(contagens)}`);
  console.log();
  console.log("Nada publica sozinho. Abra o painel e aprove:");
  console.log("  pnpm dev:portao     ->  http://127.0.0.1:3080");
  console.log();

  db.close();
}

main().catch((erro: unknown) => {
  console.error("falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
