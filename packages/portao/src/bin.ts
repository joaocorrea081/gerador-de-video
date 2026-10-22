// Ponto de entrada executável: só isto sobe o servidor de verdade.
// Sobe também a fila de render (concorrência 1): sem ela, "refazer vídeo" e as
// rodadas do agendador enfileirariam e nada renderizaria.
import { join } from "node:path";
import { abrirBanco, RAIZ_PROJETO } from "@gerador/core";
import { criarFila } from "@gerador/montador";
import { ligarConferenciaNaPrimeiraVez } from "./publicacao/conferencia-inicial.js";
import { iniciarServidor } from "./servidor.js";

if (process.env["GERADOR_SEM_FILA"] !== "1") {
  const pastaSaida = process.env["GERADOR_PASTA_VIDEOS"] ?? join(RAIZ_PROJETO, "dados", "videos");
  criarFila(abrirBanco(), { pastaSaida }).iniciar();
}
{
  const db = abrirBanco();
  try {
    if (ligarConferenciaNaPrimeiraVez(db)) console.log("Conferência de preço antes de publicar: ligada (Configurações, Conferência antes de publicar).");
  } finally {
    db.close();
  }
}
iniciarServidor();
