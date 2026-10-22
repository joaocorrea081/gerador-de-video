// Controla o intervalo mínimo entre requisições — "comportar-se como gente"
// (INFRA.md). Padrão >= 2s, configurável.

export const INTERVALO_PADRAO_MS = 2000;

export class Ritmo {
  private ultimaVez: number | undefined;

  constructor(private readonly intervaloMs: number = INTERVALO_PADRAO_MS) {}

  /** Espera o necessário para que a próxima chamada respeite o intervalo. */
  async esperar(): Promise<void> {
    const agora = Date.now();
    if (this.ultimaVez !== undefined) {
      const faltam = this.intervaloMs - (agora - this.ultimaVez);
      if (faltam > 0) {
        await new Promise((resolve) => setTimeout(resolve, faltam));
      }
    }
    this.ultimaVez = Date.now();
  }
}
