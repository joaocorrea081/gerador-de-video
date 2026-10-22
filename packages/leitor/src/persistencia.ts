// Grava o que foi lido nas tabelas `produto` e `foto` já existentes em
// packages/core (ETAPA-4-CRITERIO.md: reusar, não criar tabela nova).

import type Database from "better-sqlite3";
import type { FichaLida } from "./adaptador.js";
import type { FotoBaixada } from "./fotos.js";

/** Grava um produto lido e devolve o `id` (o mesmo, se a URL já existia). */
export function salvarProduto(
  db: Database.Database,
  origemUrl: string,
  ficha: FichaLida,
): number {
  const dadosJson = JSON.stringify({
    marca: ficha.marca,
    modelo: ficha.modelo,
    ano: ficha.ano,
    km: ficha.km,
    preco: ficha.preco,
    moeda: ficha.moeda,
    cor: ficha.cor,
    combustivel: ficha.combustivel,
    cambio: ficha.cambio,
    portas: ficha.portas,
    descricaoRevenda: ficha.descricaoRevenda,
    opcionais: ficha.opcionais && ficha.opcionais.length > 0 ? ficha.opcionais : undefined,
  });

  // Upsert por origem_url (índice único da migração v3): relido o mesmo carro,
  // atualiza o dado (preço novo) e mantém o id.
  const linha = db
    .prepare(
      `INSERT INTO produto (origem_url, dados_json, lido_em) VALUES (?, ?, ?)
       ON CONFLICT(origem_url) DO UPDATE SET dados_json = excluded.dados_json, lido_em = excluded.lido_em
       RETURNING id`,
    )
    .get(origemUrl, dadosJson, new Date().toISOString()) as { id: number };

  return linha.id;
}

/** Substitui as fotos de um produto pelas baixadas agora (não acumula). */
export function salvarFotos(
  db: Database.Database,
  produtoId: number,
  fotos: readonly FotoBaixada[],
): void {
  const inserir = db.prepare(
    "INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const transacao = db.transaction((lista: readonly FotoBaixada[]) => {
    db.prepare("DELETE FROM foto WHERE produto_id = ?").run(produtoId);
    for (const foto of lista) {
      inserir.run(produtoId, foto.url, foto.largura, foto.altura, foto.caminhoLocal, foto.ordem);
    }
  });
  transacao(fotos);
}
