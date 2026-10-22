import type { ModeloEscolha } from "@gerador/core";
import { MODELOS } from "./modelos.js";

// Quando cada tag entra e sai (em segundos). Puro, testável.
// Os valores das tags vêm do DADO LIDO (ver Sobreposicoes.tsx); aqui só há tempo.
export const ABERTURA_SEGUNDOS = 2.6;
export const FECHAMENTO_SEGUNDOS = 4.6;
export const CORPO_SEGUNDOS = 6.4;

export interface JanelaTag {
  entra: number;
  sai: number;
}

export interface Cronograma {
  aberturaFim: number;
  fechamentoInicio: number;
  corpoInicio: number;
  corpoFim: number;
  tags: JanelaTag[];
}

/**
 * Distribui `quantidade` tags entre o fim da abertura e o começo do corpo
 * (ou do fechamento, se não houver corpo). Cada tag fica ~80% do seu slot.
 */
export function montarCronograma(
  duracaoSegundos: number,
  quantidade: number,
  temCorpo: boolean,
  ritmo: "rapido" | "calmo",
  modelo: ModeloEscolha = "institucional",
): Cronograma {
  const m = MODELOS[modelo].tag;
  const fechamentoInicio = duracaoSegundos - FECHAMENTO_SEGUNDOS;
  const corpoFim = fechamentoInicio;
  const corpoInicio = temCorpo ? corpoFim - CORPO_SEGUNDOS : fechamentoInicio;
  const inicio = ABERTURA_SEGUNDOS + 0.2;
  const fim = corpoInicio - 0.3;
  const slot = quantidade > 0 ? (fim - inicio) / quantidade : 0;
  const fracao = m.fracao[ritmo];
  // `sai` é quando a saída COMEÇA; ela dura m.saida. Garante que a tag termine
  // de sair antes da próxima entrar (uma de cada vez, nunca duas na tela).
  const tags: JanelaTag[] = Array.from({ length: quantidade }, (_, i) => {
    const entra = inicio + i * slot;
    const permanencia = Math.min(slot * fracao, m.maxSegundos, slot - m.saida);
    return { entra, sai: entra + Math.max(m.entrada, permanencia) };
  });
  return { aberturaFim: ABERTURA_SEGUNDOS, fechamentoInicio, corpoInicio, corpoFim, tags };
}
