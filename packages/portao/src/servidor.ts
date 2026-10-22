import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  abrirBanco,
  aprovarVideo,
  carregarConfig,
  contarRejeicoesPorMotivo,
  contarTabelas,
  definirAjuste,
  lerAgendamento,
  listarEstoque,
  listarCalendario,
  listarContas,
  listarPublicacoesDoVideo,
  espacamentoMinutos,
  progressoFila,
  ErroPortao,
  listarAjustes,
  listarVideosPorEstado,
  MOTIVOS_REJEICAO,
  obterVideo,
  rejeitarVideo,
  type Video,
} from "@gerador/core";
import type Database from "better-sqlite3";
import { extrairIdDoCaminho, lerCorpoJson, responderJson } from "./http.js";
import { clienteJs } from "./cliente.js";
import { traduzirErro } from "./erros.js";
import { comIdioma, idiomaAtual, idiomaDoCookie, t } from "./idioma/index.js";
import { ESTILO } from "./estilo.js";
import {
  paginaAgendamento,
  paginaAjustes,
  paginaEstoque,
  paginaFila,
  paginaHistorico,
} from "./paginas.js";
import {
  paginaCalendario, paginaContas, paginaProntidao, paginaPublicacoes, parametrosCalendario, periodoDoCalendario,
  type VideoComPublicacoes,
} from "./paginas-publicacao.js";
import { calcularContadores, dadosRedes, iaDisponivel } from "./dados-telas.js";
import { calcularProntidao } from "./publicacao/prontidao.js";
import { inicioDoDiaUtc, somarDias, ymdBrasilia } from "./tempo.js";
import { passoDoPublicador, recuperarAoSubir, tratarRotaPublicacao } from "./rotas-publicacao.js";
import { dadosIA, tratarRotaIA } from "./ia.js";
import { paginaSites, tratarRotaSites } from "./sites.js";
import { listarSites } from "@gerador/leitor";
import { dependenciasPadrao, rodarSeVencido, tratarRotaAcao, type Dependencias } from "./rotas-acoes.js";

/** Remove a barra final, exceto quando o caminho é só "/". */
function normalizarCaminho(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function responderHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

interface VideoComProduto {
  id: number;
  estado: string;
  titulo: string | null;
  corpo: string | null;
  fundo: string | null;
  ritmo: string | null;
  caminhoMp4: string | null;
  criadoEm: string;
  atualizadoEm: string;
  quantidadeFotos: number;
  ordemFotos: number[];
  /** Motivos de vídeos rejeitados do mesmo carro, para o Histórico. */
  rejeicoesAnteriores: string[];
  produto: Record<string, unknown> | null;
}

/** Arquivos do tema ficam em src/tema; o tsc não copia CSS para dist, então procura nos dois lugares. */
const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTAS_TEMA = [join(AQUI, "tema"), join(AQUI, "..", "src", "tema")];
const ARQUIVOS_TEMA = new Set([
  "dsh-base.css",
  "design-platform.css",
  "elevacao.css",
  "focus.css",
  "scrollbar.css",
  "corner-shape.css",
]);

function lerArquivoTema(nome: string): string | undefined {
  if (!ARQUIVOS_TEMA.has(nome)) return undefined;
  for (const pasta of PASTAS_TEMA) {
    const caminho = join(pasta, nome);
    if (existsSync(caminho)) return readFileSync(caminho, "utf8");
  }
  return undefined;
}

function responderTexto(res: ServerResponse, tipo: string, texto: string): void {
  res.writeHead(200, { "Content-Type": `${tipo}; charset=utf-8`, "Cache-Control": "no-cache", Vary: "Cookie" });
  res.end(texto);
}

const contadoresDe = calcularContadores;

function nomeDoVideo(v: VideoComProduto): string {
  const p = v.produto as { marca?: string; modelo?: string; ano?: number } | null;
  const carro = [p?.marca, p?.modelo, p?.ano].filter(Boolean).join(" ");
  return `#${v.id} — ${v.titulo ?? (carro || t("pub.videoN", { id: v.id }))}`;
}

function anexarProduto(db: Database.Database, video: Video): VideoComProduto {
  let ordem: number[] = [];
  try {
    ordem = video.ordemFotosJson ? (JSON.parse(video.ordemFotosJson) as number[]) : [];
  } catch {
    ordem = [];
  }
  const linha = db.prepare("SELECT dados_json FROM produto WHERE id = ?").get(video.produtoId) as
    | { dados_json: string }
    | undefined;
  return {
    id: video.id,
    estado: video.estado,
    titulo: video.titulo,
    corpo: video.corpo,
    fundo: video.fundo,
    ritmo: video.ritmo,
    caminhoMp4: video.caminhoMp4,
    criadoEm: video.criadoEm,
    atualizadoEm: video.atualizadoEm,
    quantidadeFotos: (
      db.prepare("SELECT COUNT(*) AS n FROM foto WHERE produto_id = ? AND caminho_local IS NOT NULL").get(video.produtoId) as {
        n: number;
      }
    ).n,
    ordemFotos: ordem,
    rejeicoesAnteriores: (
      db
        .prepare(
          `SELECT r.motivo FROM rejeicao r JOIN video v ON v.id = r.video_id
           WHERE v.produto_id = ? AND v.id <> ? ORDER BY r.id`,
        )
        .all(video.produtoId, video.id) as { motivo: string }[]
    ).map((r) => r.motivo),
    produto: linha ? JSON.parse(linha.dados_json) : null,
  };
}

/** Cada requisição roda no idioma do cookie (padrão: inglês); t() e os formatadores leem dele. */
function tratarRequisicao(req: IncomingMessage, res: ServerResponse, deps: Dependencias): Promise<void> {
  return comIdioma(idiomaDoCookie(req.headers.cookie), () => tratarRequisicaoNoIdioma(req, res, deps));
}

async function tratarRequisicaoNoIdioma(req: IncomingMessage, res: ServerResponse, deps: Dependencias): Promise<void> {
  // A base é só para o parser do URL resolver caminho relativo; não é usada de outra forma.
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const caminho = normalizarCaminho(url.pathname);
  const metodo = req.method ?? "GET";

  try {
    // --- Telas ---
    if (caminho === "/" && metodo === "GET") {
      res.writeHead(302, { Location: "/fila" });
      res.end();
      return;
    }

    if (caminho === "/painel.css" && metodo === "GET") {
      responderTexto(res, "text/css", ESTILO);
      return;
    }
    if (caminho === "/painel.js" && metodo === "GET") {
      responderTexto(res, "text/javascript", clienteJs(idiomaAtual()));
      return;
    }
    if (caminho.startsWith("/tema/") && caminho.endsWith(".css") && metodo === "GET") {
      const css = lerArquivoTema(caminho.slice("/tema/".length));
      if (css === undefined) {
        responderJson(res, 404, { erro: t("erro.naoEncontrado") });
        return;
      }
      responderTexto(res, "text/css", css);
      return;
    }

    if (caminho === "/fila" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const ia = iaDisponivel(deps);
        const brutos = listarVideosPorEstado(db, ["rascunho", "renderizando", "aguardando_aprovacao", "erro"]);
        const videos = [];
        for (const b of brutos) videos.push({ ...anexarProduto(db, b), redes: await dadosRedes(db, b, deps, ia) });
        responderHtml(res, 200, paginaFila(videos as never, progressoFila(db, deps.agora()), contadoresDe(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/estoque" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        responderHtml(res, 200, paginaEstoque(listarEstoque(db), contadoresDe(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/historico" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const ia = iaDisponivel(deps);
        const videos = [];
        for (const b of listarVideosPorEstado(db, ["aprovado", "publicado"])) {
          videos.push({ ...anexarProduto(db, b), redes: await dadosRedes(db, b, deps, ia) });
        }
        responderHtml(res, 200, paginaHistorico(videos as never, contadoresDe(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/agendamento" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const agora = deps.agora();
        responderHtml(res, 200, paginaAgendamento(lerAgendamento(db, agora), agora, contadoresDe(db), listarSites(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/calendario" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const agora = deps.agora();
        const hoje = ymdBrasilia(agora);
        const { visao, ancora } = parametrosCalendario(url.searchParams.get("visao"), url.searchParams.get("data"), hoje);
        const { inicio, fim } = periodoDoCalendario(visao, ancora);
        const videos = listarVideosPorEstado(db, ["aprovado", "publicado"])
          .filter((v) => v.caminhoMp4)
          .map((v) => anexarProduto(db, v));
        const sel = Number(url.searchParams.get("video"));
        responderHtml(
          res,
          200,
          paginaCalendario({
            visao, ancora, hoje,
            itens: listarCalendario(db, inicioDoDiaUtc(inicio), inicioDoDiaUtc(somarDias(fim, 1))),
            videos: videos.map((v) => ({ id: v.id, nome: nomeDoVideo(v) })),
            contas: listarContas(db),
            espacamentoMin: espacamentoMinutos(db),
            videoSelecionado: Number.isInteger(sel) && videos.some((v) => v.id === sel) ? sel : null,
            contadores: contadoresDe(db),
          }),
        );
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/publicacoes" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const videos: VideoComPublicacoes[] = listarVideosPorEstado(db, ["aprovado", "publicado"]).map((b) => {
          const v = anexarProduto(db, b);
          return { id: v.id, nome: nomeDoVideo(v), estado: v.estado, publicacoes: listarPublicacoesDoVideo(db, v.id) };
        });
        const andando = videos.some((v) => v.publicacoes.some((p) => p.estado === "publicando" || p.estado === "verificar"));
        responderHtml(res, 200, paginaPublicacoes(videos, contadoresDe(db), andando));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/contas" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        responderHtml(res, 200, paginaContas(listarContas(db), deps.agora(), contadoresDe(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/prontidao" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        const ok = iaDisponivel(deps);
        responderHtml(
          res,
          200,
          paginaProntidao(
            calcularProntidao(db, deps.envPublicacao ?? process.env, deps.agora()),
            { ok, falta: ok ? undefined : t("pront.legendaIaFalta") },
            contadoresDe(db),
          ),
        );
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/sites" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        responderHtml(res, 200, paginaSites(listarSites(db), contadoresDe(db)));
      } finally {
        db.close();
      }
      return;
    }

    if (caminho === "/ajustes" && metodo === "GET") {
      res.writeHead(301, { Location: "/configuracoes" });
      res.end();
      return;
    }

    if (caminho === "/configuracoes" && metodo === "GET") {
      const db = deps.abrirBanco();
      try {
        responderHtml(
          res,
          200,
          paginaAjustes(listarAjustes(db), contarRejeicoesPorMotivo(db), dadosIA(listarAjustes(db), deps.envIA ?? process.env), contadoresDe(db)),
        );
      } finally {
        db.close();
      }
      return;
    }

    // --- Vídeo servido por HTTP, para o player da Fila/Histórico ---
    if (caminho.startsWith("/video/") && caminho.endsWith(".mp4") && metodo === "GET") {
      const id = extrairIdDoCaminho(caminho, "/video/", ".mp4");
      if (id === undefined) {
        responderJson(res, 404, { erro: t("erro.naoEncontrado") });
        return;
      }
      const db = abrirBanco();
      const video = obterVideo(db, id);
      db.close();
      if (!video?.caminhoMp4 || !existsSync(video.caminhoMp4)) {
        responderJson(res, 404, { erro: t("erro.videoNoDisco") });
        return;
      }
      const tamanho = statSync(video.caminhoMp4).size;
      res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": tamanho });
      createReadStream(video.caminhoMp4).pipe(res);
      return;
    }

    // --- API: status (mantido da Etapa 0) ---
    if (caminho === "/api/status" && metodo === "GET") {
      const db = abrirBanco();
      const contagens = contarTabelas(db);
      db.close();
      responderJson(res, 200, { etapa: "3", contagens });
      return;
    }

    // --- API: fila ---
    if (caminho === "/api/fila" && metodo === "GET") {
      const db = abrirBanco();
      const videos = listarVideosPorEstado(db, [
        "rascunho",
        "renderizando",
        "aguardando_aprovacao",
        "erro",
      ]).map((v) => anexarProduto(db, v));
      db.close();
      responderJson(res, 200, { videos });
      return;
    }

    // --- API: histórico ---
    if (caminho === "/api/historico" && metodo === "GET") {
      const db = abrirBanco();
      const videos = listarVideosPorEstado(db, ["aprovado", "publicado"]).map((v) => anexarProduto(db, v));
      db.close();
      responderJson(res, 200, { videos });
      return;
    }

    // --- API: rejeições agrupadas por motivo ---
    if (caminho === "/api/rejeicoes/por-motivo" && metodo === "GET") {
      const db = abrirBanco();
      const contagens = contarRejeicoesPorMotivo(db);
      db.close();
      responderJson(res, 200, { contagens, motivos: MOTIVOS_REJEICAO });
      return;
    }

    // --- API: aprovar ---
    const idAprovar = extrairIdDoCaminho(caminho, "/api/videos/", "/aprovar");
    if (idAprovar !== undefined && metodo === "POST") {
      const db = abrirBanco();
      try {
        const video = aprovarVideo(db, idAprovar);
        responderJson(res, 200, { video });
      } catch (erro) {
        if (erro instanceof ErroPortao) {
          responderJson(res, 400, { erro: traduzirErro(erro.message) });
        } else {
          throw erro;
        }
      } finally {
        db.close();
      }
      return;
    }

    // --- API: rejeitar (motivo obrigatório, é botão — ver REGRAS-DE-NEGOCIO.md) ---
    const idRejeitar = extrairIdDoCaminho(caminho, "/api/videos/", "/rejeitar");
    if (idRejeitar !== undefined && metodo === "POST") {
      const db = abrirBanco();
      try {
        const corpoBruto = (await lerCorpoJson(req)) as { motivo?: unknown; observacao?: unknown };
        const resultado = rejeitarVideo(db, {
          videoId: idRejeitar,
          motivo: corpoBruto.motivo,
          observacao: typeof corpoBruto.observacao === "string" ? corpoBruto.observacao : null,
        });
        responderJson(res, 200, resultado);
      } catch (erro) {
        if (erro instanceof ErroPortao) {
          responderJson(res, 400, { erro: traduzirErro(erro.message) });
        } else {
          throw erro;
        }
      } finally {
        db.close();
      }
      return;
    }

    // --- API: ajustes ---
    if (caminho === "/api/ajustes" && metodo === "GET") {
      const db = abrirBanco();
      const ajustes = listarAjustes(db);
      db.close();
      responderJson(res, 200, { ajustes });
      return;
    }

    if (caminho === "/api/ajustes" && metodo === "POST") {
      const db = abrirBanco();
      try {
        const corpoBruto = (await lerCorpoJson(req)) as { chave?: unknown; valor?: unknown };
        if (typeof corpoBruto.chave !== "string" || corpoBruto.chave.trim().length === 0) {
          throw new ErroPortao(t("erro.campoChave"));
        }
        if (typeof corpoBruto.valor !== "string") {
          throw new ErroPortao(t("erro.campoValor"));
        }
        definirAjuste(db, corpoBruto.chave, corpoBruto.valor);
        responderJson(res, 200, { chave: corpoBruto.chave, valor: corpoBruto.valor });
      } catch (erro) {
        if (erro instanceof ErroPortao) {
          responderJson(res, 400, { erro: traduzirErro(erro.message) });
        } else {
          throw erro;
        }
      } finally {
        db.close();
      }
      return;
    }

    if (caminho.startsWith("/api/sites") && (await tratarRotaSites(caminho, metodo, req, res, deps))) return;
    if (caminho.startsWith("/api/ia/") && (await tratarRotaIA(caminho, metodo, req, res, deps))) return;

    // --- API: publicação (Etapa 6) ---
    if (caminho.startsWith("/api/") && (await tratarRotaPublicacao(caminho, metodo, req, res, deps))) return;

    // --- API: ações da Etapa 5 ---
    if (caminho.startsWith("/api/") && (await tratarRotaAcao(caminho, metodo, req, res, deps))) return;

    responderJson(res, 404, { erro: t("erro.naoEncontrado") });
  } catch (erro) {
    if (erro instanceof ErroPortao) {
      responderJson(res, 400, { erro: traduzirErro(erro.message) });
      return;
    }
    console.error(erro);
    responderJson(res, 500, { erro: t("erro.interno") });
  }
}

export interface OpcoesServidor {
  deps?: Dependencias;
  /** Verifica o agendamento a cada 30s. Desligável em teste. */
  agendadorAutomatico?: boolean;
}

/** Sobe o servidor do painel. Sempre em 127.0.0.1 — nunca 0.0.0.0 (ver INFRA.md). */
export function iniciarServidor(porta?: number, opcoes: OpcoesServidor = {}): ReturnType<typeof createServer> {
  const config = carregarConfig();
  const portaFinal = porta ?? config.porta;
  const deps = opcoes.deps ?? dependenciasPadrao;
  const servidor = createServer((req, res) => {
    void tratarRequisicao(req, res, deps);
  });

  let temporizador: NodeJS.Timeout | undefined;
  if (opcoes.agendadorAutomatico ?? true) {
    temporizador = setInterval(() => {
      rodarSeVencido(deps).catch((erro: unknown) => {
        console.error("agendador falhou:", erro instanceof Error ? erro.message : erro);
      });
    }, 30_000);
    temporizador.unref();
  }
  let temporizadorPub: NodeJS.Timeout | undefined;
  if (opcoes.agendadorAutomatico ?? true) {
    recuperarAoSubir(deps);
    temporizadorPub = setInterval(() => {
      passoDoPublicador(deps).catch((erro: unknown) => {
        console.error("publicador falhou:", erro instanceof Error ? erro.message : "erro");
      });
    }, 30_000);
    temporizadorPub.unref();
  }
  servidor.on("close", () => {
    if (temporizadorPub) clearInterval(temporizadorPub);
    if (temporizador) clearInterval(temporizador);
  });

  servidor.on("error", (erro: NodeJS.ErrnoException) => {
    if (erro.code === "EADDRINUSE") {
      console.error(`porta ${portaFinal} já está em uso — escolha outra em PORT`);
      process.exit(1);
    }
    throw erro;
  });

  servidor.listen(portaFinal, "127.0.0.1", () => {
    console.log(`portão escutando em http://127.0.0.1:${portaFinal}`);
  });
  return servidor;
}
