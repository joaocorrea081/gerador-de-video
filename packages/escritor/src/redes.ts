// Regras de escrita de legenda POR REDE. Cada rede é um bloco independente em
// REGRAS_POR_REDE: acrescentar uma rede nova é acrescentar um bloco, sem
// editar os outros. A regra da rede diz FORMATO e tom; a de humanizar
// (humanizacao.ts) diz o que NÃO pode aparecer. A legenda tem que passar nas
// duas, e o motivo da recusa diz qual falhou.
//
// De onde vêm os números (ver também o relatório da etapa):
// - 125 caracteres no Instagram: guia amplamente repetido de onde o feed
//   corta antes do "mais" (bitly.com/blog/instagram-character-limit, FAU
//   public-affairs). NÃO é regra documentada pela Meta; varia por aparelho.
// - 5 a 10 hashtags no Instagram: mesmo guia do Bitly. O teto duro de 30 e o
//   limite de 2200 caracteres já estão em @gerador/core (LIMITE_LEGENDA).
// - TikTok 2200 caracteres: searchengineland.com (set/2022). Já é o limite
//   do core. O "curta" do TikTok é regra de voz minha, sem número de caractere.
// - Facebook: não achei fonte confiável de corte nem de eficácia de hashtag.
//   Sem número de caractere novo; contagem de frases e hashtags é regra de
//   voz minha, a confirmar com o cliente.
// - "Gancho imediato" no TikTok: skill ai-social-media-content ("Hook
//   immediately"). O resto dessa skill é geração de mídia com IA e foi
//   descartado (proibido neste projeto).

import type { Rede } from "@gerador/core";
import {
  acharTiquesDeIA, REGRAS_DE_TEXTO_HUMANO, separarFrases, type OpcoesHumanizacao,
} from "./humanizacao.js";

export interface RegraRede {
  nome: string;
  /** Instruções positivas para o prompt. */
  instrucoes: readonly string[];
  /** Motivos de recusa pela regra desta rede (vazio = passou). */
  validar(texto: string, hashtags: readonly string[]): string[];
}

/** Onde o feed do Instagram costuma cortar antes do "mais" (guia, não regra da Meta). */
export const CORTE_GANCHO_INSTAGRAM = 125;

export const REGRAS_POR_REDE: Record<Rede, RegraRede> = {
  instagram: {
    nome: "Instagram Reels",
    instrucoes: [
      `Instagram: o gancho (o fato mais forte do carro) vai na PRIMEIRA frase, que tem de caber em ${CORTE_GANCHO_INSTAGRAM} caracteres, porque o resto fica escondido atrás do "mais".`,
      "Depois do gancho, 2 a 3 frases curtas com o que o carro tem e um convite simples. Hashtags no fim, de 3 a 8, do tema carro e da cidade/modelo, sem número.",
    ],
    validar(texto, hashtags) {
      const m: string[] = [];
      const primeira = separarFrases(texto)[0] ?? "";
      if ([...primeira].length > CORTE_GANCHO_INSTAGRAM) {
        m.push(`primeira frase com ${[...primeira].length} caracteres; o gancho precisa caber em ${CORTE_GANCHO_INSTAGRAM}, antes do "mais"`);
      }
      if (hashtags.length > 10) m.push(`${hashtags.length} hashtags; use no máximo 10 (de 3 a 8 é o ideal)`);
      return m;
    },
  },
  tiktok: {
    nome: "TikTok",
    instrucoes: [
      "TikTok: legenda curta. Gancho imediato na primeira frase, no máximo 2 frases no total, tom direto e informal.",
      "Hashtags fazem parte da descoberta: de 3 a 5, do tema carro, sem número.",
    ],
    validar(texto, hashtags) {
      const m: string[] = [];
      const frases = separarFrases(texto).length;
      if (frases > 2) m.push(`${frases} frases; a legenda do TikTok é curta, no máximo 2`);
      if (hashtags.length < 1) m.push("sem hashtag; no TikTok a hashtag ajuda a descoberta, use de 3 a 5");
      if (hashtags.length > 5) m.push(`${hashtags.length} hashtags; use no máximo 5`);
      return m;
    },
  },
  facebook: {
    nome: "Facebook",
    instrucoes: [
      "Facebook: texto mais explicativo, de 3 a 5 frases completas, tom de conversa de balcão. Pode contar mais do que o carro tem, sempre dentro da ficha.",
      "Hashtag rende pouco aqui: no máximo 2, ou nenhuma.",
    ],
    validar(texto, hashtags) {
      const m: string[] = [];
      const frases = separarFrases(texto).length;
      if (frases < 2) m.push(`${frases} frase; no Facebook explique mais, de 3 a 5 frases`);
      if (hashtags.length > 2) m.push(`${hashtags.length} hashtags; no Facebook use no máximo 2`);
      return m;
    },
  },
};

/**
 * Prompt de sistema das legendas: regras comuns + humanizar + um bloco por
 * rede. Os provedores recebem exatamente o mesmo texto.
 */
export function montarSistemaLegendas(redes: readonly Rede[] = Object.keys(REGRAS_POR_REDE) as Rede[]): string {
  return [
    "Você escreve legendas de redes sociais para o vídeo curto de um carro de revenda.",
    "Escreva uma legenda por rede, cada uma seguindo a regra DA SUA REDE. Elas têm de sair diferentes entre si.",
    "NÃO escreva nenhum número ou dígito (preço, ano, quilometragem, telefone): esses dados são anexados por outro sistema.",
    "Hashtags: só letras e sublinhado, sem dígitos, cada uma começando com #.",
    "",
    ...REGRAS_DE_TEXTO_HUMANO,
    "",
    "REGRAS POR REDE:",
    ...redes.flatMap((r) => REGRAS_POR_REDE[r].instrucoes),
    "",
    "Legenda fora da regra da rede ou da regra de como escrever é recusada e você terá que reescrever.",
  ].join("\n");
}

/**
 * Confere a legenda de uma rede nas DUAS regras. Cada motivo diz qual falhou:
 * "[regra do TikTok]" ou "[como escrever]". Vazio = passou.
 */
export function validarLegendaRede(
  rede: Rede, texto: string, hashtags: readonly string[], idioma?: string, humanizacao: OpcoesHumanizacao = {},
): string[] {
  const regra = REGRAS_POR_REDE[rede];
  const motivos = regra.validar(texto, hashtags).map((x) => `[regra do ${regra.nome}] ${x}`);
  if (humanizacao.recusarTiques !== false) {
    motivos.push(...acharTiquesDeIA("", texto, idioma).map((x) => `[como escrever] ${x}`));
  }
  return motivos;
}
