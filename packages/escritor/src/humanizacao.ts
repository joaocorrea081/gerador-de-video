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
  /**
   * false = o texto do VÍDEO pode ter dígito. Padrão: ligado (recusa número
   * que não faça parte do nome do carro). Ver `acharNumerosInventados`.
   */
  recusarNumeros?: boolean;
}

/** Variável de ambiente para desligar a recusa: ESCRITOR_RECUSAR_TIQUES=0. */
export const VARIAVEL_RECUSAR_TIQUES = "ESCRITOR_RECUSAR_TIQUES";

/** Variável de ambiente para liberar dígitos no texto do vídeo: ESCRITOR_RECUSAR_NUMEROS=0. */
export const VARIAVEL_RECUSAR_NUMEROS = "ESCRITOR_RECUSAR_NUMEROS";

const DESLIGADO = (v: string | undefined) => {
  const valor = v?.trim().toLowerCase();
  return valor === "0" || valor === "false" || valor === "nao" || valor === "off";
};

export function lerOpcoesHumanizacao(
  env: Record<string, string | undefined> = process.env,
): OpcoesHumanizacao {
  return {
    recusarTiques: !DESLIGADO(env[VARIAVEL_RECUSAR_TIQUES]),
    recusarNumeros: !DESLIGADO(env[VARIAVEL_RECUSAR_NUMEROS]),
  };
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
    "ver de perto",
    "ver de pertinho",
    "ver o carro de perto",
    "ver ele de perto",
    "vir ver de perto",
    "veja de perto",
    "veja de pertinho",
    "veja o carro de perto",
    "veja o carro de pertinho",
    "veja ele de perto",
    "veja ele de pertinho",
    "veja pessoalmente",
    "veja ao vivo",
    "venha ver o carro de pertinho",
    "venha ver pessoalmente",
    "venha ver ao vivo",
    "vem ver de perto",
    "vem conferir",
    "confira de perto",
    "confira de pertinho",
    "confira o carro de perto",
    "confira ele de perto",
    "confira pessoalmente",
    "conferir de pertinho",
    "conferir o carro de perto",
    "conferir ele de perto",
    "conferir pessoalmente",
    "vir conferir",
    "ver pessoalmente",
    "ver ao vivo",
    "ver o carro de pertinho",
    "ver ele de pertinho",
    "vir ver o carro",
    "venha conhecer",
    "venha conhecer de perto",
    "conheca de perto",
    "conhecer de perto",
    "venha sentir",
    "venha fazer um test drive",
    "venha fazer um test-drive",
    "agende uma visita",
    "agende seu test drive",
    "agende sua visita",
    "faca uma visita",
    "sair dirigindo",
    "estao te esperando",
    "estao esperando por voce",
    "garanta o seu hoje",
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

// Token numérico: uma palavra que contém dígito, com ponto/vírgula/hífen/barra
// no meio ("2.0", "16V", "C4", "41.900", "92.991", "208", "2010"). "R$41.900"
// vira o token "41.900" porque "$" quebra a palavra.
const TOKEN_NUMERICO = /[\p{L}\p{N}]*\d[\p{L}\p{N}]*(?:[.,\-/][\p{L}\p{N}]+)*/gu;

function tokensNumericos(texto: string): string[] {
  return (normalizar(texto).match(TOKEN_NUMERICO) ?? []);
}

/**
 * Acha número escrito em prosa que NÃO faz parte do nome do carro.
 *
 * Por que recusar: preço, ano e km vêm do dado lido e o sistema põe na tela.
 * Número em frase livre é número que o modelo pode errar ou inventar, e
 * "modelo que inventa preço em anúncio de carro é propaganda enganosa".
 *
 * Como separa "inventado" de "nome do carro": só passa o token numérico que
 * aparece LITERALMENTE em marca/modelo/opcionais da ficha ("Astra 2.0" com modelo
 * "Astra 2.0"; "C4 Cactus", "208", "Compass 2.0 16V"). Qualquer outro é
 * recusado, até o ano e o km verdadeiros, porque o sistema já os mostra e
 * repetir em prosa só abre brecha para erro. A escolha por "lista do dado"
 * em vez de "padrão de preço/km" (R$, mil, km) é de propósito: padrão deixa
 * passar "92 mil rodados" ou "ano 2010"; a lista do dado não deixa nada.
 * Limite conhecido: número por extenso ("quarenta mil") não é pego.
 */
export function acharNumerosInventados(
  titulo: string,
  corpo: string,
  dados: { marca?: string; modelo?: string; opcionais?: string[]; revenda?: string } = {},
): string[] {
  // Número que já está no nome do carro, da loja ("Rota 66") ou num opcional real ("Câmera 360") é fato da ficha.
  const permitidos = new Set(
    tokensNumericos(`${dados.marca ?? ""} ${dados.modelo ?? ""} ${(dados.opcionais ?? []).join(" ")} ${dados.revenda ?? ""}`),
  );
  const achados = new Set<string>();
  for (const token of tokensNumericos(`${titulo}\n${corpo}`)) {
    const limpo = token.replace(/[.,\-/]+$/, "");
    if (!permitidos.has(limpo)) achados.add(limpo);
  }
  if (achados.size === 0) return [];
  const lista = [...achados].map((a) => `"${a}"`).join(", ");
  return [
    `número no texto (${lista}); preço, ano e quilometragem vêm do dado lido e são postos na tela pelo sistema, então escreva sem citar número (só o nome do modelo pode ter número)`,
  ];
}

// Palavras de PROMESSA que a loja costuma pôr no texto padrão. Se aparecem na
// descrição da loja e no anúncio, e a ficha estruturada não as sustenta
// (opcionais), o anúncio está repetindo propaganda como se fosse fato.
const PROMESSAS_DA_LOJA = [
  "garantia", "laudo", "cautelar", "procedencia", "financi", "aceitamos",
  "entrada no cartao", "vistoria", "transferencia", "documentacao", "revisado", "revisao",
  "unico dono", "troca", "taxa zero", "sem entrada",
];
/** Tamanho (em palavras) da sequência copiada da loja que já é recusada. */
export const PALAVRAS_COPIADAS_DA_LOJA = 5;

function palavrasNormalizadas(texto: string): string[] {
  return normalizar(texto).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

function janelas(palavras: string[], n: number): string[] {
  const r: string[] = [];
  for (let i = 0; i + n <= palavras.length; i++) r.push(palavras.slice(i, i + n).join(" "));
  return r;
}

/**
 * `descricaoRevenda` é FONTE, nunca FATO. Recusa o anúncio que (1) copia uma
 * sequência de 5+ palavras do texto da loja, ou (2) repete uma promessa
 * típica da loja (garantia, laudo, financiamento...) que a ficha estruturada
 * não sustenta. Sequências que também aparecem nos opcionais ou no nome do
 * carro não contam: citar "ar condicionado digital" é fato da ficha.
 * Limite conhecido: paráfrase da propaganda ("a procedência é garantida")
 * só é pega pelas palavras de promessa, não pela cópia.
 */
export function acharAfirmacoesDaLoja(
  titulo: string,
  corpo: string,
  dados: { marca?: string; modelo?: string; descricaoRevenda?: string; opcionais?: string[] } = {},
): string[] {
  const loja = dados.descricaoRevenda?.trim();
  if (!loja) return [];
  const motivos: string[] = [];
  const texto = palavrasNormalizadas(`${titulo}\n${corpo}`);
  const itensFicha = [dados.marca ?? "", dados.modelo ?? "", ...(dados.opcionais ?? [])]
    .map((i) => palavrasNormalizadas(i).join(" "))
    .filter(Boolean);
  const fichaTexto = palavrasNormalizadas(itensFicha.join(" "));
  // Trechos que são o nome do carro ou um opcional real viram "|": citar fato
  // da ficha nunca conta como cópia, e a cópia não atravessa o recorte.
  let mascarado = ` ${texto.join(" ")} `;
  for (const item of [...itensFicha].sort((x, y) => y.length - x.length)) {
    mascarado = mascarado.split(` ${item} `).join(" | ");
  }
  const segmentos = mascarado.split("|").map((x) => x.trim().split(" ").filter(Boolean));
  const daLoja = new Set(janelas(palavrasNormalizadas(loja), PALAVRAS_COPIADAS_DA_LOJA));
  const copiada = segmentos
    .flatMap((seg) => janelas(seg, PALAVRAS_COPIADAS_DA_LOJA))
    .find((j) => daLoja.has(j));
  if (copiada) {
    motivos.push(`copia o texto padrão da loja ("${copiada}..."); o texto da loja é propaganda, não fato do carro — escreva com as suas palavras, só com dados da ficha`);
  }

  const textoJunto = ` ${texto.join(" ")} `;
  const lojaJunto = ` ${palavrasNormalizadas(loja).join(" ")} `;
  const fichaJunto = ` ${fichaTexto.join(" ")} `;
  const repetidas = PROMESSAS_DA_LOJA.filter((p) => {
    const chave = ` ${p}`; // casa o começo da palavra: "financi" pega "financiamento"
    return textoJunto.includes(chave) && lojaJunto.includes(chave) && !fichaJunto.includes(chave);
  });
  if (repetidas.length > 0) {
    motivos.push(`promessa da loja repetida como fato (${repetidas.map((r) => `"${r}"`).join(", ")}); isso vem do texto padrão da loja e não está verificado na ficha — corte`);
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
  "- NÃO escreva número nenhum no título nem no corpo: preço, ano e quilometragem o sistema já põe na tela, e repetir em texto é recusado. O único número permitido é o que faz parte do nome do modelo (\"Astra 2.0\", \"C4 Cactus\", \"208\").",
  "- A ficha só tem o que foi passado. Campo que não veio (cor, opcionais, descrição) NÃO EXISTE: não suponha, não complete com o que \"carros assim costumam ter\".",
  "- Se a ficha não diz, NÃO INVENTE. Revisão, garantia, troca, financiamento, documentação, único dono, estado: só entram se estiverem na ficha. Ficha curta pede texto curto: duas frases verdadeiras valem mais que cinco inventadas.",
  "- Sem clichê de anúncio (\"oportunidade única\", \"imperdível\", \"não perca\", \"corra\", \"confira já\", \"venha conferir de perto\", \"saia dirigindo\", \"o carro dos seus sonhos\"). Estado do carro não se afirma, porque a ficha não tem campo de estado, revisão ou pneus: nada de \"excelente estado\", \"impecável\", \"perfeito\". Mostre o que o carro TEM com os opcionais reais da lista (\"equipado com teto panorâmico, câmera 360 e bancos de couro\").",
  "- Feche com um convite simples e concreto (ver o carro, combinar uma visita). Sem frase moralizante, sem \"jornada\", sem \"realize seu sonho\".",
];
