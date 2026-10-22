// Carro que saiu do estoque (vendido) e continua no ar é o pior risco do
// negócio. Este módulo guarda a marca "saiu do estoque" e a contagem de
// leituras seguidas sem o carro. NUNCA apaga produto nem histórico.
//
// Regra de ouro contra falso positivo: quem chama só registra AUSÊNCIA depois
// de uma leitura que funcionou e de uma prova de que o carro não está lá
// (ver reconciliarEstoque em packages/leitor). Site fora do ar, bloqueio, erro
// de rede ou listagem vazia nunca chegam aqui como "ausência".

import type Database from "better-sqlite3";
import { obterAjuste, definirAjuste } from "./repositorio.js";

export const CHAVE_LEITURAS_PARA_SAIDA = "estoque.leituras_para_saida";
/** Quantas leituras SEGUIDAS sem o carro até marcar como "saiu do estoque". */
export const LEITURAS_PARA_SAIDA_PADRAO = 3;

export function leiturasParaSaida(db: Database.Database): number {
  const n = Number(obterAjuste(db, CHAVE_LEITURAS_PARA_SAIDA));
  return Number.isInteger(n) && n >= 1 ? n : LEITURAS_PARA_SAIDA_PADRAO;
}

export function definirLeiturasParaSaida(db: Database.Database, n: number): void {
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("leituras para saída: inteiro de 1 a 50");
  definirAjuste(db, CHAVE_LEITURAS_PARA_SAIDA, String(n));
}

export function produtoSaiuDoEstoque(db: Database.Database, produtoId: number): boolean {
  const l = db.prepare("SELECT saiu_do_estoque_em AS s FROM produto WHERE id = ?").get(produtoId) as
    | { s: string | null }
    | undefined;
  return !!l?.s;
}

export interface ProdutoDoSite {
  id: number;
  origemUrl: string;
  saiuEm: string | null;
  ausenciasSeguidas: number;
}

/** Host sem "www", em minúsculas — o mesmo critério dos sites cadastrados. */
export function hostDaUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function listarProdutosDoHost(db: Database.Database, host: string): ProdutoDoSite[] {
  const linhas = db
    .prepare("SELECT id, origem_url, saiu_do_estoque_em, ausencias_seguidas FROM produto ORDER BY id")
    .all() as { id: number; origem_url: string; saiu_do_estoque_em: string | null; ausencias_seguidas: number }[];
  return linhas
    .filter((l) => hostDaUrl(l.origem_url) === host)
    .map((l) => ({ id: l.id, origemUrl: l.origem_url, saiuEm: l.saiu_do_estoque_em, ausenciasSeguidas: l.ausencias_seguidas }));
}

/**
 * O carro apareceu (na listagem ou com a página no ar). Zera a contagem e, se
 * estava marcado como "saiu do estoque", DESFAZ a marcação.
 */
export function registrarPresenca(db: Database.Database, produtoId: number, agora: Date = new Date()): { voltou: boolean } {
  const antes = db.prepare("SELECT saiu_do_estoque_em AS s FROM produto WHERE id = ?").get(produtoId) as
    | { s: string | null }
    | undefined;
  if (!antes) return { voltou: false };
  db.prepare(
    `UPDATE produto SET ausencias_seguidas = 0, saiu_do_estoque_em = NULL, saida_detalhe = NULL, ultima_vista_em = ?
     WHERE id = ?`,
  ).run(agora.toISOString(), produtoId);
  return { voltou: !!antes.s };
}

export interface ResultadoAusencia {
  ausenciasSeguidas: number;
  /** Passou a ser "saiu do estoque" nesta chamada. */
  marcadoAgora: boolean;
  /** Está marcado (agora ou desde antes). */
  saiu: boolean;
}

/**
 * Uma leitura que FUNCIONOU e provou que o carro não está lá. Só marca quando
 * a contagem chega ao número configurado de leituras seguidas.
 * `detalhe` diz a prova (ex.: "página devolveu 404"), para o painel explicar.
 */
export function registrarAusencia(
  db: Database.Database,
  produtoId: number,
  detalhe: string,
  agora: Date = new Date(),
): ResultadoAusencia {
  const l = db.prepare("SELECT ausencias_seguidas AS n, saiu_do_estoque_em AS s FROM produto WHERE id = ?").get(produtoId) as
    | { n: number; s: string | null }
    | undefined;
  if (!l) return { ausenciasSeguidas: 0, marcadoAgora: false, saiu: false };
  if (l.s) return { ausenciasSeguidas: l.n, marcadoAgora: false, saiu: true };

  const n = l.n + 1;
  const marcar = n >= leiturasParaSaida(db);
  db.prepare(
    "UPDATE produto SET ausencias_seguidas = ?, saiu_do_estoque_em = ?, saida_detalhe = ? WHERE id = ?",
  ).run(n, marcar ? agora.toISOString() : null, marcar ? detalhe : null, produtoId);
  return { ausenciasSeguidas: n, marcadoAgora: marcar, saiu: marcar };
}

// ------------------------------------------------------------- alertas

export interface AlertaEstoque {
  publicacaoId: number;
  videoId: number;
  produtoId: number;
  origemUrl: string;
  rede: string;
  estadoPublicacao: string;
  /** 'tirar_do_ar': já está no ar, a pessoa decide se tira. 'bloqueada': ainda não saiu e não vai sair. */
  situacao: "tirar_do_ar" | "bloqueada";
  simulado: boolean;
  idExterno: string | null;
  publicadaEm: string | null;
  saiuEm: string;
  motivo: string | null;
  ficha: Record<string, unknown>;
}

/**
 * Publicações ligadas a carro que saiu do estoque. NÃO remove nada: tirar do
 * ar é decisão humana. As publicadas viram "tirar_do_ar"; as que ainda não
 * saíram ficam travadas (publicacoesVencidas e reivindicarPublicacao as barram).
 */
export function listarAlertasEstoque(db: Database.Database): AlertaEstoque[] {
  const linhas = db
    .prepare(
      `SELECT pub.id AS pid, pub.video_id, pub.rede, pub.estado, pub.simulado, pub.id_externo, pub.publicada_em,
              p.id AS produto_id, p.origem_url, p.saiu_do_estoque_em, p.saida_detalhe, p.dados_json
       FROM publicacao pub
       JOIN video v ON v.id = pub.video_id
       JOIN produto p ON p.id = v.produto_id
       WHERE p.saiu_do_estoque_em IS NOT NULL
         AND pub.estado IN ('publicada','agendada','publicando','verificar','falhou')
       ORDER BY p.saiu_do_estoque_em, pub.id`,
    )
    .all() as {
    pid: number; video_id: number; rede: string; estado: string; simulado: number; id_externo: string | null;
    publicada_em: string | null; produto_id: number; origem_url: string; saiu_do_estoque_em: string;
    saida_detalhe: string | null; dados_json: string;
  }[];
  return linhas.map((l) => ({
    publicacaoId: l.pid,
    videoId: l.video_id,
    produtoId: l.produto_id,
    origemUrl: l.origem_url,
    rede: l.rede,
    estadoPublicacao: l.estado,
    situacao: l.estado === "publicada" ? "tirar_do_ar" : "bloqueada",
    simulado: l.simulado === 1,
    idExterno: l.id_externo,
    publicadaEm: l.publicada_em,
    saiuEm: l.saiu_do_estoque_em,
    motivo: l.saida_detalhe,
    ficha: JSON.parse(l.dados_json) as Record<string, unknown>,
  }));
}

export interface ProdutoForaDoEstoque {
  produtoId: number;
  origemUrl: string;
  saiuEm: string;
  motivo: string | null;
  ficha: Record<string, unknown>;
}

export function listarProdutosForaDoEstoque(db: Database.Database): ProdutoForaDoEstoque[] {
  return (
    db
      .prepare(
        `SELECT id, origem_url, saiu_do_estoque_em, saida_detalhe, dados_json FROM produto
         WHERE saiu_do_estoque_em IS NOT NULL ORDER BY saiu_do_estoque_em DESC`,
      )
      .all() as { id: number; origem_url: string; saiu_do_estoque_em: string; saida_detalhe: string | null; dados_json: string }[]
  ).map((l) => ({
    produtoId: l.id, origemUrl: l.origem_url, saiuEm: l.saiu_do_estoque_em, motivo: l.saida_detalhe,
    ficha: JSON.parse(l.dados_json) as Record<string, unknown>,
  }));
}
