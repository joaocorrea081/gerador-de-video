// Provedor falso para teste: nunca faz chamada de rede, nunca gasta crédito.

import type { PedidoProvedor, Provedor, RespostaProvedor } from "../provedor.js";

/**
 * Devolve, em ordem, as respostas de `fila` (repete a última se a fila
 * acabar antes das tentativas). Guarda cada pedido recebido em `pedidos`
 * para o teste poder inspecionar o que foi enviado (ex.: se o erro da
 * tentativa anterior foi reinjetado).
 */
export class ProvedorFalso implements Provedor {
  public readonly pedidos: PedidoProvedor[] = [];
  private indice = 0;

  constructor(private readonly fila: readonly string[]) {}

  async gerar(pedido: PedidoProvedor): Promise<RespostaProvedor> {
    this.pedidos.push(pedido);
    const textoCru = this.fila[Math.min(this.indice, this.fila.length - 1)] ?? "";
    this.indice++;
    return { textoCru, tokensEntrada: 10, tokensSaida: 10 };
  }
}
