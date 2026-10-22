// Apoio dos testes: navegador falso e leitura de fixture. Nunca toca a rede.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { migrar } from "@gerador/core";
import type { Navegador } from "./navegador.js";
import { interpretarRobots, type Robots } from "./robots.js";

const AQUI = dirname(fileURLToPath(import.meta.url));

export const fixture = (nome: string): string => readFileSync(join(AQUI, "fixtures", nome), "utf8");

export function banco(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

export interface NavegadorFalso extends Navegador {
  chamadas: { url: string; em: number }[];
}

/** `responder` devolve o HTML da URL; lançar erro simula site fora do ar. */
export function navegadorFalso(responder: (url: string) => string): NavegadorFalso {
  const chamadas: { url: string; em: number }[] = [];
  return {
    chamadas,
    async abrirERolar(url) {
      chamadas.push({ url, em: Date.now() });
      return responder(url);
    },
    async fechar() {},
  };
}

export const robotsDe = (texto: string) => async (): Promise<Robots> => interpretarRobots(texto);
export const ROBOTS_LIVRE = robotsDe("User-agent: *\nAllow: /\n");
