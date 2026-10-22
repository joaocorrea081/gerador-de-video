// Motor genérico do leitor: orquestra robots.txt, ritmo, navegador e
// adaptador. Não sabe nada de seletor CSS ou JSON-LD — isso vive só no
// adaptador (adaptadores/autocerto.ts). Outro site = outro adaptador, este
// arquivo não muda.

import type { Adaptador, FichaLida } from "./adaptador.js";
import type { Navegador } from "./navegador.js";
import { buscarRobots, podeBuscar, type Robots } from "./robots.js";
import { Ritmo, INTERVALO_PADRAO_MS } from "./ritmo.js";

export class CaminhoProibidoError extends Error {
  constructor(url: string) {
    super(`robots.txt proíbe buscar: ${url}`);
  }
}

export interface OpcoesLeitor {
  intervaloMs?: number;
}

export interface VeiculoLido {
  url: string;
  ficha: FichaLida;
}

export class Leitor {
  private readonly ritmo: Ritmo;
  /** robots.txt por origem: o mesmo Leitor pode atender mais de um site. */
  private readonly robots = new Map<string, Robots>();

  constructor(
    private readonly adaptador: Adaptador,
    private readonly navegador: Navegador,
    opcoes: OpcoesLeitor = {},
  ) {
    this.ritmo = new Ritmo(opcoes.intervaloMs ?? INTERVALO_PADRAO_MS);
  }

  private async garantirPermissao(url: string): Promise<void> {
    const origem = new URL(url).origin;
    let robots = this.robots.get(origem);
    if (!robots) {
      robots = await buscarRobots(url);
      this.robots.set(origem, robots);
    }
    const caminho = new URL(url).pathname;
    if (!podeBuscar(robots, caminho)) {
      throw new CaminhoProibidoError(url);
    }
  }

  /** Lê a listagem e devolve as URLs de detalhe de cada carro. */
  async lerListagem(baseUrl: string): Promise<string[]> {
    const urlListagem = this.adaptador.urlListagem(baseUrl);
    await this.garantirPermissao(urlListagem);
    await this.ritmo.esperar();
    const html = await this.navegador.abrirERolar(urlListagem);
    return this.adaptador.extrairUrlsDetalhe(html, baseUrl);
  }

  /** Lê a página de detalhe de um carro e devolve a ficha + URLs de foto. */
  async lerDetalhe(url: string): Promise<VeiculoLido> {
    await this.garantirPermissao(url);
    await this.ritmo.esperar();
    const html = await this.navegador.abrirERolar(url);
    return { url, ficha: this.adaptador.extrairFicha(html, url) };
  }

  /** Lê a listagem e, em seguida, até `limite` carros de detalhe. */
  async lerEstoque(baseUrl: string, limite: number): Promise<VeiculoLido[]> {
    const urls = await this.lerListagem(baseUrl);
    const resultado: VeiculoLido[] = [];
    for (const url of urls.slice(0, limite)) {
      resultado.push(await this.lerDetalhe(url));
    }
    return resultado;
  }
}
