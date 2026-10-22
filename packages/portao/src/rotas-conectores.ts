// Rotas dos conectores: listar e ligar/desligar. Ligar e desligar é um ajuste no banco; nenhum código muda.
import type { IncomingMessage, ServerResponse } from "node:http";
import { ErroPublicacao } from "@gerador/core";
import { acharConector, CONECTORES, contaDoConector, definirConectorAtivo, conectorAtivo, textoDe } from "./conectores/index.js";
import { traduzirErro } from "./erros.js";
import { lerCorpoJson, responderJson } from "./http.js";
import { t } from "./idioma/index.js";
import type { Dependencias } from "./rotas-acoes.js";

const reAtivo = /^\/api\/conectores\/(\w+)\/ativo$/;

export async function tratarRotaConectores(
  caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias,
): Promise<boolean> {
  const m = reAtivo.exec(caminho);
  if (caminho !== "/api/conectores" && !m) return false;
  const db = deps.abrirBanco();
  try {
    if (caminho === "/api/conectores" && metodo === "GET") {
      responderJson(res, 200, {
        conectores: CONECTORES.map((c) => ({
          id: c.id, nome: c.nome, exemplo: c.exemplo === true, fila: c.fila, ativo: conectorAtivo(db, c),
          modos: c.modos, resumoDaAprovacao: textoDe(c.aprovacao.resumo), conta: contaDoConector(db, c),
        })),
      });
      return true;
    }
    if (m && metodo === "POST") {
      const c = acharConector(m[1]!);
      if (!c) throw new ErroPublicacao(t("erro.conectorDesconhecido"), 404, "conector_inexistente");
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      if (typeof corpo["ativo"] !== "boolean") throw new ErroPublicacao(t("erro.ativoInvalido"), 400, "ativo_invalido");
      definirConectorAtivo(db, c.id, corpo["ativo"]);
      responderJson(res, 200, { id: c.id, ativo: corpo["ativo"] });
      return true;
    }
    return false;
  } catch (e) {
    if (e instanceof ErroPublicacao) {
      responderJson(res, e.status, { erro: traduzirErro(e.message), codigo: e.codigo });
      return true;
    }
    throw e;
  } finally {
    db.close();
  }
}
