// Rotas de API das ações da Etapa 5 (refazer, reescrever, editar, agendamento,
// progresso, estoque). As telas (Parte B) só chamam estas rotas.

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  abrirBanco,
  contextoParaEscritor,
  editarTexto,
  ErroPortao,
  FUNDOS_ESCOLHA,
  gerarVideoDoEstoque,
  gravarSaidaDoEscritor,
  lerAgendamento,
  listarEstoque,
  progressoFila,
  refazerVideo,
  registrarRodada,
  RITMOS_ESCOLHA,
  salvarAgendamento,
  exigirTextoEditavel,
  type Agendamento,
  type ResumoRodada,
} from "@gerador/core";
import {
  criarProvedorPorConfig,
  ErroConfiguracaoProvedor,
  ErroEscritorEsgotado,
  ErroProvedor,
  escreverAnuncioComMemoria,
  type Provedor,
} from "@gerador/escritor";
import {
  abrirFonteReal,
  executarRodada,
  lerEGravarProduto,
  type ProdutoLido,
} from "@gerador/leitor";
import type Database from "better-sqlite3";
import { extrairIdDoCaminho, lerCorpoJson, responderJson } from "./http.js";
import { traduzirErro } from "./erros.js";
import { t } from "./idioma/index.js";

export interface Dependencias {
  abrirBanco(): Database.Database;
  /** Lança ErroConfiguracaoProvedor se faltar a chave. */
  criarProvedor(): Provedor;
  /** `agendada` = veio do agendador (sem ninguém na frente da máquina): sites que dependem do navegador da pessoa são pulados. */
  executarRodada(db: Database.Database, ag: Agendamento, agendada?: boolean): Promise<ResumoRodada>;
  relerProduto(db: Database.Database, produtoId: number, url: string): Promise<ProdutoLido>;
  agora(): Date;
  /** Publicação (Etapa 6): tudo opcional; sem isso vale o padrão (modo seco/real por conta, ffprobe real). */
  fabricaRede?: import("./publicacao/publicador.js").FabricaProvedores;
  lerMidia?: (caminho: string) => Promise<import("@gerador/core").CaracteristicasMidia>;
  envPublicacao?: Record<string, string | undefined>;
  fetchRede?: import("./publicacao/provedores.js").FetchLike;
  /** Ambiente de onde saem as chaves de IA (só para saber se existem). Padrão: process.env. */
  envIA?: Record<string, string | undefined>;
  /** Teste de site (tela Sites). Padrão: testarSite do leitor. */
  testarSiteFn?: (url: string, opcoes: import("@gerador/leitor").OpcoesTeste) => Promise<import("@gerador/leitor").ResultadoTeste>;
  /** Verificação do navegador da pessoa. Padrão: bsk, sem subir o serviço. */
  verificarNavegadorFn?: () => Promise<import("@gerador/leitor").EstadoNavegadorPessoa>;
  /** Cria o provedor do botão "Testar conexão". Padrão: o do registro do escritor. */
  provedorParaTeste?: (id: string, modelo: string, env: Record<string, string | undefined>) => Provedor;
}

export const dependenciasPadrao: Dependencias = {
  abrirBanco,
  criarProvedor: () => {
    // a escolha da tela (ia.provedor / ia.modelo) vale; sem ela, ambiente e padrão
    const db = abrirBanco();
    try {
      return criarProvedorPorConfig(db);
    } finally {
      db.close();
    }
  },
  executarRodada: async (db, ag, agendada = false) => {
    const { fonte, fechar } = await abrirFonteReal();
    try {
      // Sem baseUrl: lê os sites CADASTRADOS e ativos (tela Sites). O endereço escondido do agendamento não vale mais.
      return await executarRodada(db, fonte, {
        quantidade: ag.quantidade,
        filtro: ag.filtro,
        agendada,
      });
    } finally {
      await fechar();
    }
  },
  relerProduto: async (db, _produtoId, url) => {
    const { fonte, fechar } = await abrirFonteReal();
    try {
      return await lerEGravarProduto(db, fonte, url);
    } finally {
      await fechar();
    }
  },
  agora: () => new Date(),
};

let rodadaEmAndamento = false;

/** Roda a rodada do agendador (a mesma de `rodar.ts`) e registra o resultado. Uma por vez. */
export async function rodarAgora(deps: Dependencias, agendada = false): Promise<ResumoRodada> {
  if (rodadaEmAndamento) throw new ErroConflito(t("erro.rodadaEmAndamento"));
  rodadaEmAndamento = true;
  const db = deps.abrirBanco();
  try {
    const ag = lerAgendamento(db, deps.agora());
    const iniciadaEm = deps.agora().toISOString();
    let resumo: ResumoRodada;
    try {
      resumo = await deps.executarRodada(db, ag, agendada);
    } catch (erro) {
      // Registra mesmo na falha: a próxima rodada conta a partir de agora, sem martelar o site.
      resumo = {
        iniciadaEm,
        terminadaEm: deps.agora().toISOString(),
        itens: [],
        erro: erro instanceof Error ? erro.message : String(erro),
      };
      registrarRodada(db, resumo);
      throw new ErroRodada(resumo.erro ?? t("erro.falhaLerSiteCurto"), resumo);
    }
    registrarRodada(db, resumo);
    return resumo;
  } finally {
    db.close();
    rodadaEmAndamento = false;
  }
}

/** Chamado pelo temporizador: roda só se estiver ligado e vencido. */
export async function rodarSeVencido(deps: Dependencias): Promise<ResumoRodada | null> {
  const db = deps.abrirBanco();
  let vencida = false;
  try {
    const ag = lerAgendamento(db, deps.agora());
    vencida = ag.ligado && ag.proximaRodada !== null && new Date(ag.proximaRodada) <= deps.agora();
  } finally {
    db.close();
  }
  if (!vencida || rodadaEmAndamento) return null;
  try {
    return await rodarAgora(deps, true);
  } catch (erro) {
    if (erro instanceof ErroRodada || erro instanceof ErroConflito) return null;
    throw erro;
  }
}

class ErroConflito extends Error {}
class ErroRodada extends Error {
  constructor(
    mensagem: string,
    readonly resumo: ResumoRodada,
  ) {
    super(mensagem);
  }
}

function idDe(caminho: string, sufixo: string): number | undefined {
  return extrairIdDoCaminho(caminho, "/api/videos/", sufixo);
}

/** Devolve true se a rota era uma destas (e já respondeu). */
export async function tratarRotaAcao(
  caminho: string,
  metodo: string,
  req: IncomingMessage,
  res: ServerResponse,
  deps: Dependencias,
): Promise<boolean> {
  // Cardápio fechado, para as telas montarem os botões.
  if (caminho === "/api/cardapio" && metodo === "GET") {
    responderJson(res, 200, { fundos: FUNDOS_ESCOLHA, ritmos: RITMOS_ESCOLHA });
    return true;
  }

  // --- Refazer vídeo ---
  const idRefazer = idDe(caminho, "/refazer");
  if (idRefazer !== undefined && metodo === "POST") {
    const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
    const db = deps.abrirBanco();
    try {
      const { video, job } = refazerVideo(db, idRefazer, {
        fundo: corpo["fundo"],
        ritmo: corpo["ritmo"],
        ordemFotos: corpo["ordemFotos"],
      });
      responderJson(res, 200, { video, job });
    } finally {
      db.close();
    }
    return true;
  }

  // --- Reescrever texto (chama o escritor) ---
  const idReescrever = idDe(caminho, "/reescrever-texto");
  if (idReescrever !== undefined && metodo === "POST") {
    const db = deps.abrirBanco();
    try {
      exigirTextoEditavel(db, idReescrever);

      let provedor: Provedor;
      try {
        provedor = deps.criarProvedor();
      } catch (erro) {
        if (erro instanceof ErroConfiguracaoProvedor) {
          // A mensagem diz qual variável falta; nunca contém valor de chave.
          responderJson(res, 503, { erro: erro.message, codigo: "chave_ausente" });
          return true;
        }
        throw erro;
      }

      const ctx = contextoParaEscritor(db, idReescrever);
      try {
        const r = await escreverAnuncioComMemoria(
          { dados: ctx.dados, quantidadeFotos: ctx.quantidadeFotos, idioma: ctx.idioma },
          provedor,
          db,
        );
        const { video, videoDesatualizado } = gravarSaidaDoEscritor(db, idReescrever, {
          titulo: r.escolha.texto.titulo,
          corpo: r.escolha.texto.corpo,
          fundo: r.escolha.cardapio.fundo,
          ritmo: r.escolha.cardapio.ritmo,
          ordemFotos: r.escolha.ordemFotos,
        });
        responderJson(res, 200, { video, videoDesatualizado, tentativasUsadas: r.tentativasUsadas });
      } catch (erro) {
        if (erro instanceof ErroProvedor || erro instanceof ErroEscritorEsgotado) {
          responderJson(res, 502, { erro: erro.message, codigo: "escritor_falhou" });
          return true;
        }
        throw erro;
      }
    } finally {
      db.close();
    }
    return true;
  }

  // --- Editar texto à mão: só título e corpo ---
  const idEditar = idDe(caminho, "/editar-texto");
  if (idEditar !== undefined && metodo === "POST") {
    const corpo = await lerCorpoJson(req);
    const db = deps.abrirBanco();
    try {
      responderJson(res, 200, { video: editarTexto(db, idEditar, corpo) });
    } finally {
      db.close();
    }
    return true;
  }

  // --- Agendamento ---
  if (caminho === "/api/agendamento" && metodo === "GET") {
    const db = deps.abrirBanco();
    try {
      responderJson(res, 200, { agendamento: lerAgendamento(db, deps.agora()) });
    } finally {
      db.close();
    }
    return true;
  }
  if (caminho === "/api/agendamento" && metodo === "POST") {
    const corpo = await lerCorpoJson(req);
    const db = deps.abrirBanco();
    try {
      responderJson(res, 200, { agendamento: salvarAgendamento(db, corpo, deps.agora()) });
    } finally {
      db.close();
    }
    return true;
  }
  if (caminho === "/api/agendamento/rodar-agora" && metodo === "POST") {
    try {
      const resumo = await rodarAgora(deps);
      const db = deps.abrirBanco();
      try {
        responderJson(res, 200, { resumo, agendamento: lerAgendamento(db, deps.agora()) });
      } finally {
        db.close();
      }
    } catch (erro) {
      if (erro instanceof ErroConflito) {
        responderJson(res, 409, { erro: erro.message });
      } else if (erro instanceof ErroRodada) {
        responderJson(res, 502, { erro: t("erro.falhaLerSite", { erro: erro.message }), resumo: erro.resumo });
      } else {
        throw erro;
      }
    }
    return true;
  }

  // --- Progresso da fila ---
  if (caminho === "/api/fila/progresso" && metodo === "GET") {
    const db = deps.abrirBanco();
    try {
      responderJson(res, 200, { progresso: progressoFila(db, deps.agora()) });
    } finally {
      db.close();
    }
    return true;
  }

  // --- Estoque ---
  if (caminho === "/api/estoque" && metodo === "GET") {
    const db = deps.abrirBanco();
    try {
      responderJson(res, 200, { estoque: listarEstoque(db) });
    } finally {
      db.close();
    }
    return true;
  }
  const idGerar = extrairIdDoCaminho(caminho, "/api/estoque/", "/gerar-video");
  if (idGerar !== undefined && metodo === "POST") {
    const db = deps.abrirBanco();
    try {
      const { video, job } = gerarVideoDoEstoque(db, idGerar);
      responderJson(res, 200, { video, job });
    } finally {
      db.close();
    }
    return true;
  }
  const idReler = extrairIdDoCaminho(caminho, "/api/estoque/", "/reler");
  if (idReler !== undefined && metodo === "POST") {
    const db = deps.abrirBanco();
    try {
      const p = db.prepare("SELECT origem_url FROM produto WHERE id = ?").get(idReler) as
        | { origem_url: string }
        | undefined;
      if (!p) throw new ErroPortao(`produto ${idReler} não encontrado`);
      let lido: ProdutoLido;
      try {
        lido = await deps.relerProduto(db, idReler, p.origem_url);
      } catch (erro) {
        responderJson(res, 502, {
          erro: t("erro.falhaReler", { erro: erro instanceof Error ? erro.message : String(erro) }),
        });
        return true;
      }
      const item = listarEstoque(db).find((i) => i.produtoId === idReler);
      responderJson(res, 200, { lido: { caso: lido.caso, fotos: lido.baixadas }, item });
    } finally {
      db.close();
    }
    return true;
  }

  return false;
}
