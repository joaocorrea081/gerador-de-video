// Tipos próprios do escritor. Reusa o cardápio e o vocabulário de domínio de
// @gerador/core (ver packages/core/src/tipos.ts) em vez de duplicar.

import type { CardapioVideo, DadosVeiculo, MotivoRejeicao } from "@gerador/core";

/**
 * Limite de caracteres do título da legenda. Pensado como "gancho" de Reel:
 * cabe numa linha do feed sem cortar — o Instagram corta a legenda visível
 * por volta de 60-90 caracteres antes do "mais", 80 dá uma margem segura.
 */
export const LIMITE_TITULO = 80;

/**
 * Limite de caracteres do corpo da legenda. Reel de carro é objetivo:
 * 3-4 frases bastam para descrever o carro e chamar para a loja; legenda
 * longa demais reduz a taxa de leitura completa.
 */
export const LIMITE_CORPO = 400;

/**
 * Teto fixo de rejeições recentes injetadas por motivo no pedido ao modelo.
 * Sem teto, o custo e a demora da chamada sobem toda semana até estourar
 * (ver REGRAS-DE-NEGOCIO.md: "Tem que haver teto").
 */
export const TETO_REJEICOES_POR_MOTIVO = 10;

/** Número máximo de tentativas: 1 chamada inicial + até 2 retentativas. */
export const MAXIMO_TENTATIVAS = 3;

/**
 * Entrada do escritor: a ficha do carro (contexto de leitura — nunca é isso
 * que o modelo devolve), quantas fotos existem (o modelo escolhe por índice,
 * nunca vê a foto em si — ver ARQUITETURA.md sobre custo de visão) e o
 * idioma do anúncio, que é parâmetro, nunca constante fixada no código.
 */
export interface PedidoEscritor {
  dados: DadosVeiculo;
  quantidadeFotos: number;
  idioma: string;
}

/** Texto do anúncio, escrito pelo modelo. */
export interface TextoAnuncio {
  titulo: string;
  corpo: string;
}

/**
 * Saída validada do escritor: o texto que ele escreve e as escolhas do
 * cardápio fechado (fundo, ritmo, ordem das fotos). Nunca tem preço, ano,
 * quilometragem ou modelo — ver validacao.ts.
 */
export interface EscolhaEscritor {
  texto: TextoAnuncio;
  cardapio: CardapioVideo;
  ordemFotos: number[];
}

/** Uma rejeição anterior, resumida para entrar no pedido como exemplo do que evitar. */
export interface ExemploRejeicao {
  motivo: MotivoRejeicao;
  observacao: string | null;
  criadoEm: string;
}
