// Dados que TODA tela mostra na casca (freio de mão, alerta de carro vendido) e que não pertencem a nenhuma tela.
// O servidor lê do banco uma vez por requisição e roda a tela dentro deste contexto; a casca lê daqui.
// Fora de uma requisição (teste que monta a página direto) o contexto é o vazio: sem pausa, sem alerta.
import { AsyncLocalStorage } from "node:async_hooks";
import { REDES, type AlertaEstoque, type EstadoPausa, type Rede } from "@gerador/core";

export interface ContextoTela {
  pausa: EstadoPausa;
  /** Alertas de carro que saiu do site e que a pessoa ainda não resolveu. */
  alertas: AlertaEstoque[];
  /** As redes que o motor de fila sabe publicar e que estão ligadas (conectores). As listas de agendar usam isto. */
  redesAtivas: Rede[];
}

export const PAUSA_LIVRE: EstadoPausa = { pausado: false, por: null, motivo: null, em: null, retomadoPor: null, retomadoEm: null };

const armazem = new AsyncLocalStorage<ContextoTela>();

export function comContextoTela<T>(contexto: ContextoTela, fn: () => T): T {
  return armazem.run(contexto, fn);
}

export function contextoTela(): ContextoTela {
  return armazem.getStore() ?? { pausa: PAUSA_LIVRE, alertas: [], redesAtivas: [...REDES] };
}
