// Painel de prontidão: item por item, o que falta para cada rede publicar.
// Existe para o cliente não achar que está pronto quando não está.
// Monta-se a partir do registro de conectores: nenhuma rede é citada aqui.

import { contarUltimas24h, tokenPrecisaRenovar, type Rede } from "@gerador/core";
import type Database from "better-sqlite3";
import { conectoresAtivos, contaDoConector, textoDe } from "../conectores/index.js";
import { t } from "../idioma/index.js";
import { urlPublicaBase } from "./publicador.js";

export interface ItemProntidao {
  id: string;
  descricao: string;
  ok: boolean;
  /** O que fazer, quando falta. */
  falta?: string;
}

export interface ProntidaoRede {
  /** Id do conector (as três redes do núcleo e qualquer conector instalado). */
  rede: string;
  nome: string;
  exemplo: boolean;
  modo: "seco" | "real" | null;
  /** Pode publicar DE VERDADE (todos os itens ok e conta real). */
  prontaParaPublicarDeVerdade: boolean;
  /** Pode rodar o ciclo inteiro em modo seco (conta conectada). */
  prontaParaModoSeco: boolean;
  itens: ItemProntidao[];
  uso24h: { usado: number; limite: number | null };
  limiteLegenda: number | null;
  /** Uma linha: o que ainda falta e em quanto tempo. */
  resumo: string;
  /** O texto completo do prazo real. */
  prazo: string;
}

export function calcularProntidao(db: Database.Database, env: Record<string, string | undefined>, agora: Date): ProntidaoRede[] {
  const urlPublica = urlPublicaBase(db, env);
  return conectoresAtivos(db).map((c) => {
    const conta = contaDoConector(db, c);
    const itens: ItemProntidao[] = [];
    const item = (id: string, descricao: string, ok: boolean, falta?: string) =>
      itens.push({ id, descricao, ok, ...(ok || !falta ? {} : { falta }) });

    item("conta_conectada", t("pront.item.contaConectada"), conta.conectada, t("pront.falta.conectar", { rede: c.nome }));
    if (c.modos.includes("real")) {
      item("credencial_real", t("pront.item.credencialReal"), conta.conectada && conta.modo === "real", t("pront.falta.credencialReal"));
      const expirado = conta.tokenExpiraEm !== null && Date.parse(conta.tokenExpiraEm) <= agora.getTime();
      item("token_valido", t("pront.item.tokenValido"), conta.conectada && !expirado,
        conta.conectada ? t("pront.falta.tokenExpirou") : t("pront.falta.semContaSemToken"));
      if (conta.conectada && !expirado && c.fila && tokenPrecisaRenovar({ ...conta, rede: c.id as Rede }, agora)) {
        item("token_longe_de_expirar", t("pront.item.tokenLonge"), false, t("pront.falta.tokenPerto"));
      }
    }
    if (c.escopos.length > 0) {
      const faltam = c.escopos.filter((e) => !conta.escopos.includes(e));
      item("escopos", t("pront.item.escopos"), conta.conectada && faltam.length === 0,
        conta.conectada ? t("pront.falta.escopos", { lista: faltam.join(", ") }) : t("pront.falta.semContaSemPermissoes"));
    }
    item("aprovacao", textoDe(c.aprovacao.item), conta.aprovacaoPlataforma, textoDe(c.aprovacao.falta));
    for (const a of c.ambiente ?? []) {
      item("segredo_do_app", textoDe(a.descricao), a.variaveis.every((v) => Boolean(env[v])), textoDe(a.falta));
    }
    if (c.precisaUrlPublica) item("midia_url_publica", t("pront.item.urlPublica"), urlPublica !== null, t("pront.falta.urlPublica"));

    const usado = c.fila ? contarUltimas24h(db, c.id as Rede, agora).total : 0;
    const ok = itens.every((i) => i.ok);
    return {
      rede: c.id, nome: c.nome, exemplo: c.exemplo === true, modo: conta.modo, itens,
      prontaParaPublicarDeVerdade: ok && conta.modo === "real",
      prontaParaModoSeco: conta.conectada,
      uso24h: { usado, limite: c.limites.diario ?? null },
      limiteLegenda: c.limites.legenda ?? null,
      resumo: textoDe(c.aprovacao.resumo),
      prazo: textoDe(c.aprovacao.prazo),
    };
  });
}
