// Registro de conectores. Carrega todo arquivo de conectores/redes/ que faz `export default` de um Conector.
// Acrescentar uma rede é deixar um arquivo nessa pasta: este arquivo, as telas e as rotas não mudam.
// Conector malformado não derruba o painel: fica de fora e o motivo aparece na tela de Contas.

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { REDES } from "@gerador/core";
import type { Conector } from "./tipos.js";

const PASTA = join(dirname(fileURLToPath(import.meta.url)), "redes");
const ID_VALIDO = /^[a-z][a-z0-9_]{1,31}$/;

export interface FalhaDeCarga {
  arquivo: string;
  motivo: string;
}

/** Devolve o motivo da recusa, ou null se o conector está em ordem. */
export function problemaDoConector(c: unknown): string | null {
  if (typeof c !== "object" || c === null) return "o arquivo não exporta um conector (export default)";
  const x = c as Partial<Conector>;
  if (typeof x.id !== "string" || !ID_VALIDO.test(x.id)) return "id inválido (minúsculas, números e _; 2 a 32 caracteres)";
  if (typeof x.nome !== "string" || x.nome.trim() === "") return "falta o nome";
  if (typeof x.ativoPadrao !== "boolean" || typeof x.fila !== "boolean") return "faltam ativoPadrao e fila";
  if (!Array.isArray(x.modos) || x.modos.length === 0) return "falta a lista de modos (real e/ou seco)";
  if (!Array.isArray(x.campos) || !Array.isArray(x.escopos) || !Array.isArray(x.midia)) return "faltam campos, escopos ou midia";
  if (!x.aprovacao || !x.limites) return "faltam aprovacao e limites";
  if (x.fila && !(REDES as readonly string[]).includes(x.id)) {
    return "fila=true exige que o núcleo conheça este id; use fila=false para uma rede nova";
  }
  return null;
}

async function carregar(): Promise<{ conectores: Conector[]; falhas: FalhaDeCarga[] }> {
  const conectores: Conector[] = [];
  const falhas: FalhaDeCarga[] = [];
  const arquivos = readdirSync(PASTA)
    .filter((f) => /\.(ts|js)$/.test(f) && !/\.d\.ts$/.test(f) && !/\.test\.(ts|js)$/.test(f))
    .sort();
  for (const arquivo of arquivos) {
    try {
      const modulo = (await import(pathToFileURL(join(PASTA, arquivo)).href)) as { default?: unknown };
      const problema = problemaDoConector(modulo.default);
      if (problema) {
        falhas.push({ arquivo, motivo: problema });
        continue;
      }
      const c = modulo.default as Conector;
      if (conectores.some((o) => o.id === c.id)) {
        falhas.push({ arquivo, motivo: `o id "${c.id}" já existe em outro arquivo` });
        continue;
      }
      conectores.push(c);
    } catch (e) {
      falhas.push({ arquivo, motivo: e instanceof Error ? e.message : String(e) });
    }
  }
  conectores.sort((a, b) => (a.ordem ?? 100) - (b.ordem ?? 100) || a.id.localeCompare(b.id));
  return { conectores, falhas };
}

const carga = await carregar();

/** Todos os conectores instalados, na ordem de exibição. */
export const CONECTORES: readonly Conector[] = carga.conectores;
export const FALHAS_DE_CARGA: readonly FalhaDeCarga[] = carga.falhas;

export function acharConector(id: string): Conector | undefined {
  return CONECTORES.find((c) => c.id === id);
}
