import { idiomaAtual } from "../idioma/index.js";
import type { Texto } from "./tipos.js";

/** Escolhe o texto no idioma da requisição; sem tradução, cai para inglês e depois para o que houver. */
export function textoDe(x: Texto): string {
  if (typeof x === "string") return x;
  if (typeof x === "function") return x();
  return x[idiomaAtual()] ?? x.en ?? x["pt-BR"] ?? Object.values(x)[0] ?? "";
}
