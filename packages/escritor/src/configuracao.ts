// Escolha de provedor e modelo: tabela `ajuste` (ia.provedor, ia.modelo) →
// variável de ambiente (PROVEDOR_IA, <PROVEDOR>_MODEL) → padrão. A CHAVE vem
// só do ambiente, em qualquer caso.

import type Database from "better-sqlite3";
import { ErroConfiguracaoProvedor, ErroProvedor, type ModeloConsultado, type Provedor } from "./provedor.js";
import { acharDefinicao, PROVEDOR_PADRAO, PROVEDORES } from "./registro.js";

export const AJUSTE_PROVEDOR = "ia.provedor";
export const AJUSTE_MODELO = "ia.modelo";

export type Ambiente = Record<string, string | undefined>;
export type AjustesIA = Partial<Record<typeof AJUSTE_PROVEDOR | typeof AJUSTE_MODELO, string | undefined>>;

/** Lê as duas chaves de ajuste. Nunca lê chave de API (ela não existe no banco). */
export function lerAjustesIA(db: Database.Database): AjustesIA {
  const linhas = db
    .prepare("SELECT chave, valor FROM ajuste WHERE chave IN (?, ?)")
    .all(AJUSTE_PROVEDOR, AJUSTE_MODELO) as { chave: string; valor: string }[];
  const ajustes: AjustesIA = {};
  for (const l of linhas) ajustes[l.chave as keyof AjustesIA] = l.valor;
  return ajustes;
}

function preenchido(valor: string | undefined): string | undefined {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
}

/**
 * Escolhe e constrói o provedor. Precedência: ajuste do banco, depois
 * ambiente, depois padrão. Sem chave no ambiente: erro claro, nunca texto
 * inventado.
 */
export function criarProvedorPorEnv(
  env: Ambiente = process.env,
  ajustes: AjustesIA = {},
): Provedor {
  const id = (preenchido(ajustes[AJUSTE_PROVEDOR]) ?? preenchido(env.PROVEDOR_IA) ?? PROVEDOR_PADRAO).toLowerCase();
  const def = acharDefinicao(id);
  if (!def) {
    const validos = PROVEDORES.map((p) => `"${p.id}"`).join(", ");
    throw new ErroConfiguracaoProvedor(`provedor "${id}" desconhecido. Use um de: ${validos}.`);
  }

  const modelo = preenchido(ajustes[AJUSTE_MODELO]) ?? preenchido(env[def.variavelModelo]) ?? def.modeloPadrao;
  if (!def.modelos.some((m) => m.id === modelo)) {
    const validos = def.modelos.map((m) => m.id).join(", ");
    throw new ErroConfiguracaoProvedor(
      `modelo "${modelo}" não está na lista de ${def.nome}. Opções: ${validos}.`,
    );
  }

  const chave = preenchido(env[def.variavelChave]);
  if (!chave) {
    throw new ErroConfiguracaoProvedor(
      `${def.variavelChave} não está definida. Configure a chave de ${def.nome} no ambiente — nunca no código, nunca no banco, nunca inventada (ver ESCOPO-CLIENTE.md).`,
    );
  }
  return def.criar(chave, modelo);
}

/** Atalho: lê a escolha do banco e constrói o provedor. */
export function criarProvedorPorConfig(db: Database.Database, env: Ambiente = process.env): Provedor {
  return criarProvedorPorEnv(env, lerAjustesIA(db));
}

export interface ModeloListado extends ModeloConsultado {
  /** Padrão recomendado do projeto (modelo pequeno e barato). Vem primeiro. */
  recomendado?: boolean;
}

export interface ListagemModelos {
  /**
   * "consultada": veio do endpoint de modelos com a chave da pessoa (lista
   * real da conta). "sugerida": lista fixa do registro, usada porque a
   * consulta falhou ou o provedor não tem endpoint. O painel deve dizer a
   * diferença na tela.
   */
  origem: "consultada" | "sugerida";
  modelos: ModeloListado[];
  /** Por que caiu na lista sugerida. Só quando origem = "sugerida". */
  aviso?: string;
}

function ordenar(idProvedor: string | undefined, modelos: ModeloConsultado[]): ModeloListado[] {
  const def = idProvedor ? acharDefinicao(idProvedor) : undefined;
  const posicao = (id: string): number => {
    const i = def?.modelos.findIndex((m) => m.id === id) ?? -1;
    if (id === def?.modeloPadrao) return -1;
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return modelos
    .map((m): ModeloListado => (m.id === def?.modeloPadrao ? { ...m, recomendado: true } : { ...m }))
    .sort((a, b) => posicao(a.id) - posicao(b.id) || a.id.localeCompare(b.id));
}

// O endpoint da OpenAI lista também voz, imagem, embedding e moderação, e não
// diz o tipo. Filtro por nome (heurística); sem ele o seletor ficaria poluído.
const NAO_TEXTO = /embedding|tts|whisper|transcribe|realtime|image|dall-e|moderation|audio|sora|search-preview/i;

function sugeridos(idProvedor: string | undefined): ModeloListado[] {
  const def = idProvedor ? acharDefinicao(idProvedor) : undefined;
  return ordenar(
    idProvedor,
    (def?.modelos ?? []).map((m) => ({ id: m.id, nome: m.nome })),
  );
}

/**
 * Lista os modelos que a conta enxerga. Se a consulta falhar (ou o provedor
 * não tiver endpoint), devolve a lista sugerida do registro, marcada como
 * "sugerida". Nunca lança.
 */
export async function listarModelos(
  origem: Provedor | (() => Provedor),
  idProvedor?: string,
): Promise<ListagemModelos> {
  let id = idProvedor;
  try {
    const provedor = typeof origem === "function" ? origem() : origem;
    id = provedor.idProvedor ?? id;
    if (!provedor.listarModelos) {
      return { origem: "sugerida", modelos: sugeridos(id), aviso: "este provedor não tem consulta de modelos" };
    }
    let lista = await provedor.listarModelos();
    if (id === "openai") lista = lista.filter((m) => !NAO_TEXTO.test(m.id));
    if (lista.length === 0) {
      return { origem: "sugerida", modelos: sugeridos(id), aviso: "o provedor não devolveu nenhum modelo" };
    }
    return { origem: "consultada", modelos: ordenar(id, lista) };
  } catch (erro) {
    const aviso =
      erro instanceof ErroProvedor || erro instanceof ErroConfiguracaoProvedor
        ? erro.message
        : "falha inesperada ao consultar os modelos";
    return { origem: "sugerida", modelos: sugeridos(id), aviso };
  }
}

export interface ResultadoConexao {
  ok: boolean;
  /** Modelo que respondeu (só quando ok). */
  modelo?: string | undefined;
  tokensEntrada: number;
  tokensSaida: number;
  /** Mensagem clara para a tela. Nunca contém a chave. */
  mensagem: string;
  /** Modelos para o seletor (consultados ou sugeridos; veja `origem`). */
  listagem: ListagemModelos;
}

/**
 * Chamada mínima e barata para o botão "Testar conexão". Aceita o provedor
 * pronto ou uma função que o cria (para capturar também o erro de chave
 * ausente). Nunca lança: erro vira { ok: false, mensagem }.
 */
export async function testarConexao(
  origem: Provedor | (() => Provedor),
  idProvedor?: string,
): Promise<ResultadoConexao> {
  let provedor: Provedor;
  try {
    provedor = typeof origem === "function" ? origem() : origem;
  } catch (erro) {
    const mensagem = erro instanceof ErroConfiguracaoProvedor ? erro.message : "falha inesperada ao preparar a conexão";
    return { ok: false, tokensEntrada: 0, tokensSaida: 0, mensagem, listagem: { origem: "sugerida", modelos: sugeridos(idProvedor), aviso: mensagem } };
  }
  try {
    const r = await provedor.gerar({
      // A palavra JSON é exigida por OpenAI/DeepSeek quando response_format é json_object.
      sistema: "Responda somente com este JSON: {\"ok\": true}",
      usuario: "Responda em JSON.",
      maxTokens: 256,
    });
    return {
      ok: true,
      modelo: r.modelo,
      tokensEntrada: r.tokensEntrada,
      tokensSaida: r.tokensSaida,
      mensagem: "Conexão funcionou.",
      listagem: await listarModelos(provedor, idProvedor),
    };
  } catch (erro) {
    const mensagem =
      erro instanceof ErroProvedor || erro instanceof ErroConfiguracaoProvedor
        ? erro.message
        : "falha inesperada ao testar a conexão";
    // Chave recusada ou sem rede: nem tenta listar; mostra a lista sugerida.
    return {
      ok: false,
      tokensEntrada: 0,
      tokensSaida: 0,
      mensagem,
      listagem: { origem: "sugerida", modelos: sugeridos(provedor.idProvedor ?? idProvedor), aviso: mensagem },
    };
  }
}

/** Testa a conexão do provedor escolhido por configuração (ajuste → ambiente → padrão). */
export function testarConexaoPorEnv(env: Ambiente = process.env, ajustes: AjustesIA = {}): Promise<ResultadoConexao> {
  const id = (preenchido(ajustes[AJUSTE_PROVEDOR]) ?? preenchido(env.PROVEDOR_IA) ?? PROVEDOR_PADRAO).toLowerCase();
  return testarConexao(() => criarProvedorPorEnv(env, ajustes), id);
}
