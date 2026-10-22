// A página de detalhe não existe mais (HTTP 404 ou 410). É a prova mais forte
// de que um carro saiu do ar — e só ela: 403, 429, 5xx, timeout e bloqueio
// NÃO são isto (site fora do ar nunca pode virar "vendeu").

export class PaginaInexistenteError extends Error {
  constructor(
    readonly url: string,
    readonly status: 404 | 410,
  ) {
    super(`A página não existe mais (HTTP ${status}): ${url}`);
  }
}

export const ehStatusDePaginaInexistente = (status: number | undefined): status is 404 | 410 =>
  status === 404 || status === 410;
