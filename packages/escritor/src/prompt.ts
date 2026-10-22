// Monta o pedido (system + user) enviado ao provedor de IA.

import { FUNDOS_ESCOLHA, RITMOS_ESCOLHA } from "@gerador/core";
import { REGRAS_DE_TEXTO_HUMANO } from "./humanizacao.js";
import type { DadosVeiculo } from "@gerador/core";
import { LIMITE_CORPO, LIMITE_TITULO, type ExemploRejeicao, type PedidoEscritor } from "./tipos.js";

function formatarExemplos(exemplos: ExemploRejeicao[]): string {
  if (exemplos.length === 0) return "Nenhuma rejeição registrada ainda.";
  return exemplos
    .map((exemplo) => `- motivo: ${exemplo.motivo}${exemplo.observacao ? ` — ${exemplo.observacao}` : ""}`)
    .join("\n");
}

const CAMPOS_SIMPLES: ReadonlyArray<[keyof DadosVeiculo, string]> = [
  ["marca", "Marca"], ["modelo", "Modelo"], ["cor", "Cor"], ["combustivel", "Combustível"],
  ["cambio", "Câmbio"], ["portas", "Portas"], ["revenda", "Revenda"],
];

/**
 * Ficha em texto. Campo ausente é dito como ausente (para o modelo não
 * preencher). Opcionais entram como lista; o texto livre da loja entra num
 * bloco à parte, marcado como FONTE e não como fato.
 */
export function formatarFicha(dados: DadosVeiculo): string[] {
  const linhas: string[] = [];
  const faltando: string[] = [];
  for (const [campo, rotulo] of CAMPOS_SIMPLES) {
    const v = dados[campo];
    if (v === undefined || v === "") faltando.push(rotulo.toLowerCase());
    else linhas.push(`${rotulo}: ${String(v)}`);
  }
  // ano, km e preço aparecem para contexto, mas o sistema é quem os põe na tela.
  linhas.push(`(já na tela, não cite: ano ${dados.ano ?? "?"}, km ${dados.km ?? "?"}, preço ${dados.preco ?? "?"})`);
  const opcionais = (dados.opcionais ?? []).filter((o) => o.trim() !== "");
  if (opcionais.length > 0) {
    linhas.push(`Opcionais (${opcionais.length}, todos reais, lidos da página do carro):`, ...opcionais.map((o) => `- ${o}`));
  } else {
    faltando.push("opcionais");
  }
  if (faltando.length > 0) {
    linhas.push(`NÃO informado na ficha (não existe para você, não mencione nem suponha): ${faltando.join(", ")}.`);
  }
  const loja = dados.descricaoRevenda?.trim();
  if (loja) {
    linhas.push(
      "",
      "Texto livre da loja (FONTE, NUNCA FATO). Leia só para entender o tom da loja. É propaganda",
      "padrão, igual para vários carros: NÃO repita nenhuma frase ou promessa daqui (garantia,",
      "laudo, procedência, aceita entrada, financiamento, endereço). Se copiar, o texto é recusado:",
      `"""${loja}"""`,
    );
  }
  return linhas;
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
    ...REGRAS_DE_TEXTO_HUMANO,
    "",
    "USE OS OPCIONAIS COMO MATÉRIA-PRIMA: a lista de opcionais é o que o carro TEM de verdade.",
    "Escolha 3 a 5 que mais pesam para quem compra (conforto, segurança, tecnologia que se nota),",
    "agrupe-os numa frase curta e NÃO liste todos. Use o nome como está na lista.",
    "O texto livre da loja é FONTE, não fato: serve para entender o tom, nunca para afirmar nada.",
    "Texto fora dessas regras é recusado e você terá que reescrever.",
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
    ...formatarFicha(pedido.dados),
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
