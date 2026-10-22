// Rotas do motor de publicação (Etapa 6, parte A). As telas (parte B) só chamam estas.

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  agendarPublicacao, conectarConta, definirAprovacaoPlataforma, desconectarConta, desmarcarPublicacao, ErroPortao,
  ErroPublicacao, exigirRede, gravarLegenda, gravarTokensRenovados, lerCaracteristicas, listarCalendario, listarContas,
  listarLegendas, listarPublicacoesDoVideo, obterConta, obterPublicacao, obterPublicacaoDoPar, obterVideo,
  liberarParaNovaConferencia, recuperarPublicacoesOrfas, redigirSegredos, remarcarPublicacao, REDES, tokenPrecisaRenovar, type Publicacao, type Rede,
} from "@gerador/core";
import { ErroConfiguracaoProvedor, ErroProvedor } from "@gerador/escritor";
import { extrairIdDoCaminho, lerCorpoJson, responderJson } from "./http.js";
import { traduzirErro } from "./erros.js";
import { t, type Chave } from "./idioma/index.js";
import type { Dependencias } from "./rotas-acoes.js";
import {
  acharConector, aprovacaoExterno, conectarExterno, desconectarExterno, redeDeFilaAtiva, redesDeFilaAtivas,
} from "./conectores/index.js";
import { calcularProntidao } from "./publicacao/prontidao.js";
import { ErroLegenda, gerarLegendas } from "./publicacao/legendas.js";
import {
  executarPublicacao, fabricaPadrao, mensagemBloqueios, processarVencidas, validarPublicacaoDeMidia, type DepsPublicador, type Execucao,
} from "./publicacao/publicador.js";

function depsPublicador(deps: Dependencias): DepsPublicador {
  return {
    agora: deps.agora,
    ...(deps.fabricaRede ? { fabrica: deps.fabricaRede } : {}),
    ...(deps.lerMidia ? { lerMidia: deps.lerMidia } : {}),
    ...(deps.envPublicacao ? { env: deps.envPublicacao } : {}),
    ...(deps.fetchRede ? { fetch: deps.fetchRede } : {}),
    ...(deps.fonteConferencia ? { fonteConferencia: deps.fonteConferencia } : {}),
  };
}

/** Ao subir o servidor: o que ficou 'publicando' vira 'verificar'. */
export function recuperarAoSubir(deps: Dependencias): number {
  const db = deps.abrirBanco();
  try {
    return recuperarPublicacoesOrfas(db, deps.agora());
  } finally {
    db.close();
  }
}

/** Passo do worker (timer do servidor e POST /api/publicacoes/processar). */
export async function passoDoPublicador(deps: Dependencias) {
  const db = deps.abrirBanco();
  try {
    return await processarVencidas(db, depsPublicador(deps));
  } finally {
    db.close();
  }
}

const reVideo = /^\/api\/videos\/(\d+)\/(validacao|legendas|publicacoes|publicar)$/;
const reLegendaRede = /^\/api\/videos\/(\d+)\/legendas\/(\w+)$/;
const reLegendaGerar = /^\/api\/videos\/(\d+)\/legendas\/gerar$/;
const reConta = /^\/api\/contas\/(\w+)\/(conectar|desconectar|renovar|aprovacao)$/;
const reCal = /^\/api\/calendario\/(\d+)\/(desmarcar|remarcar|publicar-agora|conferir-de-novo)$/;

function statusDaExecucao(e: Execucao): number {
  switch (e.resultado) {
    case "publicada": case "ja_publicada": return 200;
    case "em_andamento": case "tentara_de_novo": return 202;
    case "adiada_limite": return 429;
    case "falhou": return 422;
    case "barrada": return 200;
  }
}

function corpoDaExecucao(e: Execucao) {
  return {
    resultado: e.resultado,
    simulado: e.publicacao.simulado,
    ...(e.motivo ? { motivo: e.motivo } : {}),
    ...(e.resultado === "adiada_limite" ? { codigo: "limite_diario" } : {}),
    ...(e.resultado === "barrada" ? { codigo: "conferencia", estado: e.conferencia?.estado, titulo: t(`conf.titulo.${e.conferencia?.estado ?? "nao_conferiu"}` as Chave) } : {}),
    publicacao: e.publicacao,
  };
}

export async function tratarRotaPublicacao(
  caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias,
): Promise<boolean> {
  const mp = reVideo.exec(caminho);
  const mLeg = reLegendaRede.exec(caminho);
  const mGerar = reLegendaGerar.exec(caminho);
  const mConta = reConta.exec(caminho);
  const mCal = reCal.exec(caminho);
  const eh =
    caminho === "/api/contas" || caminho === "/api/prontidao" || caminho === "/api/calendario" ||
    caminho === "/api/calendario/agendar" || caminho === "/api/publicacoes/processar" || mp || mLeg || mGerar || mConta || mCal;
  if (!eh) return false;

  const db = deps.abrirBanco();
  const dp = depsPublicador(deps);
  const env = deps.envPublicacao ?? process.env;
  const agora = deps.agora();
  try {
    // ---- contas
    if (caminho === "/api/contas" && metodo === "GET") {
      responderJson(res, 200, { contas: listarContas(db) });
      return true;
    }
    if (mConta && metodo === "POST" && !(REDES as readonly string[]).includes(mConta[1]!)) {
      // Conector que o núcleo ainda não conhece: a conta (só modo seco) fica nos ajustes.
      const id = mConta[1]!;
      const acao = mConta[2];
      if (!acharConector(id)) throw new ErroPublicacao(t("erro.conectorDesconhecido"), 404, "conector_inexistente");
      if (acao === "conectar") responderJson(res, 200, { conta: conectarExterno(db, id, (await lerCorpoJson(req)) as Record<string, unknown>, agora) });
      else if (acao === "desconectar") responderJson(res, 200, { conta: desconectarExterno(db, id) });
      else if (acao === "aprovacao") {
        const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
        if (typeof corpo["aprovada"] !== "boolean") throw new ErroPublicacao(t("erro.aprovadaInvalida"), 400, "aprovada_invalida");
        responderJson(res, 200, { conta: aprovacaoExterno(db, id, corpo["aprovada"]) });
      } else throw new ErroPublicacao(t("core.naoConectada", { rede: id }), 409, "sem_token");
      return true;
    }
    if (mConta && metodo === "POST") {
      const rede = exigirRede(mConta[1]);
      const acao = mConta[2];
      if (acao === "conectar") {
        const conta = conectarConta(db, rede, (await lerCorpoJson(req)) as Record<string, unknown>, agora);
        responderJson(res, 200, { conta });
      } else if (acao === "desconectar") {
        responderJson(res, 200, { conta: desconectarConta(db, rede) });
      } else if (acao === "aprovacao") {
        const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
        if (typeof corpo["aprovada"] !== "boolean") throw new ErroPublicacao(t("erro.aprovadaInvalida"), 400, "aprovada_invalida");
        responderJson(res, 200, { conta: definirAprovacaoPlataforma(db, rede, corpo["aprovada"], agora) });
      } else {
        const conta = obterConta(db, rede);
        if (!conta.conectada) throw new ErroPublicacao(t("core.naoConectada", { rede }), 409, "nao_conectada");
        const fabrica = dp.fabrica ?? fabricaPadrao(dp);
        const novos = await fabrica(rede, db, deps.agora).renovarToken();
        gravarTokensRenovados(db, rede, novos, agora); // o novo (e o refresh rotacionado) é gravado SEMPRE
        responderJson(res, 200, { conta: obterConta(db, rede), renovado: true, rotacionouRefresh: novos.refreshToken !== undefined });
      }
      return true;
    }

    // ---- prontidão
    if (caminho === "/api/prontidao" && metodo === "GET") {
      let chaveIa = true;
      try { deps.criarProvedor(); } catch (e) { if (e instanceof ErroConfiguracaoProvedor) chaveIa = false; }
      responderJson(res, 200, { redes: calcularProntidao(db, env, agora), legendaPorIa: { ok: chaveIa, falta: chaveIa ? undefined : t("erro.definaChaveIa") } });
      return true;
    }

    // ---- por vídeo
    if (mp && metodo === "GET" && mp[2] === "validacao") {
      const v = obterVideo(db, Number(mp[1]));
      if (!v) throw new ErroPublicacao(t("core.videoNaoEncontradoSemId"), 404, "video_inexistente");
      if (!v.caminhoMp4) throw new ErroPublicacao(t("erro.semMp4"), 409, "sem_mp4");
      let c;
      try { c = await (dp.lerMidia ?? lerCaracteristicas)(v.caminhoMp4); } catch (e) {
        throw new ErroPublicacao(e instanceof Error ? e.message : String(e), 422, "midia_ilegivel");
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const vis = url.searchParams.get("visibilidade") === "privada" ? "privada" : "publica";
      responderJson(res, 200, {
        caracteristicas: c,
        redes: redesDeFilaAtivas(db).map((r) => validarPublicacaoDeMidia(r, c, obterConta(db, r), vis)),
      });
      return true;
    }
    if (mp && metodo === "GET" && mp[2] === "publicacoes") {
      responderJson(res, 200, { publicacoes: listarPublicacoesDoVideo(db, Number(mp[1])) });
      return true;
    }
    if (mp && metodo === "GET" && mp[2] === "legendas") {
      responderJson(res, 200, { legendas: listarLegendas(db, Number(mp[1])) });
      return true;
    }
    if (mGerar && metodo === "POST") {
      const id = Number(mGerar[1]);
      let provedor;
      try { provedor = deps.criarProvedor(); } catch (e) {
        if (e instanceof ErroConfiguracaoProvedor) {
          responderJson(res, 503, { erro: e.message, codigo: "chave_ausente" });
          return true;
        }
        throw e;
      }
      try {
        responderJson(res, 200, await gerarLegendas(db, id, provedor, agora));
      } catch (e) {
        if (e instanceof ErroProvedor || e instanceof ErroLegenda) {
          responderJson(res, 502, { erro: e.message, codigo: "escritor_falhou" });
          return true;
        }
        throw e;
      }
      return true;
    }
    if (mLeg && metodo === "POST") {
      const rede = exigirRede(mLeg[2]);
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      if (typeof corpo["texto"] !== "string") throw new ErroPublicacao(t("erro.campoTexto"), 400, "texto_ausente");
      responderJson(res, 200, { legenda: gravarLegenda(db, Number(mLeg[1]), rede, corpo["texto"], true, agora) });
      return true;
    }

    // ---- agendar / publicar
    if ((caminho === "/api/calendario/agendar" || (mp && mp[2] === "publicar")) && metodo === "POST") {
      const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
      const agoraAgenda = mp !== null;
      const videoId = mp ? Number(mp[1]) : Number(corpo["videoId"]);
      if (!Number.isInteger(videoId)) throw new ErroPublicacao(t("erro.campoVideoId"), 400, "video_ausente");
      const rede = exigirRede(corpo["rede"]);
      if (!redeDeFilaAtiva(db, rede)) {
        throw new ErroPublicacao(t("erro.redeDesligada", { rede: acharConector(rede)?.nome ?? rede }), 409, "rede_desligada");
      }

      if (agoraAgenda) {
        const ja = obterPublicacaoDoPar(db, videoId, rede);
        if (ja?.estado === "publicada") {
          responderJson(res, 200, corpoDaExecucao({ resultado: "ja_publicada", publicacao: ja })); // idempotência
          return true;
        }
      }
      const entrada = {
        videoId, rede, quando: agoraAgenda ? agora.toISOString() : corpo["quando"],
        ...(corpo["iaGerado"] !== undefined ? { iaGerado: corpo["iaGerado"] } : {}),
        ...(corpo["visibilidade"] !== undefined ? { visibilidade: corpo["visibilidade"] } : {}),
      };
      if (rede === "tiktok" && corpo["visibilidade"] !== "publica" && corpo["visibilidade"] !== "privada") {
        throw new ErroPublicacao(t("erro.tiktokVisibilidade"), 400, "visibilidade_obrigatoria");
      }
      const existente = obterPublicacaoDoPar(db, videoId, rede);
      let pub: Publicacao;
      if (agoraAgenda && existente?.estado === "agendada") {
        pub = existente; // publicar agora uma já agendada
      } else {
        // validação por rede ANTES de entrar no calendário
        const v = obterVideo(db, videoId);
        if (v?.caminhoMp4 && (v.estado === "aprovado" || v.estado === "publicado")) {
          let c;
          try { c = await (dp.lerMidia ?? lerCaracteristicas)(v.caminhoMp4); } catch (e) {
            throw new ErroPublicacao(e instanceof Error ? e.message : String(e), 422, "midia_ilegivel");
          }
          const vis = corpo["visibilidade"] === "privada" ? "privada" : "publica";
          const val = validarPublicacaoDeMidia(rede, c, obterConta(db, rede), vis);
          if (!val.ok) throw new ErroPublicacao(t("erro.videoBarrado", { motivo: mensagemBloqueios(val) }), 422, "midia_invalida", { validacao: val });
        }
        pub = agendarPublicacao(db, entrada, agora, { permitirPassado: agoraAgenda });
      }
      if (!agoraAgenda) {
        responderJson(res, 201, { publicacao: pub });
        return true;
      }
      const e = await executarPublicacao(db, dp, pub.id);
      responderJson(res, statusDaExecucao(e), corpoDaExecucao(e));
      return true;
    }

    // ---- calendário
    if (caminho === "/api/calendario" && metodo === "GET") {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const de = url.searchParams.get("de");
      const ate = url.searchParams.get("ate");
      if (!de || !ate || Number.isNaN(Date.parse(de)) || Number.isNaN(Date.parse(ate))) {
        throw new ErroPublicacao(t("erro.periodo"), 400, "periodo_invalido");
      }
      responderJson(res, 200, { itens: listarCalendario(db, new Date(de).toISOString(), new Date(ate).toISOString()) });
      return true;
    }
    if (mCal && metodo === "POST") {
      const id = Number(mCal[1]);
      if (mCal[2] === "desmarcar") responderJson(res, 200, { publicacao: desmarcarPublicacao(db, id, agora) });
      else if (mCal[2] === "conferir-de-novo") {
        const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
        const espera = corpo["esperaMin"];
        if (typeof espera !== "number" || !Number.isFinite(espera) || espera < 0 || espera > 24 * 60) {
          throw new ErroPublicacao(t("erro.esperaConferencia"), 400, "espera_invalida");
        }
        const alvo = obterPublicacao(db, id);
        if (!alvo) throw new ErroPublicacao(t("erro.publicacaoNaoEncontrada"), 404, "publicacao_inexistente");
        if (alvo.estado !== "agendada") throw new ErroPublicacao(t("erro.conferenciaNada"), 409, "conferencia_inexistente");
        // Limpa o resultado e adia por `espera` minutos. Não gasta tentativa e não vira falha.
        liberarParaNovaConferencia(db, id, espera, agora);
        responderJson(res, 200, { publicacao: obterPublicacao(db, id) });
      } else if (mCal[2] === "remarcar") {
        const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
        responderJson(res, 200, { publicacao: remarcarPublicacao(db, id, corpo["quando"], agora) });
      } else {
        if (!obterPublicacao(db, id)) throw new ErroPublicacao(t("erro.publicacaoNaoEncontrada"), 404, "publicacao_inexistente");
        const e = await executarPublicacao(db, dp, id);
        responderJson(res, statusDaExecucao(e), corpoDaExecucao(e));
      }
      return true;
    }
    if (caminho === "/api/publicacoes/processar" && metodo === "POST") {
      responderJson(res, 200, await processarVencidas(db, dp));
      return true;
    }
    return false;
  } catch (e) {
    if (e instanceof ErroPublicacao) {
      responderJson(res, e.status, { erro: traduzirErro(e.message), codigo: e.codigo, ...e.extra });
      return true;
    }
    if (e instanceof ErroPortao) {
      responderJson(res, 400, { erro: traduzirErro(e.message) });
      return true;
    }
    // Inesperado: log e resposta SEM segredo.
    const msg = redigirSegredos(db, e instanceof Error ? e.message : String(e));
    console.error("publicação:", msg);
    responderJson(res, 500, { erro: t("erro.interno") });
    return true;
  } finally {
    db.close();
  }
}

// reexporta para o servidor
export { extrairIdDoCaminho };
