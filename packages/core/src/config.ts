import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Raiz do monorepo: packages/core/src -> ../../.. = raiz.
const __dirname = dirname(fileURLToPath(import.meta.url));
export const RAIZ_PROJETO = resolve(__dirname, "../../..");

// GERADOR_DB permite apontar para outro arquivo (provas e testes contra uma cópia),
// sem tocar no banco de verdade.
export const CAMINHO_BANCO = process.env["GERADOR_DB"] ?? join(RAIZ_PROJETO, "dados", "gerador.db");

/** Garante que a pasta dados/ existe antes de abrir o banco. */
export function garantirPastaDados(): void {
  const pasta = dirname(CAMINHO_BANCO);
  if (!existsSync(pasta)) {
    mkdirSync(pasta, { recursive: true });
  }
}

export interface Config {
  porta: number;
  anthropicApiKey: string | undefined;
}

const PORTA_PADRAO = 3080;

/** Lê PORT do ambiente. String vazia/só espaço, não numérica, ou fora de 1-65535 cai no padrão. */
function lerPorta(bruta: string | undefined): number {
  const texto = bruta?.trim();
  if (!texto) return PORTA_PADRAO;

  const porta = Number(texto);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return PORTA_PADRAO;

  return porta;
}

export function carregarConfig(): Config {
  return {
    porta: lerPorta(process.env.PORT),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}
