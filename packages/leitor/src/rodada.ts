// A rodada: ler o site -> decidir se mudou -> enfileirar vídeo. É o caminho
// ÚNICO usado por `pnpm rodar` (rodar.ts) e pelo agendador do painel, para
// os dois nunca divergirem. Nunca duplica produto (índice único, migração v3).

import { join } from "node:path";
import {
  criarVideoDaFicha,
  passaFiltro,
  RAIZ_PROJETO,
  sistemaPausado,
  type FiltroCarros,
  type FundoEscolha,
  type ItemRodada,
  type ResultadoSiteRodada,
  type ResumoRodada,
  type RitmoEscolha,
} from "@gerador/core";
import type Database from "better-sqlite3";
import { adaptadorPorNome, type NomeAdaptador } from "./adaptadores/registro.js";
import { BloqueioError } from "./bloqueio.js";
import { reconciliarEstoque } from "./estoque-site.js";
import { PaginaInexistenteError } from "./pagina-inexistente.js";
import type { FichaLida } from "./adaptador.js";
import { baixarFotos, type ResultadoFotos } from "./fotos.js";
import { Leitor } from "./leitor.js";
import {
  abrirNavegadorDoModo,
  modoExigeNavegadorAberto,
  type ModoNavegacao,
  type NavegadorDeModo,
} from "./navegador-modos.js";
import { NavegadorIndisponivelError } from "./navegador-pessoa.js";
import { salvarFotos, salvarProduto } from "./persistencia.js";
import { buscarSite, idDoSite, listarSitesAtivos, marcarSiteLido } from "./sites.js";

/** De onde vem o dado. Trocável em teste para não depender de rede nem de navegador. */
export interface FonteSite {
  /** `adaptador` diz como ler este site; sem ele, usa o AutoCerto (comportamento antigo). */
  listar(baseUrl: string, adaptador?: NomeAdaptador, modo?: ModoNavegacao): Promise<string[]>;
  detalhe(url: string, adaptador?: NomeAdaptador, modo?: ModoNavegacao): Promise<FichaLida>;
  baixarFotos(urls: string[], pasta: string): Promise<ResultadoFotos>;
}

/** Fonte real: Playwright + adaptador. Quem chama precisa chamar `fechar()`. */
export async function abrirFonteReal(): Promise<{ fonte: FonteSite; fechar: () => Promise<void> }> {
  // Navegadores abrem sob demanda, um por modo. Quem lê não sabe qual está em uso.
  const navegadores = new Map<ModoNavegacao, NavegadorDeModo>();
  const navegadorDe = (modo: ModoNavegacao): NavegadorDeModo => {
    let n = navegadores.get(modo);
    if (!n) {
      n = abrirNavegadorDoModo(modo);
      navegadores.set(modo, n);
    }
    return n;
  };
  // Um leitor por (modo, adaptador): cada um guarda robots.txt por origem e o ritmo.
  const leitores = new Map<string, Leitor>();
  const leitorDe = (nome: NomeAdaptador, modo: ModoNavegacao): Leitor => {
    const chave = `${modo}:${nome}`;
    let l = leitores.get(chave);
    if (!l) {
      l = new Leitor(adaptadorPorNome(nome), navegadorDe(modo));
      leitores.set(chave, l);
    }
    return l;
  };
  return {
    fonte: {
      listar: (baseUrl, adaptador = "autocerto", modo = "playwright") => leitorDe(adaptador, modo).lerListagem(baseUrl),
      detalhe: async (url, adaptador = "autocerto", modo = "playwright") =>
        (await leitorDe(adaptador, modo).lerDetalhe(url)).ficha,
      baixarFotos: (urls, pasta) => baixarFotos(urls, pasta),
    },
    fechar: async () => {
      await Promise.allSettled([...navegadores.values()].map((n) => n.fechar()));
    },
  };
}

/**
 * Vídeo novo só se fizer sentido: produto sem vídeo ("novo"), ou dado que mudou
 * desde a leitura anterior ("atualizado") — preço velho no ar é problema de negócio.
 */
export function decidirCaso(antes: string | undefined, depois: string, temVideo: boolean): string {
  if (!temVideo) return "novo";
  if (antes === undefined || antes === depois) return "sem mudança, pulado";
  const a = JSON.parse(antes) as Record<string, unknown>;
  const d = JSON.parse(depois) as Record<string, unknown>;
  return a["preco"] !== d["preco"] ? "atualizado (preço mudou)" : "atualizado (dados mudaram)";
}

export const PASTA_FOTOS = join(RAIZ_PROJETO, "dados", "fotos");

export interface ProdutoLido {
  produtoId: number;
  caso: string;
  dados: Record<string, unknown>;
  baixadas: number;
  descartadas: number;
}

/** Lê UM produto no site, grava produto e fotos (upsert por URL) e diz o que mudou. */
export async function lerEGravarProduto(
  db: Database.Database,
  fonte: FonteSite,
  url: string,
  pastaFotos: string = PASTA_FOTOS,
  adaptador?: NomeAdaptador,
  modo?: ModoNavegacao,
): Promise<ProdutoLido> {
  const ficha = await fonte.detalhe(url, adaptador, modo);
  const antes = db.prepare("SELECT dados_json FROM produto WHERE origem_url = ?").get(url) as
    | { dados_json: string }
    | undefined;
  const produtoId = salvarProduto(db, url, ficha);
  const depois = db.prepare("SELECT dados_json FROM produto WHERE id = ?").get(produtoId) as { dados_json: string };
  const temVideo =
    (db.prepare("SELECT COUNT(*) AS n FROM video WHERE produto_id = ?").get(produtoId) as { n: number }).n > 0;
  const caso = decidirCaso(antes?.dados_json, depois.dados_json, temVideo);

  const { baixadas, descartadas } = await fonte.baixarFotos(ficha.fotos, join(pastaFotos, String(produtoId)));
  salvarFotos(db, produtoId, baixadas);

  return {
    produtoId,
    caso,
    dados: JSON.parse(depois.dados_json) as Record<string, unknown>,
    baixadas: baixadas.length,
    descartadas: descartadas.length,
  };
}

export interface OpcoesRodada {
  /**
   * Endereço explícito (compatível com `pnpm rodar <qtd> <url>` e com o
   * agendador antigo): se vier, lê SÓ esse. Sem ele, percorre os sites
   * cadastrados e ativos (ver sites.ts).
   */
  baseUrl?: string;
  /** Adaptador do endereço explícito. Padrão: o do site cadastrado com o mesmo host, ou AutoCerto. */
  adaptador?: NomeAdaptador;
  /** Modo de navegação do endereço explícito. Padrão: o do site cadastrado com o mesmo host, ou playwright. */
  modo?: ModoNavegacao;
  /**
   * true quando a rodada vem do agendador (sem ninguém na frente da máquina).
   * Sites em modo "navegador-da-pessoa" são PULADOS, com o motivo registrado:
   * o BrowserSkill precisa do navegador aberto e não roda sozinho.
   */
  agendada?: boolean;
  /** Máximo de carros lidos POR SITE. */
  quantidade: number;
  filtro?: FiltroCarros;
  pastaFotos?: string;
}

const FUNDOS: readonly FundoEscolha[] = ["claro", "escuro", "gradiente"];
const RITMOS: readonly RitmoEscolha[] = ["calmo", "rapido"];

interface AlvoRodada {
  siteId: string;
  url: string;
  adaptador: NomeAdaptador;
  modo: ModoNavegacao;
  cadastrado: boolean;
}

function alvosDaRodada(db: Database.Database, opcoes: OpcoesRodada): AlvoRodada[] {
  if (opcoes.baseUrl !== undefined) {
    const id = idDoSite(opcoes.baseUrl);
    const cadastrado = buscarSite(db, id);
    return [
      {
        siteId: id,
        url: opcoes.baseUrl,
        adaptador: opcoes.adaptador ?? cadastrado?.adaptador ?? "autocerto",
        modo: opcoes.modo ?? cadastrado?.modo ?? "playwright",
        cadastrado: cadastrado !== undefined,
      },
    ];
  }
  return listarSitesAtivos(db).map((s) => ({ siteId: s.id, url: s.url, adaptador: s.adaptador, modo: s.modo, cadastrado: true }));
}

/** Rodada completa. `aoLer` deixa o `pnpm rodar` imprimir cada carro. */
export async function executarRodada(
  db: Database.Database,
  fonte: FonteSite,
  opcoes: OpcoesRodada,
  aoLer?: (item: ItemRodada, lido: ProdutoLido) => void,
): Promise<ResumoRodada> {
  const iniciadaEm = new Date().toISOString();
  const itens: ItemRodada[] = [];
  const sites: ResultadoSiteRodada[] = [];
  // Freio de mão: leitura agendada não roda com o sistema pausado (pausa.ts).
  // Leitura manual (alguém clicou "ler agora") segue permitida: é ato deliberado
  // e só enfileira vídeos — o render e a publicação continuam travados.
  if (opcoes.agendada && sistemaPausado(db)) {
    return {
      iniciadaEm,
      terminadaEm: new Date().toISOString(),
      itens,
      sites,
      erro: "Sistema pausado: a leitura agendada não rodou.",
    };
  }
  const alvos = alvosDaRodada(db, opcoes);

  if (alvos.length === 0) {
    return {
      iniciadaEm,
      terminadaEm: new Date().toISOString(),
      itens,
      sites,
      erro: "Nenhum site ativo cadastrado. Cadastre um site para o sistema ler.",
    };
  }

  let n = 0;
  for (const alvo of alvos) {
    let lidos = 0;
    // Pausou no meio da rodada agendada: não começa o próximo site.
    if (opcoes.agendada && sistemaPausado(db)) {
      sites.push({ siteId: alvo.siteId, url: alvo.url, lidos, estado: "pulado-pausa", erro: "Pulado: o sistema foi pausado." });
      continue;
    }
    if (opcoes.agendada && modoExigeNavegadorAberto(alvo.modo)) {
      sites.push({
        siteId: alvo.siteId,
        url: alvo.url,
        lidos,
        estado: "pulado-agendada",
        erro: "Pulado: este site só é lido com o navegador da pessoa aberto e a rodada agendada roda sem ninguém. Rode manualmente.",
      });
      continue;
    }
    try {
      // A listagem INTEIRA vale para detectar carro que saiu do estoque; só a
      // leitura de detalhe é limitada por `quantidade`.
      const listagem = await fonte.listar(alvo.url, alvo.adaptador, alvo.modo);
      const urls = listagem.slice(0, opcoes.quantidade);
      const sumiramNoDetalhe = new Set<string>();
      for (const url of urls) {
        let lido: ProdutoLido;
        try {
          lido = await lerEGravarProduto(db, fonte, url, opcoes.pastaFotos, alvo.adaptador, alvo.modo);
        } catch (e) {
          // Página de um carro listado devolveu 404/410: é evidência de saída, não falha do site.
          if (e instanceof PaginaInexistenteError) {
            sumiramNoDetalhe.add(url);
            continue;
          }
          throw e;
        }
        lidos += 1;
        const item: ItemRodada = { produtoId: lido.produtoId, url, caso: lido.caso, enfileirado: false };

        if (lido.caso === "sem mudança, pulado") {
          item.motivo = "sem mudança";
        } else if (opcoes.filtro && !passaFiltro(lido.dados, opcoes.filtro)) {
          item.motivo = "fora do filtro";
        } else {
          const { video } = criarVideoDaFicha(db, lido.produtoId, {
            fundo: FUNDOS[n % FUNDOS.length] as FundoEscolha,
            ritmo: RITMOS[n % RITMOS.length] as RitmoEscolha,
          });
          item.enfileirado = true;
          item.videoId = video.id;
          n += 1;
        }
        itens.push(item);
        aoLer?.(item, lido);
      }
      // A leitura funcionou até aqui (nada lançou): agora dá para concluir quem saiu do estoque.
      let estoque: ResultadoSiteRodada["estoque"];
      try {
        const rec = await reconciliarEstoque(db, fonte, {
          host: alvo.siteId,
          listagem,
          sumiramNoDetalhe,
          adaptador: alvo.adaptador,
          modo: alvo.modo,
        });
        estoque = { marcados: rec.marcados, voltaram: rec.voltaram, ...(rec.ignorada ? { ignorada: rec.ignorada } : {}) };
      } catch {
        // Conferir estoque nunca derruba a rodada (e na dúvida não marca nada).
      }
      if (alvo.cadastrado) marcarSiteLido(db, alvo.siteId);
      sites.push({ siteId: alvo.siteId, url: alvo.url, lidos, ...(estoque ? { estoque } : {}) });
    } catch (e) {
      // Endereço explícito: falha como sempre falhou (quem chama trata o erro).
      if (opcoes.baseUrl !== undefined) throw e;
      // Sites cadastrados: um fora do ar não derruba os outros. Registra e segue.
      // Estado claro para o painel escrever "abra o navegador" ou "o site bloqueou".
      const estado =
        e instanceof NavegadorIndisponivelError
          ? "navegador-indisponivel"
          : e instanceof BloqueioError
            ? `bloqueado:${e.sinal}`
            : undefined;
      sites.push({
        siteId: alvo.siteId,
        url: alvo.url,
        lidos,
        erro: (e as Error).message,
        ...(estado ? { estado } : {}),
      });
    }
  }
  const falhas = sites.filter((s) => s.erro !== undefined);
  const resumo: ResumoRodada = { iniciadaEm, terminadaEm: new Date().toISOString(), itens, sites };
  // Compatível com quem lia `erro`: antes, a falha única era lançada. Agora só vira
  // erro da rodada quando TODOS os sites falharam.
  if (falhas.length === sites.length) resumo.erro = falhas.map((s) => `${s.siteId}: ${s.erro}`).join("; ");
  return resumo;
}
