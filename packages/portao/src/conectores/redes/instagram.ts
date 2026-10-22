import { ESCOPOS_EXIGIDOS, LIMITE_LEGENDA, LIMITES_MIDIA, MAXIMO_HASHTAGS } from "@gerador/core";
import { t } from "../../idioma/index.js";
import { camposDoNucleo } from "../campos-padrao.js";
import type { Conector } from "../tipos.js";

const L = LIMITES_MIDIA.instagram;

const conector: Conector = {
  id: "instagram",
  nome: "Instagram",
  ordem: 10,
  ativoPadrao: true,
  fila: true,
  modos: ["real", "seco"],
  campos: camposDoNucleo(() => t("contas.idConta.instagram"), () => t("contas.refreshSeHouver"), ESCOPOS_EXIGIDOS.instagram),
  escopos: ESCOPOS_EXIGIDOS.instagram,
  precisaUrlPublica: true,
  aprovacao: {
    item: () => t("pront.item.instagramApp"),
    rotulo: () => t("contas.aprovacao.instagram"),
    falta: () => t("pront.falta.instagramApp"),
    resumo: {
      en: "Fast if the app is the client's and posts only to the client's own accounts (Standard Access, no App Review). Third-party accounts need App Review: about 20 days, and a rejection restarts the clock.",
      "pt-BR": "Entra rápido se o app for do cliente e publicar só nas contas dele (Standard Access, sem App Review). Contas de terceiros exigem App Review: cerca de 20 dias, e reprovação reinicia o relógio.",
    },
    prazo: () => t("pront.prazo.instagram"),
  },
  limites: { legenda: LIMITE_LEGENDA.instagram, hashtags: MAXIMO_HASHTAGS.instagram },
  midia: [
    {
      en: `Reels: ${L.duracaoMin} s to ${L.duracaoMax / 60} min, up to ${L.tamanhoMax / 1048576} MB, width up to ${L.larguraMax}px, ${L.fpsMin} to ${L.fpsMax} fps.`,
      "pt-BR": `Reels: ${L.duracaoMin} s a ${L.duracaoMax / 60} min, até ${L.tamanhoMax / 1048576} MB, largura até ${L.larguraMax}px, ${L.fpsMin} a ${L.fpsMax} quadros por segundo.`,
    },
    {
      en: "H264 or HEVC video with AAC audio, 9:16 recommended, MP4 index at the start and no edit lists.",
      "pt-BR": "Vídeo H264 ou HEVC com áudio AAC, 9:16 recomendado, índice do MP4 no começo e sem edit lists.",
    },
  ],
};

export default conector;
