import { ESCOPOS_EXIGIDOS, LIMITE_LEGENDA, MAXIMO_HASHTAGS } from "@gerador/core";
import { t } from "../../idioma/index.js";
import { camposDoNucleo } from "../campos-padrao.js";
import type { Conector } from "../tipos.js";

const conector: Conector = {
  id: "tiktok",
  nome: "TikTok",
  ordem: 30,
  ativoPadrao: true,
  fila: true,
  modos: ["real", "seco"],
  campos: camposDoNucleo(() => t("contas.idConta.tiktok"), () => t("contas.refreshTiktok"), ESCOPOS_EXIGIDOS.tiktok),
  escopos: ESCOPOS_EXIGIDOS.tiktok,
  precisaUrlPublica: true,
  ambiente: [
    {
      variaveis: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
      descricao: () => t("pront.item.tiktokSegredo"),
      falta: () => t("pront.falta.tiktokSegredo"),
    },
  ],
  aprovacao: {
    item: () => t("pront.item.tiktokAuditoria"),
    rotulo: () => t("contas.aprovacao.tiktok"),
    falta: () => t("pront.falta.tiktokAuditoria"),
    resumo: {
      en: "Without the TikTok audit, public posting is NOT possible (private only). The audit takes 2 to 6 weeks.",
      "pt-BR": "Sem a auditoria do TikTok NÃO publica em público (só privado). A auditoria leva de 2 a 6 semanas.",
    },
    prazo: () => t("pront.prazo.tiktok"),
  },
  limites: { legenda: LIMITE_LEGENDA.tiktok, hashtags: MAXIMO_HASHTAGS.tiktok },
  midia: [
    {
      en: "Without the audit only private visibility is accepted, in a private account, for at most 5 users per 24 hours.",
      "pt-BR": "Sem auditoria só visibilidade privada, em conta privada, para no máximo 5 usuários por 24 horas.",
    },
  ],
};

export default conector;
