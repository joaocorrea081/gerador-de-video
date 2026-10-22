// Ajustes da conferência de preço: a chave de exigir e a validade, em minutos. Quem decide é o núcleo (core/conferencia.ts).
import type { IncomingMessage, ServerResponse } from "node:http";
import { definirExigirConferencia, definirValidadeConferenciaMin, exigirConferencia, validadeConferenciaMin } from "@gerador/core";
import { lerCorpoJson, responderJson } from "./http.js";
import { t } from "./idioma/index.js";
import type { Dependencias } from "./rotas-acoes.js";

export async function tratarRotaConferencia(
  caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias,
): Promise<boolean> {
  if (caminho !== "/api/conferencia") return false;
  const db = deps.abrirBanco();
  try {
    if (metodo === "GET") {
      responderJson(res, 200, { exigir: exigirConferencia(db), validadeMin: validadeConferenciaMin(db) });
      return true;
    }
    if (metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const v = corpo["validadeMin"];
      if (v !== undefined && (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 24 * 60)) {
        responderJson(res, 400, { erro: t("js.confValidadeInvalida") });
        return true;
      }
      if (corpo["exigir"] !== undefined && typeof corpo["exigir"] !== "boolean") {
        responderJson(res, 400, { erro: t("erro.ativoInvalido") });
        return true;
      }
      if (typeof v === "number") definirValidadeConferenciaMin(db, v);
      if (typeof corpo["exigir"] === "boolean") definirExigirConferencia(db, corpo["exigir"]);
      responderJson(res, 200, { exigir: exigirConferencia(db), validadeMin: validadeConferenciaMin(db) });
      return true;
    }
    return false;
  } finally {
    db.close();
  }
}
