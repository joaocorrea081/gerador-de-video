// Cardápio fechado COM nomes legíveis, para o painel montar os botões sem
// nada cravado na tela. As listas de ids vêm de tipos.ts (fonte única).
import {
  CORES_ESCOLHA,
  ENQUADRAMENTOS_ESCOLHA,
  FUNDOS_ESCOLHA,
  MODELOS_ESCOLHA,
  RITMOS_ESCOLHA,
  type CardapioCompleto,
  type CorEscolha,
  type EnquadramentoEscolha,
  type FundoEscolha,
  type ModeloEscolha,
  type RitmoEscolha,
} from "./tipos.js";

export interface OpcaoCardapio<T extends string> {
  id: T;
  nome: string;
}

export interface CardapioDisponivel {
  enquadramentos: OpcaoCardapio<EnquadramentoEscolha>[];
  modelos: OpcaoCardapio<ModeloEscolha>[];
  cores: OpcaoCardapio<CorEscolha>[];
  fundos: OpcaoCardapio<FundoEscolha>[];
  ritmos: OpcaoCardapio<RitmoEscolha>[];
}

const NOMES: Record<string, string> = {
  cheia: "Foto cheia",
  nitida: "Foto nítida",
  institucional: "Institucional",
  energico: "Enérgico",
  numeros: "Números",
  editorial: "Editorial",
  ambar: "Âmbar",
  azul: "Azul",
  verde: "Verde",
  vermelho: "Vermelho",
  roxo: "Roxo",
  grafite: "Grafite",
  automatica: "Automática (da foto)",
  claro: "Claro",
  escuro: "Escuro",
  gradiente: "Gradiente",
  rapido: "Rápido",
  calmo: "Calmo",
};

function opcoes<T extends string>(ids: readonly T[]): OpcaoCardapio<T>[] {
  return ids.map((id) => ({ id, nome: NOMES[id] ?? id }));
}

/** Padrão quando o vídeo não guarda a escolha (vídeo antigo). */
export const PADRAO_CARDAPIO: CardapioCompleto = {
  fundo: "claro",
  ritmo: "calmo",
  enquadramento: "nitida",
  modelo: "institucional",
  cor: "ambar",
  ordemFotos: [],
};

/** Lista completa do cardápio, com nome legível de cada opção. */
export function listarCardapio(): CardapioDisponivel {
  return {
    enquadramentos: opcoes(ENQUADRAMENTOS_ESCOLHA),
    modelos: opcoes(MODELOS_ESCOLHA),
    cores: opcoes(CORES_ESCOLHA),
    fundos: opcoes(FUNDOS_ESCOLHA),
    ritmos: opcoes(RITMOS_ESCOLHA),
  };
}
