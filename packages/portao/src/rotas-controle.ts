// Rotas dos controles do operador: parar tudo, grade de publicação, aprovar emendado no agendar, carro vendido,
// job travado, desfazer a rejeição e sugestões de variação. Toda regra mora no núcleo; aqui só se chama e se responde.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  aprovarComSugestao, definirAjuste, definirLeiturasParaSaida, definirPlanoAtivo, encaixarAprovados, ErroPausa, ErroPortao,
  ErroPublicacao, lerPlano, leiturasParaSaida, listarAlertasEstoque, listarVideosPorEstado, marcarJobFalhou, normalizarPlano,
  obterAjuste, obterPausa, obterVideo, pausarTudo, preverEncaixe, retomarTudo, salvarPlano,
  type DepsAgendador, type ModoAprovar, type OpcoesEncaixe, type Plano,
} from "@gerador/core";
import { sugerirVariacoesDoVideo } from "@gerador/montador";
import type Database from "better-sqlite3";
import type { ContextoTela } from "./contexto-tela.js";
import { redesDeFilaAtivas } from "./conectores/index.js";
import { medir } from "./dados-telas.js";
import { traduzirErro } from "./erros.js";
import { lerCorpoJson, responderJson } from "./http.js";
import { t, tOpcional } from "./idioma/index.js";
import { TIMEOUT_JOB_MS } from "./limites.js";
import { blocoPrevisao } from "./paginas-grade.js";
import { botoesDeSugestoes, chaveDaVariacao, escolhaAtual, quadroAprovado, textoPausa } from "./pecas-controle.js";
import { localizarProblema } from "./publicacao/publicador.js";
import type { Dependencias } from "./rotas-acoes.js";

// ---------------------------------------------------------------- contexto da casca

const CHAVE_RESOLVIDO = "estoque.alerta_resolvido.";

/** Alertas de carro vendido que ainda pedem uma pessoa: os já "tirei do ar" saem; os bloqueados ficam (informam). */
export function alertasPendentes(db: Database.Database): ContextoTela["alertas"] {
  return listarAlertasEstoque(db).filter((a) => a.situacao !== "tirar_do_ar" || obterAjuste(db, `${CHAVE_RESOLVIDO}${a.publicacaoId}`) === undefined);
}

export function lerContextoTela(db: Database.Database): ContextoTela {
  return { pausa: obterPausa(db), alertas: alertasPendentes(db), redesAtivas: redesDeFilaAtivas(db) };
}

// ------------------------------------------------------------------ job travado

/** Põe de volta na fila os jobs "em execução" há mais tempo que o limite. O que está rodando de verdade não é tocado. */
export function destravarJobs(db: Database.Database, agora: Date): number {
  const jobs = db.prepare("SELECT id, video_id, iniciado_em FROM job WHERE estado = 'em_execucao'").all() as { id: number; video_id: number; iniciado_em: string | null }[];
  let n = 0;
  for (const j of jobs) {
    if (!j.iniciado_em || agora.getTime() - Date.parse(j.iniciado_em) <= TIMEOUT_JOB_MS) continue;
    marcarJobFalhou(db, j.id, j.video_id, "Travado: passou do tempo limite e nenhum processo o terminou");
    n++;
  }
  return n;
}

// -------------------------------------------------------------- desfazer a rejeição

const JANELA_DESFAZER_MS = 10 * 60_000;

/** Apaga a rejeição (que é a memória que ensina o escritor) E devolve o vídeo à fila. Tudo ou nada. */
export function desfazerRejeicao(db: Database.Database, rejeicaoId: number, agora: Date): { videoId: number } {
  return db.transaction(() => {
    const r = db.prepare("SELECT id, video_id, criado_em FROM rejeicao WHERE id = ?").get(rejeicaoId) as { id: number; video_id: number; criado_em: string } | undefined;
    const v = r ? obterVideo(db, r.video_id) : undefined;
    const ultima = r ? (db.prepare("SELECT MAX(id) AS id FROM rejeicao WHERE video_id = ?").get(r.video_id) as { id: number }).id : 0;
    if (!r || !v || v.estado !== "rejeitado" || ultima !== r.id || agora.getTime() - Date.parse(r.criado_em) > JANELA_DESFAZER_MS) {
      throw new ErroDesfazer(t("rej.desfazerIndisponivel"));
    }
    db.prepare("DELETE FROM rejeicao WHERE id = ?").run(r.id);
    db.prepare("UPDATE video SET estado = 'aguardando_aprovacao', atualizado_em = ? WHERE id = ?").run(agora.toISOString(), r.video_id);
    return { videoId: r.video_id };
  })();
}

class ErroDesfazer extends Error {}

// ------------------------------------------------------------------- grade

export function nomesDosVideos(db: Database.Database, ids: readonly number[]): Map<number, string> {
  const nomes = new Map<number, string>();
  for (const id of ids) {
    const l = db.prepare("SELECT p.dados_json FROM video v JOIN produto p ON p.id = v.produto_id WHERE v.id = ?").get(id) as { dados_json: string } | undefined;
    let ficha: { marca?: string; modelo?: string; ano?: number } = {};
    try { ficha = l ? (JSON.parse(l.dados_json) as typeof ficha) : {}; } catch { ficha = {}; }
    const carro = [ficha.marca, ficha.modelo, ficha.ano].filter(Boolean).join(" ");
    nomes.set(id, carro || t("pub.videoN", { id }));
  }
  return nomes;
}

/** Vídeos que a grade considera: os aprovados com arquivo pronto. */
export function aprovadosParaGrade(db: Database.Database): number[] {
  return listarVideosPorEstado(db, ["aprovado", "publicado"]).filter((v) => v.caminhoMp4).map((v) => v.id);
}

function depsAgendador(deps: Dependencias): DepsAgendador {
  return deps.lerMidia ? { lerMidia: deps.lerMidia } : {};
}

function opcoesDeEncaixe(db: Database.Database, corpo: Record<string, unknown>): OpcoesEncaixe {
  const v = corpo["visibilidadeTiktok"];
  // Só as redes ligadas entram na previsão e no agendamento.
  const redes = redesDeFilaAtivas(db);
  return v === "publica" || v === "privada" ? { visibilidadeTiktok: v, redes } : { redes };
}

/** A previsão, já em HTML, para um plano (o salvo ou o que a pessoa está montando). */
export async function previsaoEmHtml(db: Database.Database, deps: Dependencias, plano: Plano, opcoesPedidas: OpcoesEncaixe = {}): Promise<{ html: string; total: number }> {
  const opcoes: OpcoesEncaixe = { ...opcoesPedidas, redes: opcoesPedidas.redes ?? redesDeFilaAtivas(db) };
  const ids = aprovadosParaGrade(db);
  // Prever só faz sentido com blocos; com a grade desligada a previsão mostra o que aconteceria se ligasse.
  const simulado: Plano = { ativo: plano.grades.length > 0, grades: plano.grades };
  const prev = await preverEncaixe(db, ids, deps.agora(), opcoes, depsAgendador(deps), simulado);
  const html = blocoPrevisao(prev, nomesDosVideos(db, [...new Set([...prev.itens, ...prev.semVaga, ...prev.fora].map((x) => x.videoId))]), { planoLigado: plano.ativo, temBlocos: plano.grades.length > 0 });
  return { html, total: prev.itens.length };
}

function mensagemDoPlano(erro: ErroPublicacao): string {
  const n = /^bloco (\d+)/.exec(erro.message)?.[1] ?? "?";
  return tOpcional(`grade.erro.${erro.codigo}`, { n }) ?? traduzirErro(erro.message);
}

// ------------------------------------------------------------------ roteador

const reVideoAprovar = /^\/api\/videos\/(\d+)\/aprovar-com-sugestao$/;
const reVariacoes = /^\/api\/videos\/(\d+)\/variacoes$/;
const reDesfazer = /^\/api\/rejeicoes\/(\d+)\/desfazer$/;
const reResolver = /^\/api\/estoque\/alertas\/(\d+)\/resolver$/;

export async function tratarRotaControle(
  caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias,
): Promise<boolean> {
  const mAprovar = reVideoAprovar.exec(caminho);
  const mVar = reVariacoes.exec(caminho);
  const mDesfazer = reDesfazer.exec(caminho);
  const mResolver = reResolver.exec(caminho);
  const eh =
    caminho === "/api/pausa" || caminho === "/api/pausa/retomar" || caminho === "/api/plano" || caminho === "/api/plano/ativo" ||
    caminho === "/api/plano/previsao" || caminho === "/api/plano/confirmar" || caminho === "/api/fila/destravar" ||
    caminho === "/api/estoque/alertas" || caminho === "/api/estoque/leituras-para-saida" || mAprovar || mVar || mDesfazer || mResolver;
  if (!eh) return false;

  const db = deps.abrirBanco();
  const agora = deps.agora();
  try {
    // ---- parar tudo
    if (caminho === "/api/pausa" && metodo === "GET") {
      const estado = obterPausa(db);
      responderJson(res, 200, { ...estado, texto: estado.pausado ? textoPausa(estado) : "" });
      return true;
    }
    if (caminho === "/api/pausa" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const estado = pausarTudo(db, corpo["por"] as string, typeof corpo["motivo"] === "string" ? corpo["motivo"] : undefined, agora);
      responderJson(res, 200, { ...estado, texto: textoPausa(estado) });
      return true;
    }
    if (caminho === "/api/pausa/retomar" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const r = retomarTudo(db, corpo["por"] as string, agora);
      responderJson(res, 200, { ...r.estado, texto: "", reagendadas: r.reagendadas.length });
      return true;
    }

    // ---- grade
    if (caminho === "/api/plano" && metodo === "GET") {
      responderJson(res, 200, { plano: lerPlano(db) });
      return true;
    }
    if (caminho === "/api/plano" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      responderJson(res, 200, { plano: salvarPlano(db, { ativo: lerPlano(db).ativo, grades: corpo["grades"] }) });
      return true;
    }
    if (caminho === "/api/plano/ativo" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      responderJson(res, 200, { plano: definirPlanoAtivo(db, corpo["ativo"] === true) });
      return true;
    }
    if (caminho === "/api/plano/previsao" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const grades = Array.isArray(corpo["grades"]) ? corpo["grades"] : [];
      const montado = grades.length === 0 ? { ativo: false, grades: [] } : normalizarPlano({ ativo: true, grades });
      const p = await previsaoEmHtml(db, deps, { ...montado, ativo: lerPlano(db).ativo }, opcoesDeEncaixe(db, corpo));
      responderJson(res, 200, { html: p.html, total: p.total });
      return true;
    }
    if (caminho === "/api/plano/confirmar" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const plano = salvarPlano(db, { ativo: true, grades: corpo["grades"] });
      const r = await encaixarAprovados(db, aprovadosParaGrade(db), agora, opcoesDeEncaixe(db, corpo), depsAgendador(deps), plano);
      responderJson(res, 200, { plano, agendadas: r.agendadas.length, erros: r.erros.length });
      return true;
    }

    // ---- aprovar emendado no agendar
    if (mAprovar && metodo === "POST") {
      const id = Number(mAprovar[1]);
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const modo = (corpo["modo"] ?? "aprovar_e_decidir_depois") as ModoAprovar;
      const r = await aprovarComSugestao(db, id, modo, agora, opcoesDeEncaixe(db, corpo), depsAgendador(deps));
      const frases: Record<string, string> = {};
      if (r.video.caminhoMp4) {
        for (const s of r.sugestoes) {
          if (s.passa || s.bloqueios.length === 0) continue;
          try {
            const c = await medir(deps, r.video.caminhoMp4);
            frases[s.rede] = s.bloqueios.map((b) => localizarProblema(s.rede, b, c).mensagem).join(" ");
          } catch { /* sem o arquivo para medir, vale o motivo geral */ }
        }
      }
      responderJson(res, 200, { video: r.video, modo: r.modo, sugestoes: r.sugestoes, agendadas: r.agendadas.length, html: quadroAprovado(r, frases) });
      return true;
    }

    // ---- sugestões de variação
    if (mVar && metodo === "GET") {
      const id = Number(mVar[1]);
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const semente = Math.max(1, Math.floor(Number(url.searchParams.get("semente"))) || 1);
      const vistas = new Set((url.searchParams.get("vistas") ?? "").split(",").filter(Boolean));
      const video = obterVideo(db, id);
      if (!video) throw new ErroPortao(`vídeo ${id} não encontrado`);
      const lista = sugerirVariacoesDoVideo(db, id, 3 + vistas.size, semente).filter((c) => !vistas.has(chaveDaVariacao(c))).slice(0, 3);
      responderJson(res, 200, { html: botoesDeSugestoes(lista, escolhaAtual(video)), total: lista.length });
      return true;
    }

    // ---- desfazer a rejeição
    if (mDesfazer && metodo === "POST") {
      const r = desfazerRejeicao(db, Number(mDesfazer[1]), agora);
      responderJson(res, 200, { videoId: r.videoId });
      return true;
    }

    // ---- job travado
    if (caminho === "/api/fila/destravar" && metodo === "POST") {
      responderJson(res, 200, { destravados: destravarJobs(db, agora) });
      return true;
    }

    // ---- carro vendido
    if (caminho === "/api/estoque/alertas" && metodo === "GET") {
      responderJson(res, 200, { alertas: alertasPendentes(db) });
      return true;
    }
    if (mResolver && metodo === "POST") {
      const pub = Number(mResolver[1]);
      const existe = listarAlertasEstoque(db).some((a) => a.publicacaoId === pub && a.situacao === "tirar_do_ar");
      if (!existe) throw new ErroPortao("alerta não encontrado");
      definirAjuste(db, `${CHAVE_RESOLVIDO}${pub}`, agora.toISOString());
      responderJson(res, 200, { resolvido: pub });
      return true;
    }
    if (caminho === "/api/estoque/leituras-para-saida" && metodo === "GET") {
      responderJson(res, 200, { leituras: leiturasParaSaida(db) });
      return true;
    }
    if (caminho === "/api/estoque/leituras-para-saida" && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const n = typeof corpo["leituras"] === "number" ? corpo["leituras"] : Number.NaN;
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        responderJson(res, 400, { erro: t("estoque.erro.leituras") });
        return true;
      }
      definirLeiturasParaSaida(db, n);
      responderJson(res, 200, { leituras: n });
      return true;
    }
    return false;
  } catch (erro) {
    if (erro instanceof ErroPausa) {
      responderJson(res, 400, { erro: t("pausa.erro.semNome") });
      return true;
    }
    if (erro instanceof ErroDesfazer) {
      responderJson(res, 409, { erro: erro.message });
      return true;
    }
    if (erro instanceof ErroPublicacao) {
      responderJson(res, erro.status, { erro: mensagemDoPlano(erro), codigo: erro.codigo });
      return true;
    }
    throw erro;
  } finally {
    db.close();
  }
}
