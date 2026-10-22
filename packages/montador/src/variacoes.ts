// Regenerar com variação: dada a escolha atual, devolve N escolhas DIFERENTES
// e sensatas, trocando modelo, cor ou enquadramento (fundo, ritmo e ordem das
// fotos ficam como estão). O painel oferece como sugestão; a pessoa trabalha
// em cima da que gostar. Determinística por semente: mesma semente, mesma
// lista; semente nova ("regenerar") dá outra.
import type Database from "better-sqlite3";
import {
  CORES_ESCOLHA,
  ErroPortao,
  PADRAO_CARDAPIO,
  obterVideo,
  ENQUADRAMENTOS_ESCOLHA,
  MODELOS_ESCOLHA,
  type CardapioCompleto,
} from "@gerador/core";

function prng(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(lista: T[], rnd: () => number): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

const chave = (c: CardapioCompleto) => `${c.modelo}|${c.cor}|${c.enquadramento}`;

/**
 * Regra de bom senso: "grafite" sobre fundo escuro vira cinza quase branco
 * (o contraste obriga), indistinguível do texto. Não sugerimos; a pessoa
 * ainda pode escolher à mão.
 */
function sensata(c: CardapioCompleto): boolean {
  return !(c.cor === "grafite" && c.fundo === "escuro");
}

/**
 * Até `n` variações distintas da `atual`. Primeiro as que mudam UMA coisa
 * (revezando modelo, cor, enquadramento, para a lista variar de cara); se
 * faltar, as que mudam duas ou três. Nunca inclui a atual, nunca repete.
 * Pode devolver menos que `n` se o cardápio não tiver tantas.
 */
export function sugerirVariacoes(atual: CardapioCompleto, n: number, semente = 1): CardapioCompleto[] {
  const rnd = prng(semente);
  const porDimensao: Record<"modelo" | "cor" | "enquadramento", CardapioCompleto[]> = {
    modelo: MODELOS_ESCOLHA.filter((m) => m !== atual.modelo).map((modelo) => ({ ...atual, modelo })),
    cor: CORES_ESCOLHA.filter((c) => c !== atual.cor).map((cor) => ({ ...atual, cor })),
    enquadramento: ENQUADRAMENTOS_ESCOLHA.filter((e) => e !== atual.enquadramento).map((enquadramento) => ({
      ...atual,
      enquadramento,
    })),
  };
  const filas = (["modelo", "cor", "enquadramento"] as const).map((d) => embaralhar(porDimensao[d], rnd));

  // combinações de 2+ mudanças, todas, embaralhadas
  const todas: CardapioCompleto[] = [];
  for (const modelo of MODELOS_ESCOLHA)
    for (const cor of CORES_ESCOLHA)
      for (const enquadramento of ENQUADRAMENTOS_ESCOLHA) todas.push({ ...atual, modelo, cor, enquadramento });
  const resto = embaralhar(todas, rnd);

  const vistas = new Set<string>([chave(atual)]);
  const saida: CardapioCompleto[] = [];
  const tentar = (c: CardapioCompleto | undefined) => {
    if (!c || saida.length >= n || !sensata(c) || vistas.has(chave(c))) return;
    vistas.add(chave(c));
    saida.push(c);
  };

  // rodízio entre as dimensões enquanto houver "uma mudança"
  for (let i = 0; saida.length < n && filas.some((f) => i < f.length); i++) {
    for (const f of filas) tentar(f[i]);
  }
  for (const c of resto) tentar(c);
  return saida;
}

/**
 * Ponto de entrada do painel: dado um vídeo, até `n` variações diferentes da
 * escolha atual dele (vídeo antigo conta com o padrão). Mude a `semente` para
 * "regenerar" e ver outras.
 */
export function sugerirVariacoesDoVideo(
  db: Database.Database,
  videoId: number,
  n = 3,
  semente = 1,
): CardapioCompleto[] {
  const v = obterVideo(db, videoId);
  if (!v) throw new ErroPortao(`vídeo ${videoId} não encontrado`);
  const atual: CardapioCompleto = {
    fundo: v.fundo ?? PADRAO_CARDAPIO.fundo,
    ritmo: v.ritmo ?? PADRAO_CARDAPIO.ritmo,
    enquadramento: v.enquadramento ?? PADRAO_CARDAPIO.enquadramento,
    modelo: v.modelo ?? PADRAO_CARDAPIO.modelo,
    cor: v.cor ?? PADRAO_CARDAPIO.cor,
    ordemFotos: v.ordemFotosJson ? safeOrdem(v.ordemFotosJson) : [],
  };
  return sugerirVariacoes(atual, n, semente);
}

function safeOrdem(json: string): number[] {
  try {
    const o = JSON.parse(json) as unknown;
    return Array.isArray(o) ? (o as number[]) : [];
  } catch {
    return [];
  }
}
