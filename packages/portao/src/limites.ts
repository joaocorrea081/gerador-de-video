// O limite de tempo de um render é do montador (a fila o aplica); a tela usa o MESMO número para dizer "travado".
import { TIMEOUT_JOB_MS } from "@gerador/montador";
import type { ProgressoFila } from "@gerador/core";

export { TIMEOUT_JOB_MS };

/** Job em execução há mais tempo que o próprio limite: ninguém o está tocando mais (o processo morreu). */
export function jobTravado(emExecucao: ProgressoFila["emExecucao"]): boolean {
  return emExecucao !== null && emExecucao.haSegundos * 1000 > TIMEOUT_JOB_MS;
}
