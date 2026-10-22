// Regras de texto humano para o anúncio. Valem para QUALQUER provedor de IA,
// porque vivem no prompt (prompt.ts) e neste validador, e não numa skill de
// agente.
//
// Fonte das regras gerais (abertura de garganta, exclamação em excesso,
// linguagem promocional, pergunta retórica de abertura, conclusão genérica):
// skill "unslop" (MIT), references/taboo-phrases.md e core-contract.md,
// instalada em .agents/skills/unslop. Só o que vale para texto curto de
// anúncio foi trazido; ver o relatório da etapa para o que ficou de fora.
//
// As listas de frases são POR IDIOMA. A lista do unslop é em inglês e não
// transfere para outra língua.

/** Ajuste da humanização. Padrão: ligada (recusa texto com tique de IA). */
export interface OpcoesHumanizacao {
  /**
   * false = desliga só a RECUSA. A instrução continua no prompt. Serve se um
   * idioma estiver dando falso positivo demais.
   */
  recusarTiques?: boolean;
}

/** Variável de ambiente para desligar a recusa: ESCRITOR_RECUSAR_TIQUES=0. */
export const VARIAVEL_RECUSAR_TIQUES = "ESCRITOR_RECUSAR_TIQUES";

export function lerOpcoesHumanizacao(
  env: Record<string, string | undefined> = process.env,
): OpcoesHumanizacao {
  const valor = env[VARIAVEL_RECUSAR_TIQUES]?.trim().toLowerCase();
  return { recusarTiques: !(valor === "0" || valor === "false" || valor === "nao" || valor === "off") };
}

/** Exclamações permitidas no texto inteiro (título + corpo). */
export const MAXIMO_EXCLAMACOES = 1;
/** Palavras por frase, acima disso a frase é recusada. Vale para todo idioma. */
export const MAXIMO_PALAVRAS_POR_FRASE = 30;

/**
 * Padrões por idioma, escritos em minúsculas e SEM acento (o texto é
 * normalizado do mesmo jeito antes de comparar). Cada item é um pedaço de
 * expressão regular.
 */
const PADROES_POR_IDIOMA: Record<string, readonly string[]> = {
  // Lista montada para clichê de anúncio de carro brasileiro. Precisa de
  // revisão do João: é a que mais pesa na qualidade do texto em português.
  pt: [
    "oportunidade unica",
    "oportunidade imperdivel",
    "imperdivel",
    "imperdiveis",
    "nao perca",
    "nao deixe passar",
    "confira ja",
    "corra",
    "garanta o seu",
    "garanta ja",
    "saia dirigindo",
    "saia daqui dirigindo",
    "venha conferir",
    "venha ver de perto",
    "conferir de perto",
    "sinta a diferenca",
    "o carro dos seus sonhos",
    "carro dos sonhos",
    "realize o seu sonho",
    "realize seu sonho",
    "seu proximo carro",
    "esta te esperando",
    "te espera",
    "espera por voce",
    "procurando um carro",
    "procurando o carro",
    "voce sabia",
    "ideal para quem busca",
    "ideal para quem procura",
    "mais do que um carro",
    "nao e apenas um carro",
    "nao e so um carro",
    "jornada",
    "preco imbativel",
    // superlativo vazio: diga o que o carro tem em vez do adjetivo
    "excelente estado",
    "otimo estado",
    "perfeito estado",
    "perfeitas condicoes",
    "impecavel",
  ],
  // Do unslop (promotional language, throat-clearing, generic conclusions),
  // mais clichês de anúncio de carro em inglês.
  en: [
    "world-class",
    "state-of-the-art",
    "second to none",
    "hidden gem",
    "breathtaking",
    "boasts a",
    "must-see",
    "here's the thing",
    "let's dive in",
    "the future looks bright",
    "don't miss",
    "do not miss",
    "won't last",
    "look no further",
    "dream car",
    "drive away",
    "come see",
    "are you looking for",
    "did you know",
    "once-in-a-lifetime",
    "unbeatable",
    "journey",
    "pristine condition",
    "excellent condition",
    "immaculate",
    "perfect condition",
  ],
  // ROMENO: lista vazia DE PROPÓSITO. Não sabemos o que soa clichê em romeno.
  // PRECISA de revisão de quem fala a língua antes de preencher. Enquanto
  // isso valem só as regras que não dependem de idioma.
  ro: [],
  // RUSSO: idem romeno. Lista vazia até revisão de falante nativo.
  ru: [],
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const REGEX_POR_IDIOMA = new Map<string, RegExp>();

function regexDoIdioma(codigo: string): RegExp | undefined {
  const padroes = PADROES_POR_IDIOMA[codigo];
  if (!padroes || padroes.length === 0) return undefined;
  let regex = REGEX_POR_IDIOMA.get(codigo);
  if (!regex) {
    const corpo = padroes.map(escaparRegex).join("|");
    regex = new RegExp(`(?<![a-z0-9])(?:${corpo})(?![a-z0-9])`, "g");
    REGEX_POR_IDIOMA.set(codigo, regex);
  }
  return regex;
}

/** "pt-BR" -> "pt". Idioma ausente ou desconhecido -> só regras sem idioma. */
function codigoDoIdioma(idioma: string | undefined): string | undefined {
  return idioma?.trim().toLowerCase().split(/[-_]/)[0] || undefined;
}

export function separarFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function contar(texto: string, caractere: string): number {
  return texto.split(caractere).length - 1;
}

/**
 * Procura tiques de IA no texto do anúncio. Devolve uma lista de motivos
 * (vazia = texto limpo). Cada motivo diz o que fazer, porque vai direto para
 * o pedido da próxima tentativa.
 */
export function acharTiquesDeIA(titulo: string, corpo: string, idioma?: string): string[] {
  const motivos: string[] = [];
  const completo = `${titulo}\n${corpo}`;

  const exclamacoes = contar(completo, "!");
  if (exclamacoes > MAXIMO_EXCLAMACOES) {
    motivos.push(
      `${exclamacoes} exclamações no texto; o máximo é ${MAXIMO_EXCLAMACOES}, e o melhor é nenhuma — troque por ponto`,
    );
  }

  const primeiras = [titulo, separarFrases(corpo)[0] ?? ""];
  if (primeiras.some((f) => /[?？]\s*$/.test(f.trim()))) {
    motivos.push(
      "abre com pergunta; comece direto por um fato do carro, sem pergunta retórica",
    );
  }

  for (const frase of separarFrases(completo)) {
    const palavras = frase.split(/\s+/).filter(Boolean).length;
    if (palavras > MAXIMO_PALAVRAS_POR_FRASE) {
      motivos.push(
        `frase com ${palavras} palavras (máximo ${MAXIMO_PALAVRAS_POR_FRASE}); quebre em frases curtas`,
      );
      break;
    }
  }

  const codigo = codigoDoIdioma(idioma);
  const regex = codigo ? regexDoIdioma(codigo) : undefined;
  if (regex) {
    const achadas = new Set<string>();
    for (const m of normalizar(completo).matchAll(regex)) achadas.add(m[0]);
    if (achadas.size > 0) {
      const lista = [...achadas].map((a) => `"${a}"`).join(", ");
      motivos.push(
        `expressão de anúncio genérico (${lista}); diga o que o carro TEM, usando só dados da ficha, ou corte a frase`,
      );
    }
  }

  return motivos;
}

/**
 * Regras de escrita do anúncio, em instrução positiva. É este bloco que vai
 * no prompt de TODO provedor (texto do vídeo e legendas). Enxuto de
 * propósito: vai em toda chamada. O validador acima confere o que dá para
 * conferir por código.
 */
export const REGRAS_DE_TEXTO_HUMANO: readonly string[] = [
  "COMO ESCREVER (vale em qualquer idioma):",
  "- Comece direto por um fato do carro. Nada de abertura de garganta (\"Procurando um carro que...\", \"Você sabia que...\") e nada de pergunta no começo.",
  `- No máximo ${MAXIMO_EXCLAMACOES} exclamação no texto inteiro; o melhor é nenhuma. Frases curtas, até ${MAXIMO_PALAVRAS_POR_FRASE} palavras.`,
  "- O que o carro TEM vale mais que adjetivo. Se a ficha diz único dono, revisões na concessionária, pneus novos: diga isso, com as palavras da ficha.",
  "- Se a ficha não diz, NÃO INVENTE. Revisão, garantia, troca, financiamento, documentação, único dono, estado: só entram se estiverem na ficha. Ficha curta pede texto curto: duas frases verdadeiras valem mais que cinco inventadas.",
  "- Sem clichê de anúncio (\"oportunidade única\", \"imperdível\", \"não perca\", \"corra\", \"confira já\", \"venha conferir de perto\", \"saia dirigindo\", \"o carro dos seus sonhos\"). Sem elogio vazio (\"excelente estado\", \"impecável\", \"perfeito\") a menos que diga por quê.",
  "- Feche com um convite simples e concreto (ver o carro, combinar uma visita). Sem frase moralizante, sem \"jornada\", sem \"realize seu sonho\".",
];
