// Detecta carro que SAIU do estoque (vendido) ao reler o site, sem falso
// positivo. Esta é a camada de leitura; a marca e a contagem moram em core
// (estoque.ts). Princípio: só se conclui "saiu" quando a leitura FUNCIONOU e
// o carro não estava lá, e só depois de várias leituras seguidas.
//
// Para cada carro conhecido do site que NÃO veio na listagem:
//   - sonda a página dele (respeita robots.txt e o intervalo do Leitor);
//   - página no ar com dados do carro  -> ele existe (listagem paginada, por
//     exemplo): zera a contagem, NÃO conta como ausência;
//   - HTTP 404/410                     -> prova de que saiu: conta 1 ausência;
//   - qualquer outra coisa (site fora do ar, bloqueio, timeout, 5xx, ficha
//     vazia, navegador da pessoa fechado) -> inconclusivo: não muda nada.
// Listagem vazia = leitura falhou: não conclui nada de ninguém.
// Sumiço em massa (parece mudança de endereços do site, não venda): ignora.
//
// Limite conhecido: site que mantém a página do carro vendido NO AR (200,
// com selo "vendido") só é pego pela listagem+404; ver relatório.

import {
  listarProdutosDoHost,
  registrarAusencia,
  registrarPresenca,
  type ProdutoDoSite,
} from "@gerador/core";
import type Database from "better-sqlite3";
import type { NomeAdaptador } from "./adaptadores/registro.js";
import type { ModoNavegacao } from "./navegador-modos.js";
import { PaginaInexistenteError } from "./pagina-inexistente.js";
import type { FonteSite } from "./rodada.js";

export type ResultadoSonda = "viva" | "sumiu" | "inconclusiva";

/** Máximo de páginas sondadas por site por rodada (respeita o site; o resto espera a próxima). */
export const MAXIMO_SONDAS_PADRAO = 20;
/** Acima desta fração do estoque conhecido sumindo de uma vez, é mudança no site, não venda. */
export const FRACAO_SUMICO_EM_MASSA = 0.5;
/** Só vale a proteção de sumiço em massa com estoque conhecido de pelo menos isto. */
export const ESTOQUE_MINIMO_PARA_PROTECAO = 5;

export function normalizarUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return (u.origin + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export async function sondarPagina(
  fonte: FonteSite,
  url: string,
  adaptador?: NomeAdaptador,
  modo?: ModoNavegacao,
): Promise<ResultadoSonda> {
  try {
    const ficha = await fonte.detalhe(url, adaptador, modo);
    const temDado = ficha.preco !== undefined || ficha.modelo !== undefined || ficha.marca !== undefined;
    return temDado ? "viva" : "inconclusiva";
  } catch (e) {
    return e instanceof PaginaInexistenteError ? "sumiu" : "inconclusiva";
  }
}

export interface OpcoesReconciliar {
  /** Host do site (sem www) — o mesmo `id` do site cadastrado. */
  host: string;
  /** TODAS as URLs que a listagem trouxe (antes de cortar por `quantidade`). */
  listagem: readonly string[];
  /** URLs cuja página de detalhe devolveu 404/410 durante a leitura normal. */
  sumiramNoDetalhe?: ReadonlySet<string>;
  adaptador?: NomeAdaptador;
  modo?: ModoNavegacao;
  maximoSondas?: number;
  agora?: Date;
}

export interface ResultadoReconciliacao {
  /** Por que NADA foi concluído nesta passada ("listagem vazia", "sumiço em massa"...). */
  ignorada?: string;
  /** Produtos marcados "saiu do estoque" nesta passada. */
  marcados: number[];
  /** Produtos que estavam marcados e voltaram (marcação desfeita). */
  voltaram: number[];
  /** Ausências contadas mas ainda sem confirmar (produto → leituras seguidas). */
  emContagem: { produtoId: number; ausenciasSeguidas: number }[];
  inconclusivos: number[];
}

export async function reconciliarEstoque(
  db: Database.Database,
  fonte: FonteSite,
  o: OpcoesReconciliar,
): Promise<ResultadoReconciliacao> {
  const r: ResultadoReconciliacao = { marcados: [], voltaram: [], emContagem: [], inconclusivos: [] };
  const agora = o.agora ?? new Date();

  // Listagem vazia = a leitura falhou (ou o site está em manutenção). Nunca "vendeu tudo".
  if (o.listagem.length === 0) {
    r.ignorada = "listagem vazia: a leitura não serve para concluir que carros saíram";
    return r;
  }

  const naListagem = new Set(o.listagem.map(normalizarUrl));
  const sumiram = new Set([...(o.sumiramNoDetalhe ?? [])].map(normalizarUrl));
  const conhecidos: ProdutoDoSite[] = listarProdutosDoHost(db, o.host);

  const presentes: ProdutoDoSite[] = [];
  const sondar: ProdutoDoSite[] = [];
  const confirmados404: ProdutoDoSite[] = [];
  for (const p of conhecidos) {
    const chave = normalizarUrl(p.origemUrl);
    if (sumiram.has(chave)) confirmados404.push(p);
    else if (naListagem.has(chave)) presentes.push(p);
    else sondar.push(p);
  }

  // Sumiço em massa: provavelmente o site mudou de endereço/estrutura.
  const ativos = conhecidos.filter((p) => !p.saiuEm);
  const ausentesAtivos = [...sondar, ...confirmados404].filter((p) => !p.saiuEm);
  if (
    ativos.length >= ESTOQUE_MINIMO_PARA_PROTECAO &&
    ausentesAtivos.length / ativos.length > FRACAO_SUMICO_EM_MASSA
  ) {
    r.ignorada = `${ausentesAtivos.length} de ${ativos.length} carros sumiram de uma vez: parece mudança no site, não venda`;
    // Quem está na listagem continua valendo como "visto".
    for (const p of presentes) if (registrarPresenca(db, p.id, agora).voltou) r.voltaram.push(p.id);
    return r;
  }

  for (const p of presentes) {
    if (registrarPresenca(db, p.id, agora).voltou) r.voltaram.push(p.id);
  }

  const contar = (p: ProdutoDoSite, prova: string): void => {
    const a = registrarAusencia(db, p.id, prova, agora);
    if (a.marcadoAgora) r.marcados.push(p.id);
    else if (!a.saiu) r.emContagem.push({ produtoId: p.id, ausenciasSeguidas: a.ausenciasSeguidas });
  };

  for (const p of confirmados404) contar(p, "A página do carro devolveu 404/410 e ele sumiu da listagem.");

  const limite = o.maximoSondas ?? MAXIMO_SONDAS_PADRAO;
  let sondadas = 0;
  for (const p of sondar) {
    if (p.saiuEm) continue; // já marcado: nada a fazer, volta sozinho quando reaparecer na listagem
    if (sondadas >= limite) break;
    sondadas += 1;
    const s = await sondarPagina(fonte, p.origemUrl, o.adaptador, o.modo);
    if (s === "viva") {
      // Fora da listagem mas a página está no ar: não é venda (listagem paginada ou parcial).
      registrarPresenca(db, p.id, agora);
    } else if (s === "sumiu") {
      contar(p, "O carro não está na listagem e a página dele devolveu 404/410.");
    } else {
      r.inconclusivos.push(p.id);
    }
  }
  return r;
}
