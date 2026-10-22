// Monta o pedido (system + user) enviado ao provedor de IA.

import { FUNDOS_ESCOLHA, RITMOS_ESCOLHA } from "@gerador/core";
import { LIMITE_CORPO, LIMITE_TITULO, type ExemploRejeicao, type PedidoEscritor } from "./tipos.js";

function formatarExemplos(exemplos: ExemploRejeicao[]): string {
  if (exemplos.length === 0) return "Nenhuma rejeição registrada ainda.";
  return exemplos
    .map((exemplo) => `- motivo: ${exemplo.motivo}${exemplo.observacao ? ` — ${exemplo.observacao}` : ""}`)
    .join("\n");
}

/** Instruções fixas: o cardápio fechado e o formato de saída. Não depende do pedido. */
export function montarPedidoSistema(): string {
  return [
    "Você escreve o texto de um anúncio em vídeo curto de revenda de carros.",
    "",
    "Você NUNCA escolhe preço, ano, quilometragem ou modelo do carro — esses",
    "dados já existem, vêm de outro sistema e vão direto para o vídeo. Se você",
    "incluir qualquer um desses campos na resposta, eles serão descartados e",
    "ignorados, então nem tente.",
    "",
    "Você só pode escolher, dentro das opções fechadas a seguir — nunca invente",
    "uma opção fora desta lista:",
    `- fundo: ${FUNDOS_ESCOLHA.join(" | ")}`,
    `- ritmo: ${RITMOS_ESCOLHA.join(" | ")}`,
    "- ordemFotos: lista de índices (começando em 0) das fotos que existem, na ordem que você quer usar",
    "- texto do anúncio (título e corpo), que você escreve",
    "",
    "Responda APENAS com um JSON válido, sem nenhum texto fora dele, exatamente no formato:",
    '{"texto":{"titulo":"...","corpo":"..."},"cardapio":{"fundo":"...","ritmo":"..."},"ordemFotos":[0,1,2]}',
    "",
    `Limite de "texto.titulo": ${LIMITE_TITULO} caracteres.`,
    `Limite de "texto.corpo": ${LIMITE_CORPO} caracteres.`,
  ].join("\n");
}

/**
 * Monta o pedido do usuário: a ficha do carro como contexto de leitura (não
 * como algo para repetir como campo separado), o idioma pedido (parâmetro,
 * nunca fixo), a memória de rejeição e, em retentativas, o erro anterior.
 */
export function montarPedidoUsuario(
  pedido: PedidoEscritor,
  exemplos: ExemploRejeicao[],
  erroTentativaAnterior?: string,
): string {
  const partes = [
    "Ficha do carro (contexto para você escrever o texto — estes dados já",
    "aparecem no vídeo por fora, não os repita como campo na sua resposta):",
    JSON.stringify(pedido.dados),
    "",
    `Idioma do anúncio: ${pedido.idioma}.`,
    `Quantidade de fotos disponíveis: ${pedido.quantidadeFotos} (índices válidos: 0 a ${pedido.quantidadeFotos - 1}).`,
    "",
    "Exemplos de rejeições recentes a evitar (as mais recentes de cada motivo):",
    formatarExemplos(exemplos),
  ];

  if (erroTentativaAnterior) {
    partes.push(
      "",
      `A tentativa anterior falhou na validação: ${erroTentativaAnterior}`,
      "Corrija isso e responda de novo, só com o JSON no formato pedido.",
    );
  }

  return partes.join("\n");
}
