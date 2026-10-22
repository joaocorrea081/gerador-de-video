// Orquestra o escritor: monta o pedido, chama o provedor, valida, e tenta de
// novo em caso de erro, até MAXIMO_TENTATIVAS (ver ETAPA-2-CRITERIO.md).

import type Database from "better-sqlite3";
import { carregarMemoriaRejeicao } from "./memoria-rejeicao.js";
import { montarPedidoSistema, montarPedidoUsuario } from "./prompt.js";
import type { Provedor } from "./provedor.js";
import { MAXIMO_TENTATIVAS, type EscolhaEscritor, type ExemploRejeicao, type PedidoEscritor } from "./tipos.js";
import { ErroValidacao, validarResposta } from "./validacao.js";

/**
 * Estourou as MAXIMO_TENTATIVAS sem obter uma resposta válida. Nunca cai num
 * texto padrão fingindo que deu certo — é sempre um erro explícito (item 4
 * do critério de pronto).
 */
export class ErroEscritorEsgotado extends Error {
  constructor(public readonly tentativas: readonly string[]) {
    super(
      `escritor esgotou ${tentativas.length} tentativa(s) sem resposta válida: ${tentativas.join(" | ")}`,
    );
  }
}

export interface ResultadoEscritor {
  escolha: EscolhaEscritor;
  tokensEntrada: number;
  tokensSaida: number;
  tentativasUsadas: number;
}

/**
 * Escreve o anúncio e as escolhas do cardápio. Em caso de JSON inválido,
 * campo fora do cardápio ou texto acima do limite, reinjeta o erro no pedido
 * seguinte e tenta de novo, até MAXIMO_TENTATIVAS no total. Preço, ano, km e
 * modelo nunca saem daqui — eles só entram como contexto de leitura em
 * `pedido.dados` e a validação nunca copia campos extra da resposta do
 * modelo (ver validacao.ts).
 */
export async function escreverAnuncio(
  pedido: PedidoEscritor,
  provedor: Provedor,
  exemplos: ExemploRejeicao[] = [],
): Promise<ResultadoEscritor> {
  const sistema = montarPedidoSistema();
  const erros: string[] = [];
  let tokensEntrada = 0;
  let tokensSaida = 0;

  for (let tentativa = 1; tentativa <= MAXIMO_TENTATIVAS; tentativa++) {
    const usuario = montarPedidoUsuario(pedido, exemplos, erros.at(-1));
    const resposta = await provedor.gerar({ sistema, usuario });
    tokensEntrada += resposta.tokensEntrada;
    tokensSaida += resposta.tokensSaida;

    try {
      const escolha = validarResposta(resposta.textoCru, pedido.quantidadeFotos);
      return { escolha, tokensEntrada, tokensSaida, tentativasUsadas: tentativa };
    } catch (erro) {
      erros.push(erro instanceof ErroValidacao ? erro.message : String(erro));
    }
  }

  throw new ErroEscritorEsgotado(erros);
}

/** Atalho: carrega a memória de rejeição do banco (teto de 10 por motivo) e escreve o anúncio. */
export async function escreverAnuncioComMemoria(
  pedido: PedidoEscritor,
  provedor: Provedor,
  db: Database.Database,
): Promise<ResultadoEscritor> {
  const exemplos = carregarMemoriaRejeicao(db);
  return escreverAnuncio(pedido, provedor, exemplos);
}
