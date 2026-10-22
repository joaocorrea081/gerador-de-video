import type { IncomingMessage, ServerResponse } from "node:http";
import { ErroPortao } from "@gerador/core";
import { t } from "./idioma/index.js";

export function lerCorpoJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let bruto = "";
    req.on("data", (pedaco: Buffer) => {
      bruto += pedaco.toString("utf8");
    });
    req.on("end", () => {
      if (!bruto.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(bruto));
      } catch {
        reject(new ErroPortao(t("erro.jsonInvalido")));
      }
    });
    req.on("error", reject);
  });
}

export function responderJson(res: ServerResponse, status: number, corpo: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

/** ID numérico no meio de um caminho como "/api/videos/7/aprovar". Undefined se não bater. */
export function extrairIdDoCaminho(caminho: string, prefixo: string, sufixo: string): number | undefined {
  if (!caminho.startsWith(prefixo) || !caminho.endsWith(sufixo)) return undefined;
  const meio = caminho.slice(prefixo.length, caminho.length - sufixo.length);
  if (!/^\d+$/.test(meio)) return undefined;
  return Number(meio);
}
