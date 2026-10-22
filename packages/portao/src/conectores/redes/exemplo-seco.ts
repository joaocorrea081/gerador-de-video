// CONECTOR DE EXEMPLO, fictício e só em modo seco. Existe para provar o desenho do P5:
// uma rede nova entra deixando UM arquivo nesta pasta. Nenhum outro arquivo do painel muda.
// Para criar uma rede de verdade, copie este arquivo, troque id, nome, campos e textos, e apague este.
import type { Conector } from "../tipos.js";

const conector: Conector = {
  id: "exemplo_seco",
  nome: "Example Network",
  ordem: 900,
  exemplo: true,
  ativoPadrao: false,
  // false: o motor de fila do núcleo ainda não conhece este id; a rede aparece em Contas e Prontidão, não nas listas de agendar.
  fila: false,
  modos: ["seco"],
  campos: [],
  escopos: [],
  precisaUrlPublica: false,
  aprovacao: {
    rotulo: { en: "Example network approval", "pt-BR": "Aprovação da rede de exemplo" },
    item: { en: "Example network approved", "pt-BR": "Rede de exemplo aprovada" },
    falta: {
      en: "This network does not exist. There is nothing to approve; it only shows how a new network appears.",
      "pt-BR": "Esta rede não existe. Não há o que aprovar; ela só mostra como uma rede nova aparece.",
    },
    resumo: {
      en: "Made up for the demo: there is nothing to wait for. A real network would state its approval step and real deadline here.",
      "pt-BR": "Inventada para a demonstração: não há o que esperar. Uma rede de verdade diria aqui a etapa de aprovação e o prazo real.",
    },
    prazo: {
      en: "No deadline: the network is fictional and works in dry mode only.",
      "pt-BR": "Sem prazo: a rede é fictícia e funciona só em modo seco.",
    },
  },
  limites: { legenda: 500, hashtags: 5, diario: 10 },
  midia: [
    {
      en: "Any vertical video up to 60 seconds. (Example rule: the real file check belongs to the core.)",
      "pt-BR": "Qualquer vídeo vertical de até 60 segundos. (Regra de exemplo: a checagem real do arquivo é do núcleo.)",
    },
  ],
};

export default conector;
