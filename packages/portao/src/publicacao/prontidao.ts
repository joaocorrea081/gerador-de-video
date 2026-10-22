// Painel de prontidão: item por item, o que falta para cada rede publicar.
// Existe para o cliente não achar que está pronto quando não está.

import {
  contarUltimas24h, ESCOPOS_EXIGIDOS, LIMITE_DIARIO_FIXO, NOMES_REDE, obterConta, REDES, tokenPrecisaRenovar,
  type Rede,
} from "@gerador/core";
import type Database from "better-sqlite3";
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
  rede: Rede;
  nome: string;
  modo: "seco" | "real" | null;
  /** Pode publicar DE VERDADE (todos os itens ok e conta real). */
  prontaParaPublicarDeVerdade: boolean;
  /** Pode rodar o ciclo inteiro em modo seco (conta conectada). */
  prontaParaModoSeco: boolean;
  itens: ItemProntidao[];
  uso24h: { usado: number; limite: number | null };
}

export function calcularProntidao(db: Database.Database, env: Record<string, string | undefined>, agora: Date): ProntidaoRede[] {
  const urlPublica = urlPublicaBase(db, env);
  return REDES.map((rede) => {
    const c = obterConta(db, rede);
    const itens: ItemProntidao[] = [];
    const item = (id: string, descricao: string, ok: boolean, falta?: string) =>
      itens.push({ id, descricao, ok, ...(ok || !falta ? {} : { falta }) });

    item("conta_conectada", t("pront.item.contaConectada"), c.conectada, t("pront.falta.conectar", { rede: NOMES_REDE[rede] }));
    item("credencial_real", t("pront.item.credencialReal"), c.conectada && c.modo === "real", t("pront.falta.credencialReal"));
    const expirado = c.tokenExpiraEm !== null && Date.parse(c.tokenExpiraEm) <= agora.getTime();
    item("token_valido", t("pront.item.tokenValido"), c.conectada && !expirado,
      c.conectada ? t("pront.falta.tokenExpirou") : t("pront.falta.semContaSemToken"));
    if (c.conectada && !expirado && tokenPrecisaRenovar(c, agora)) {
      item("token_longe_de_expirar", t("pront.item.tokenLonge"), false, t("pront.falta.tokenPerto"));
    }
    const faltam = ESCOPOS_EXIGIDOS[rede].filter((e) => !c.escopos.includes(e));
    item("escopos", t("pront.item.escopos"), c.conectada && faltam.length === 0,
      c.conectada ? t("pront.falta.escopos", { lista: faltam.join(", ") }) : t("pront.falta.semContaSemPermissoes"));

    if (rede === "tiktok") {
      item("aprovacao", t("pront.item.tiktokAuditoria"), c.aprovacaoPlataforma, t("pront.falta.tiktokAuditoria"));
      item("segredo_do_app", t("pront.item.tiktokSegredo"),
        Boolean(env["TIKTOK_CLIENT_KEY"] && env["TIKTOK_CLIENT_SECRET"]), t("pront.falta.tiktokSegredo"));
    }
    if (rede === "facebook") {
      item("aprovacao", t("pront.item.facebookReview"), c.aprovacaoPlataforma, t("pront.falta.facebookReview"));
    }
    if (rede === "instagram") {
      item("aprovacao", t("pront.item.instagramApp"), c.aprovacaoPlataforma, t("pront.falta.instagramApp"));
    }
    item("midia_url_publica", t("pront.item.urlPublica"), urlPublica !== null, t("pront.falta.urlPublica"));

    const uso = contarUltimas24h(db, rede, agora).total;
    const ok = itens.every((i) => i.ok);
    return {
      rede, nome: NOMES_REDE[rede], modo: c.modo, itens,
      prontaParaPublicarDeVerdade: ok && c.modo === "real",
      prontaParaModoSeco: c.conectada,
      uso24h: { usado: uso, limite: LIMITE_DIARIO_FIXO[rede] ?? null },
    };
  });
}
