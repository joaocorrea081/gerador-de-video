// A conferência de preço nasce desligada no núcleo (para não quebrar quem já publicava). Agora que o publicador
// a chama e a tela mostra o que ela barra, ela liga UMA vez, ao subir o painel. Depois disso a escolha é da pessoa:
// se ela desligar em Configurações, não ligamos de novo.
import { definirAjuste, definirExigirConferencia, obterAjuste } from "@gerador/core";
import type Database from "better-sqlite3";

const MARCA = "conferencia.ligada_pelo_portao";

/** true se ligou agora. */
export function ligarConferenciaNaPrimeiraVez(db: Database.Database): boolean {
  if (obterAjuste(db, MARCA) !== undefined) return false;
  definirExigirConferencia(db, true);
  definirAjuste(db, MARCA, "1");
  return true;
}
