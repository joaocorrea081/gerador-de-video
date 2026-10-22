// Qual adaptador atende cada site cadastrado. O do AutoCerto tem precedência
// quando a plataforma é reconhecida (ele conhece os seletores de plano B).

import type { Adaptador } from "../adaptador.js";
import { adaptadorAutoCerto } from "./autocerto.js";
import { adaptadorJsonLd } from "./jsonld.js";

export const NOMES_ADAPTADOR = ["autocerto", "jsonld"] as const;
export type NomeAdaptador = (typeof NOMES_ADAPTADOR)[number];

const ADAPTADORES: Record<NomeAdaptador, Adaptador> = {
  autocerto: adaptadorAutoCerto,
  jsonld: adaptadorJsonLd,
};

export function ehNomeAdaptador(valor: unknown): valor is NomeAdaptador {
  return typeof valor === "string" && (NOMES_ADAPTADOR as readonly string[]).includes(valor);
}

export function adaptadorPorNome(nome: NomeAdaptador): Adaptador {
  return ADAPTADORES[nome];
}

/** Reconhece a plataforma pelo HTML. Hoje só o AutoCerto se revela de forma segura. */
export function identificarPlataforma(html: string): NomeAdaptador | undefined {
  if (/static\.autocerto\.com|autocerto\.com\/fotos\/|\/Home\/Obter[A-Z]/.test(html)) return "autocerto";
  return undefined;
}
