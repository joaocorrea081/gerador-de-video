// Orquestração da fila de publicação. Uma execução = uma tentativa de uma
// publicação (vídeo, rede). Garantias:
//  - idempotência: a linha UNIQUE(video, rede) + reivindicação atômica;
//    publicada nunca volta a publicar; 'publicando' órfão vira 'verificar'.
//  - falha é normal: transitória volta com espera crescente, permanente para.
//  - segredo nunca no erro gravado (redigirSegredos).

import { basename } from "node:path";
import { existsSync } from "node:fs";
import {
  adiarPublicacao, contarUltimas24h, ErroPublicacao, gravarTokensRenovados, LIMITE_DIARIO_FIXO, lerAjusteNumero,
  lerAjusteTexto, lerCaracteristicas, lerSegredosConta, marcarPublicada, NOMES_REDE, obterConta, obterPublicacao,
  obterVideo, publicacoesVencidas, reivindicarPublicacao, registrarFalhaPublicacao, redigirSegredos,
  tokenPrecisaRenovar, validarMidiaParaRede, gravarAjuste,
  type CaracteristicasMidia, type ContaRede, type Publicacao, type Rede, type ResultadoValidacao,
} from "@gerador/core";
import type Database from "better-sqlite3";
import { localeDe, tOpcional } from "../idioma/index.js";
import { resolverLegenda } from "./legendas.js";
import {
  ErroRede, FacebookReal, InstagramReal, ProvedorFalso, TikTokReal, type FetchLike, type ProvedorRede,
} from "./provedores.js";

export type FabricaProvedores = (rede: Rede, db: Database.Database, agora: () => Date) => ProvedorRede;

export interface DepsPublicador {
  agora(): Date;
  fabrica?: FabricaProvedores;
  lerMidia?: (caminho: string) => Promise<CaracteristicasMidia>;
  env?: Record<string, string | undefined>;
  fetch?: FetchLike;
}

const HORA_MS = 3_600_000;
const IG_LIMITE_SECO_PADRAO = 50; // o menor dos dois números que a documentação da Meta cita

/** URL pública base: ajuste publicacao.url_publica, ou GERADOR_URL_PUBLICA. */
export function urlPublicaBase(db: Database.Database, env: Record<string, string | undefined>): string | null {
  const v = lerAjusteTexto(db, "publicacao.url_publica") || env["GERADOR_URL_PUBLICA"];
  return v ? v.replace(/\/+$/, "") : null;
}

export function fabricaPadrao(deps: Pick<DepsPublicador, "env" | "fetch">): FabricaProvedores {
  const env = deps.env ?? process.env;
  const f: FetchLike = deps.fetch ?? fetch;
  return (rede, db, agora) => {
    const conta = obterConta(db, rede);
    if (!conta.conectada || conta.modo === null) {
      throw new ErroPublicacao(`${NOMES_REDE[rede]} não está conectado.`, 409, "nao_conectada");
    }
    if (conta.modo === "seco") {
      const chaveFalha = `seco.falhar.${rede}`;
      return new ProvedorFalso(rede, {
        usadoNas24h: (excluir) => contarUltimas24h(db, rede, agora(), excluir).total,
        limiteTotal:
          rede === "instagram" ? lerAjusteNumero(db, "seco.ig_limite", IG_LIMITE_SECO_PADRAO) : (LIMITE_DIARIO_FIXO[rede] ?? null),
        agora,
        jaPublicada: (chave) =>
          (db.prepare("SELECT 1 AS x FROM publicacao WHERE chave_idempotencia = ? AND estado = 'publicada'").get(chave) as unknown) !== undefined,
        consumirFalha: () => {
          const n = lerAjusteNumero(db, chaveFalha, 0);
          if (n <= 0) return null;
          gravarAjuste(db, chaveFalha, String(n - 1));
          return "temporario";
        },
      });
    }
    const seg = lerSegredosConta(db, rede);
    const token = seg.accessToken ?? "";
    if (rede === "instagram") return new InstagramReal({ contaId: conta.contaId ?? "", token }, f);
    if (rede === "facebook") return new FacebookReal({ paginaId: conta.contaId ?? "", token }, f);
    return new TikTokReal({ token, refreshToken: seg.refreshToken, clientKey: env["TIKTOK_CLIENT_KEY"], clientSecret: env["TIKTOK_CLIENT_SECRET"] }, f);
  };
}

export type ResultadoExecucao =
  | "publicada" | "ja_publicada" | "em_andamento" | "adiada_limite" | "tentara_de_novo" | "falhou";

export interface Execucao {
  resultado: ResultadoExecucao;
  publicacao: Publicacao;
  motivo?: string;
}

/**
 * As regras são do núcleo (core/midia.ts); o texto sai no idioma da requisição. O núcleo identifica cada
 * problema por rede + código, então a frase vem do catálogo (midia.<rede>.<código>) com os números medidos no arquivo.
 * Sem tradução para o par, fica a frase original do núcleo.
 */
function localizarProblema(rede: Rede, p: { codigo: string; mensagem: string }, c: CaracteristicasMidia): { codigo: string; mensagem: string } {
  const um = new Intl.NumberFormat(localeDe(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const params = {
    dur: um.format(c.duracaoSegundos),
    mb: (c.tamanhoBytes / 1048576).toFixed(0),
    w: c.largura,
    h: c.altura,
    codecVideo: c.codecVideo.toUpperCase(),
    codecAudio: (c.codecAudio ?? "").toUpperCase(),
    fps: c.fps.toFixed(0),
  };
  return { codigo: p.codigo, mensagem: tOpcional(`midia.${rede}.${p.codigo}`, params) ?? p.mensagem };
}

export function validarPublicacaoDeMidia(
  rede: Rede, c: CaracteristicasMidia, conta: ContaRede, visibilidade: "publica" | "privada",
): ResultadoValidacao {
  const r = validarMidiaParaRede(rede, c, { auditoriaAprovada: conta.aprovacaoPlataforma, visibilidade });
  return { ...r, bloqueios: r.bloqueios.map((p) => localizarProblema(rede, p, c)), avisos: r.avisos.map((p) => localizarProblema(rede, p, c)) };
}

export function mensagemBloqueios(v: ResultadoValidacao): string {
  return v.bloqueios.map((b) => b.mensagem).join(" ");
}

export async function executarPublicacao(db: Database.Database, deps: DepsPublicador, id: number): Promise<Execucao> {
  const agora = () => deps.agora();
  const env = deps.env ?? process.env;
  const fabrica = deps.fabrica ?? fabricaPadrao(deps);
  const lerMidia = deps.lerMidia ?? lerCaracteristicas;

  const p0 = obterPublicacao(db, id);
  if (!p0) throw new ErroPublicacao(`publicação ${id} não encontrada`, 404, "publicacao_inexistente");
  if (p0.estado === "publicada") return { resultado: "ja_publicada", publicacao: p0 };
  if (p0.estado === "publicando") return { resultado: "em_andamento", publicacao: p0 };
  if (p0.estado !== "agendada") {
    throw new ErroPublicacao(`Publicação "${p0.estado}" não pode ser executada. Remarque primeiro.`, 409, "estado_invalido");
  }
  if (!reivindicarPublicacao(db, id, agora())) {
    return { resultado: "em_andamento", publicacao: obterPublicacao(db, id)! };
  }

  const falha = (msg: string, transitorio: boolean): Execucao => {
    const p = registrarFalhaPublicacao(db, id, redigirSegredos(db, msg), transitorio, agora());
    return { resultado: p.estado === "falhou" ? "falhou" : "tentara_de_novo", publicacao: p, motivo: p.erro ?? msg };
  };

  try {
    const rede = p0.rede;
    const nome = NOMES_REDE[rede];
    const video = obterVideo(db, p0.videoId);
    if (!video || (video.estado !== "aprovado" && video.estado !== "publicado")) {
      return falha("O vídeo não está mais aprovado; nada foi publicado.", false);
    }
    if (!video.caminhoMp4 || !existsSync(video.caminhoMp4)) return falha("O arquivo MP4 do vídeo não existe no disco.", false);
    let conta = obterConta(db, rede);
    if (!conta.conectada) return falha(`${nome} não está conectado.`, false);

    // validação por rede, de novo na hora de sair
    const caracteristicas = await lerMidia(video.caminhoMp4);
    const v = validarPublicacaoDeMidia(rede, caracteristicas, conta, p0.visibilidade);
    if (!v.ok) return falha(`Vídeo barrado antes de sair: ${mensagemBloqueios(v)}`, false);

    let provedor = fabrica(rede, db, agora);

    // renovação de token: o token novo (e o refresh rotacionado) É GRAVADO aqui.
    if (conta.modo === "real" && tokenPrecisaRenovar(conta, agora())) {
      try {
        const novos = await provedor.renovarToken();
        gravarTokensRenovados(db, rede, novos, agora());
        conta = obterConta(db, rede);
        provedor = fabrica(rede, db, agora);
      } catch (e) {
        if (conta.tokenExpiraEm && Date.parse(conta.tokenExpiraEm) <= agora().getTime()) {
          return falha(`O token do ${nome} expirou e não foi possível renovar. Reconecte a conta.`, false);
        }
        // token ainda vale: segue com ele
        void e;
      }
    }

    // limite diário
    const consultado = await provedor.consultarLimite(p0.chaveIdempotencia);
    const limite = consultado ?? (LIMITE_DIARIO_FIXO[rede] !== undefined
      ? { usado: contarUltimas24h(db, rede, agora(), p0.chaveIdempotencia).total, total: LIMITE_DIARIO_FIXO[rede]! }
      : null);
    if (limite && limite.usado >= limite.total) {
      const maisAntigo = contarUltimas24h(db, rede, agora()).maisAntigoMs;
      const ate = maisAntigo !== null ? maisAntigo + 24 * HORA_MS : agora().getTime() + HORA_MS;
      const motivo = `Limite diário do ${nome} atingido (${limite.usado} de ${limite.total} em 24h). Vai tentar de novo quando abrir vaga.`;
      return { resultado: "adiada_limite", publicacao: adiarPublicacao(db, id, ate, motivo, agora()), motivo };
    }

    const base = urlPublicaBase(db, env);
    const legenda = resolverLegenda(db, p0.videoId, rede);
    const r = await provedor.publicar({
      chaveIdempotencia: p0.chaveIdempotencia,
      caminhoArquivo: video.caminhoMp4,
      urlMidia: base ? `${base}/${basename(video.caminhoMp4)}` : null,
      legenda,
      iaGerado: p0.iaGerado,
      visibilidade: p0.visibilidade,
    });
    const publicada = marcarPublicada(db, id, { idExterno: r.idExterno, simulado: r.simulado, legenda }, agora());
    return { resultado: "publicada", publicacao: publicada };
  } catch (e) {
    if (e instanceof ErroRede) {
      if (e.codigo === "limite") {
        const motivo = redigirSegredos(db, e.message);
        return { resultado: "adiada_limite", publicacao: adiarPublicacao(db, id, agora().getTime() + HORA_MS, motivo, agora()), motivo };
      }
      return falha(e.message, e.transitorio);
    }
    // Erro inesperado: não repete (poderia duplicar). Fica 'falhou', legível e sem segredo.
    return falha(e instanceof Error ? e.message : String(e), false);
  }
}

export interface ResumoProcessamento {
  verificadas: number;
  resultados: { publicacaoId: number; rede: Rede; resultado: ResultadoExecucao }[];
}

/** Um passo do worker: executa todas as publicações vencidas, uma por vez. */
export async function processarVencidas(db: Database.Database, deps: DepsPublicador): Promise<ResumoProcessamento> {
  const vencidas = publicacoesVencidas(db, deps.agora());
  const resultados: ResumoProcessamento["resultados"] = [];
  for (const p of vencidas) {
    const r = await executarPublicacao(db, deps, p.id);
    resultados.push({ publicacaoId: p.id, rede: p.rede, resultado: r.resultado });
  }
  return { verificadas: vencidas.length, resultados };
}
