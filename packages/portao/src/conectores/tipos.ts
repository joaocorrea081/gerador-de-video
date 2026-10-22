// Contrato de um conector de rede social. É DADO: a tela de Contas, a de Prontidão e a lista de ativar/desativar
// se montam a partir dele, sem nome de rede escrito em lugar nenhum (mesmo espírito do PROVEDORES da IA).
// Para acrescentar uma rede: um arquivo novo em conectores/redes/ que faz `export default` de um Conector.
// Nenhum outro arquivo muda.

import type { Idioma } from "../idioma/index.js";

/** Texto da tela. Texto simples vale para todos; o mapa escolhe pelo idioma e cai para inglês; a função lê o catálogo do painel. */
export type Texto = string | Partial<Record<Idioma, string>> | (() => string);

/** Um campo que a pessoa preenche para conectar a conta. Segredo nunca volta para a tela. */
export interface CampoCredencial {
  /** Nome do campo no corpo da requisição (accessToken, contaId...). */
  id: string;
  rotulo: Texto;
  ajuda?: Texto;
  tipo: "texto" | "segredo" | "data_hora" | "lista";
  obrigatorio: boolean;
  /** Valor sugerido (a lista de escopos, por exemplo). */
  sugestao?: string;
}

/** O que a plataforma exige antes de deixar publicar em público, e quanto isso costuma demorar. */
export interface AprovacaoPlataforma {
  /** Nome da etapa, como aparece na linha da conta. */
  rotulo: Texto;
  /** A frase do item na lista de prontidão ("Auditoria do TikTok aprovada"). */
  item: Texto;
  /** Quando falta: o que fazer. */
  falta: Texto;
  /** Uma linha: o que ainda falta e em quanto tempo. É o que a tela de Prontidão mostra primeiro. */
  resumo: Texto;
  /** O texto completo do prazo real. */
  prazo: Texto;
}

export interface VariavelDeAmbiente {
  /** Todas precisam estar definidas. */
  variaveis: readonly string[];
  descricao: Texto;
  /** Quando faltar, o que fazer. */
  falta: Texto;
}

export interface Conector {
  /** Estável. Minúsculas, números e "_". É o valor gravado nas contas e nos ajustes. */
  id: string;
  nome: string;
  /** Posição na lista (menor primeiro). Padrão 100. */
  ordem?: number;
  /** Conector de demonstração: a tela marca como exemplo. */
  exemplo?: boolean;
  /** Ligado quando ninguém escolheu. */
  ativoPadrao: boolean;
  /**
   * Verdadeiro quando o motor de fila do núcleo sabe agendar e publicar nesta rede (o id é um dos tipos `Rede` do núcleo).
   * Falso: a rede aparece em Contas, Prontidão e Configurações, mas não nas listas de agendar, até o núcleo aprender o id.
   */
  fila: boolean;
  /** Como a conta pode ser conectada. */
  modos: readonly ("real" | "seco")[];
  campos: readonly CampoCredencial[];
  /** Permissões que o app precisa ter recebido. */
  escopos: readonly string[];
  /** A rede exige o vídeo em endereço público (o servidor da rede baixa o arquivo). */
  precisaUrlPublica: boolean;
  /** Variáveis de ambiente de que o conector depende (segredo do app). Só o nome; o valor nunca vai para a tela. */
  ambiente?: readonly VariavelDeAmbiente[];
  aprovacao: AprovacaoPlataforma;
  limites: {
    legenda?: number;
    hashtags?: number;
    /** Publicações por 24 h quando a rede tem um número fixo. */
    diario?: number;
  };
  /** Regras de mídia, em linguagem de gente. Só leitura: a validação do arquivo é do núcleo. */
  midia: readonly Texto[];
}
