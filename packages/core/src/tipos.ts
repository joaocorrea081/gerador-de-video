// Tipos de domínio compartilhados por todos os pacotes.
// Vocabulário em português porque é o domínio do negócio (ver REGRAS-DE-NEGOCIO.md).

/** Estado de um vídeo, do começo ao fim do fluxo de aprovação. */
export type EstadoVideo =
  | "rascunho"
  | "renderizando"
  | "aguardando_aprovacao"
  | "aprovado"
  | "rejeitado"
  | "publicado"
  | "erro";

export const ESTADOS_VIDEO: readonly EstadoVideo[] = [
  "rascunho",
  "renderizando",
  "aguardando_aprovacao",
  "aprovado",
  "rejeitado",
  "publicado",
  "erro",
];

/** Estado de um job na fila de render (packages/montador). */
export type EstadoJob = "pendente" | "em_execucao" | "concluido" | "falhou";

export const ESTADOS_JOB: readonly EstadoJob[] = [
  "pendente",
  "em_execucao",
  "concluido",
  "falhou",
];

/** Motivo de rejeição: lista fechada, nunca texto livre (ver REGRAS-DE-NEGOCIO.md). */
export type MotivoRejeicao =
  | "foto_ruim"
  | "texto_errado"
  | "ritmo"
  | "dado_errado"
  | "fundo";

export const MOTIVOS_REJEICAO: readonly MotivoRejeicao[] = [
  "foto_ruim",
  "texto_errado",
  "ritmo",
  "dado_errado",
  "fundo",
];

export interface Produto {
  id: number;
  origemUrl: string;
  dadosJson: string;
  lidoEm: string;
}

export interface Foto {
  id: number;
  produtoId: number;
  url: string;
  largura: number | null;
  altura: number | null;
  caminhoLocal: string | null;
  ordem: number;
}

export interface Video {
  id: number;
  produtoId: number;
  estado: EstadoVideo;
  caminhoMp4: string | null;
  criadoEm: string;
  atualizadoEm: string;
  /** Título do anúncio, escrito pelo escritor (packages/escritor). Null até ele rodar. */
  titulo: string | null;
  /** Corpo do anúncio, escrito pelo escritor. Null até ele rodar. */
  corpo: string | null;
  /** Fundo escolhido do cardápio fechado. Null até ele rodar. */
  fundo: FundoEscolha | null;
  /** Ritmo escolhido do cardápio fechado. Null até ele rodar. */
  ritmo: RitmoEscolha | null;
  /** Ordem das fotos (índices), como JSON de number[]. Null até ele rodar. */
  ordemFotosJson: string | null;
}

export interface Job {
  id: number;
  videoId: number;
  estado: EstadoJob;
  tentativas: number;
  erro: string | null;
  criadoEm: string;
  iniciadoEm: string | null;
  terminadoEm: string | null;
}

export interface Rejeicao {
  id: number;
  videoId: number;
  motivo: MotivoRejeicao;
  observacao: string | null;
  criadoEm: string;
}

export interface Ajuste {
  chave: string;
  valor: string;
}

// --- Tipos do montador (packages/montador) ---
// Vocabulário em português porque é o cardápio exposto ao cliente (ver
// REGRAS-DE-NEGOCIO.md: "o Claude não desenha, ele escolhe de um cardápio").

/** Fundo da cena: única coisa de estilo que o cardápio permite variar. */
export type FundoEscolha = "claro" | "escuro" | "gradiente";

export const FUNDOS_ESCOLHA: readonly FundoEscolha[] = ["claro", "escuro", "gradiente"];

/** Ritmo do vídeo: quão rápido o pan/zoom e a duração total andam. */
export type RitmoEscolha = "rapido" | "calmo";

export const RITMOS_ESCOLHA: readonly RitmoEscolha[] = ["rapido", "calmo"];

/**
 * Ficha do veículo que aparece na faixa de texto. Vem do dado lido
 * (packages/leitor), nunca inventado pelo componente de vídeo. Campo
 * ausente é `undefined` e renderiza vazio — nunca um placeholder.
 */
export interface DadosVeiculo {
  marca?: string;
  modelo?: string;
  ano?: number;
  km?: number;
  preco?: number;
  revenda?: string;
}

/**
 * Uma foto real do estoque (nunca gerada por IA — ver REGRAS-DE-NEGOCIO.md).
 * `caminho` é um caminho absoluto no disco; largura/altura são as dimensões
 * nativas, usadas para nunca ampliar a foto nítida acima de 1,0x.
 */
export interface FotoCarro {
  caminho: string;
  largura: number;
  altura: number;
}

/** Enquadramento da foto: "cheia" recorta e amplia (até 1,45x); "nitida" mostra a foto inteira (até 1,08x). */
export type EnquadramentoEscolha = "cheia" | "nitida";

export const ENQUADRAMENTOS_ESCOLHA: readonly EnquadramentoEscolha[] = ["cheia", "nitida"];

/**
 * Modelo de vídeo: o jeito como a informação entra e se move. Cardápio fechado,
 * o visual de cada um está fixo em código (packages/montador/src/modelos.ts).
 */
export type ModeloEscolha = "institucional" | "energico" | "numeros" | "editorial";

export const MODELOS_ESCOLHA: readonly ModeloEscolha[] = [
  "institucional",
  "energico",
  "numeros",
  "editorial",
];

/** Cores de destaque nomeadas. Paleta fechada: não existe campo livre de cor. */
export type CorDestaque = "ambar" | "azul" | "verde" | "vermelho" | "roxo" | "grafite";

export const CORES_DESTAQUE: readonly CorDestaque[] = [
  "ambar",
  "azul",
  "verde",
  "vermelho",
  "roxo",
  "grafite",
];

/** Cor escolhida: uma da paleta, ou "automatica" (derivada da foto do carro). */
export type CorEscolha = CorDestaque | "automatica";

export const CORES_ESCOLHA: readonly CorEscolha[] = [...CORES_DESTAQUE, "automatica"];

/**
 * O cardápio fechado. `fundo` e `ritmo` são obrigatórios (já existiam);
 * o resto é opcional para não quebrar quem só conhece as duas escolhas
 * antigas. Ausente = padrão do montador (nitida, institucional, ambar).
 * Ordem das fotos: índices das fotos que existem.
 */
export interface CardapioVideo {
  fundo: FundoEscolha;
  ritmo: RitmoEscolha;
  enquadramento?: EnquadramentoEscolha;
  modelo?: ModeloEscolha;
  cor?: CorEscolha;
  ordemFotos?: number[];
}

/** Escolha com todas as dimensões preenchidas (entrada/saída da regeneração). */
export type CardapioCompleto = Required<CardapioVideo>;

/**
 * Props completas e tipadas do componente de vídeo. Zero dado embutido.
 * A intersecção com `Record<string, unknown>` é só para satisfazer a
 * restrição genérica de `Composition`/`renderMedia` do Remotion — os três
 * campos abaixo continuam totalmente tipados.
 */
export interface AnuncioEscrito {
  titulo?: string | undefined;
  corpo?: string | undefined;
}

export type VideoCarroProps = {
  dados: DadosVeiculo;
  fotos: FotoCarro[];
  cardapio: CardapioVideo;
  /** Texto escrito (IA ou edição manual). Opcional: sem ele, o vídeo usa marca+modelo. */
  anuncio?: AnuncioEscrito;
} & Record<string, unknown>;
