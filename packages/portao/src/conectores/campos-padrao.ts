// Campos de credencial que as três redes do núcleo guardam em conta_rede (core/publicacao.ts). Quem acrescenta uma rede
// que o núcleo ainda não conhece não precisa disto: declara os próprios campos.
import { t } from "../idioma/index.js";
import type { CampoCredencial, Texto } from "./tipos.js";

export function camposDoNucleo(idDaConta: Texto, refreshRotulo: () => string, escoposSugeridos: readonly string[]): CampoCredencial[] {
  return [
    { id: "contaId", rotulo: idDaConta, tipo: "texto", obrigatorio: true },
    { id: "contaNome", rotulo: () => t("contas.nomeMostrar"), tipo: "texto", obrigatorio: false },
    { id: "accessToken", rotulo: () => t("contas.tokenAcesso"), ajuda: () => t("contas.tokenAcessoAjuda"), tipo: "segredo", obrigatorio: true },
    { id: "refreshToken", rotulo: refreshRotulo, ajuda: () => t("contas.refreshAjuda"), tipo: "segredo", obrigatorio: false },
    { id: "expiraEm", rotulo: () => t("contas.tokenExpiraBr"), tipo: "data_hora", obrigatorio: true },
    { id: "refreshExpiraEm", rotulo: () => t("contas.refreshExpiraOpc"), tipo: "data_hora", obrigatorio: false },
    { id: "escopos", rotulo: () => t("contas.escopos"), ajuda: () => t("contas.escoposAjuda"), tipo: "lista", obrigatorio: false, sugestao: escoposSugeridos.join(", ") },
  ];
}
