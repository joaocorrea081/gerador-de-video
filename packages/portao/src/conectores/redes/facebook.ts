import { ESCOPOS_EXIGIDOS, LIMITE_DIARIO_FIXO, LIMITE_LEGENDA, LIMITES_MIDIA, MAXIMO_HASHTAGS } from "@gerador/core";
import { t } from "../../idioma/index.js";
import { camposDoNucleo } from "../campos-padrao.js";
import type { Conector } from "../tipos.js";

const L = LIMITES_MIDIA.facebook;

const conector: Conector = {
  id: "facebook",
  nome: "Facebook",
  ordem: 20,
  ativoPadrao: true,
  fila: true,
  modos: ["real", "seco"],
  campos: camposDoNucleo(() => t("contas.idConta.facebook"), () => t("contas.refreshSeHouver"), ESCOPOS_EXIGIDOS.facebook),
  escopos: ESCOPOS_EXIGIDOS.facebook,
  precisaUrlPublica: true,
  aprovacao: {
    item: () => t("pront.item.facebookReview"),
    rotulo: () => t("contas.aprovacao.facebook"),
    falta: () => t("pront.falta.facebookReview"),
    resumo: {
      en: "Needs Meta App Review (Advanced Access): about 20 days, and a rejection restarts the clock.",
      "pt-BR": "Exige App Review da Meta (Advanced Access): cerca de 20 dias, e reprovação reinicia o relógio.",
    },
    prazo: () => t("pront.prazo.facebook"),
  },
  limites: { legenda: LIMITE_LEGENDA.facebook, hashtags: MAXIMO_HASHTAGS.facebook, ...(LIMITE_DIARIO_FIXO.facebook !== undefined ? { diario: LIMITE_DIARIO_FIXO.facebook } : {}) },
  midia: [
    {
      en: `Page Reels: 9:16 required, ${L.larguraMin}x${L.alturaMin} minimum (1080x1920 recommended), ${L.duracaoMin} to ${L.duracaoMax} seconds.`,
      "pt-BR": `Reels de Página: 9:16 obrigatório, mínimo ${L.larguraMin}x${L.alturaMin} (1080x1920 recomendado), de ${L.duracaoMin} a ${L.duracaoMax} segundos.`,
    },
    {
      en: "AAC-LC audio, 48 kHz stereo at 128 kbps or more recommended.",
      "pt-BR": "Áudio AAC-LC, recomendado 48 kHz estéreo a 128 kbps ou mais.",
    },
  ],
};

export default conector;
