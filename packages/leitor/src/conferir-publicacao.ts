// Relê o carro no site IMEDIATAMENTE antes de publicar e compara com o dado
// que está no vídeo. Preço velho no ar é propaganda enganosa.
//
// Resultado possível (gravado junto da publicação, para o painel):
//   ok            -> pode publicar (vale por `conferencia.validade_minutos`);
//   mudou         -> BLOQUEIA, com cada diferença "de X para Y";
//   nao_conferiu  -> BLOQUEIA sem virar erro: site fora do ar, bloqueio, tempo
//                    esgotado, leitura incompleta, página sumida ou vídeo antigo
//                    sem registro do dado. A pessoa decide; pode pedir espera +
//                    nova tentativa (liberarParaNovaConferencia, em core).
// Nunca chama registrarFalhaPublicacao: não consome tentativa, não vira 'falhou'.
// Não escreve em `produto`: se o preço mudou, a PRÓXIMA rodada de leitura
// percebe (decidirCaso) e enfileira o vídeo novo.

import {
  compararDados,
  conferenciaVale,
  gravarConferencia,
  hostDaUrl,
  lerDadoDoVideo,
  obterPublicacao,
  obterVideo,
  produtoSaiuDoEstoque,
  registrarAusencia,
  sistemaPausado,
  validadeConferenciaMin,
  type ConferenciaPublicacao,
  type Publicacao,
} from "@gerador/core";
import type Database from "better-sqlite3";
import { BloqueioError } from "./bloqueio.js";
import { CaminhoProibidoError } from "./leitor.js";
import { NavegadorIndisponivelError } from "./navegador-pessoa.js";
import { PaginaInexistenteError } from "./pagina-inexistente.js";
import type { FonteSite } from "./rodada.js";
import { buscarSite } from "./sites.js";

export const TEMPO_LIMITE_CONFERENCIA_MS = 60_000;

export type MotivoSemConferir = "pausado" | "fora_do_estoque";

export type ResultadoConferencia =
  /** Pode publicar. `dispensada`: havia conferência recente, não releu. */
  | { liberada: true; dispensada: boolean; conferencia: ConferenciaPublicacao }
  /** Bloqueada. `conferencia` é o que ficou gravado na publicação. */
  | { liberada: false; estado: "mudou" | "nao_conferiu"; conferencia: ConferenciaPublicacao }
  /** Bloqueada por outra trava (nada foi lido nem gravado). */
  | { liberada: false; estado: MotivoSemConferir; conferencia: null; motivo: string };

export interface OpcoesConferencia {
  agora?: Date;
  /** Ignora a conferência recente e relê. */
  forcar?: boolean;
  timeoutMs?: number;
}

function comTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  const limite = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error("tempo esgotado")), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(t));
}

const naoConferiu = (agora: Date, codigo: string, motivo: string): ConferenciaPublicacao => ({
  estado: "nao_conferiu", em: agora.toISOString(), diferencas: [], motivo, codigo, dadoLido: null,
});

/**
 * Chamar ANTES de reivindicarPublicacao. Só publica quem recebe `liberada: true`.
 * (Com `conferencia.exigir` ligado, reivindicarPublicacao recusa mesmo assim
 * se esta função não tiver gravado um "ok" válido.)
 */
export async function conferirAntesDePublicar(
  db: Database.Database,
  fonte: FonteSite,
  publicacaoId: number,
  opcoes: OpcoesConferencia = {},
): Promise<ResultadoConferencia> {
  const agora = opcoes.agora ?? new Date();
  const pub: Publicacao | undefined = obterPublicacao(db, publicacaoId);
  if (!pub) throw new Error(`publicação ${publicacaoId} não encontrada`);

  // Pausa: não lê o site de ninguém nem grava nada.
  if (sistemaPausado(db)) {
    return { liberada: false, estado: "pausado", conferencia: null, motivo: "O sistema está pausado." };
  }

  const video = obterVideo(db, pub.videoId);
  if (!video) throw new Error(`vídeo ${pub.videoId} não encontrado`);
  if (produtoSaiuDoEstoque(db, video.produtoId)) {
    return {
      liberada: false, estado: "fora_do_estoque", conferencia: null,
      motivo: "O carro saiu do estoque do site (provavelmente vendido).",
    };
  }

  if (!opcoes.forcar && conferenciaVale(pub.conferencia, agora, validadeConferenciaMin(db))) {
    return { liberada: true, dispensada: true, conferencia: pub.conferencia! };
  }

  const bloquear = (c: ConferenciaPublicacao): ResultadoConferencia => {
    gravarConferencia(db, publicacaoId, c);
    return { liberada: false, estado: c.estado === "mudou" ? "mudou" : "nao_conferiu", conferencia: c };
  };

  const noVideo = lerDadoDoVideo(db, pub.videoId);
  if (!noVideo) {
    return bloquear(
      naoConferiu(agora, "sem_referencia",
        "Este vídeo não guardou o dado que usou (é de antes da conferência). Refaça o vídeo para poder conferir o preço."),
    );
  }

  const produto = db.prepare("SELECT origem_url FROM produto WHERE id = ?").get(video.produtoId) as
    | { origem_url: string }
    | undefined;
  if (!produto) return bloquear(naoConferiu(agora, "sem_produto", "O produto deste vídeo não existe mais no banco."));

  const site = buscarSite(db, hostDaUrl(produto.origem_url));
  let lido;
  try {
    lido = await comTimeout(
      fonte.detalhe(produto.origem_url, site?.adaptador, site?.modo),
      opcoes.timeoutMs ?? TEMPO_LIMITE_CONFERENCIA_MS,
    );
  } catch (e) {
    if (e instanceof PaginaInexistenteError) {
      // Uma leitura que funcionou e provou que a página não existe: conta como ausência do carro.
      registrarAusencia(db, video.produtoId, `A página devolveu ${e.status} ao conferir antes de publicar.`, agora);
      return bloquear(naoConferiu(agora, "pagina_inexistente",
        `A página do carro não existe mais no site (HTTP ${e.status}). Ele pode ter sido vendido.`));
    }
    if (e instanceof BloqueioError) {
      return bloquear(naoConferiu(agora, `bloqueado:${e.sinal}`, `Não consegui conferir: ${e.message}`));
    }
    if (e instanceof NavegadorIndisponivelError) {
      return bloquear(naoConferiu(agora, "navegador-indisponivel", `Não consegui conferir: ${e.message}`));
    }
    if (e instanceof CaminhoProibidoError) {
      return bloquear(naoConferiu(agora, "robots", `Não consegui conferir: ${e.message}`));
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "tempo esgotado") {
      return bloquear(naoConferiu(agora, "tempo_esgotado", "Não consegui conferir: o site demorou demais para responder."));
    }
    return bloquear(naoConferiu(agora, "erro_leitura", `Não consegui conferir: ${msg}`));
  }

  const dadoLido: Record<string, unknown> = {
    marca: lido.marca, modelo: lido.modelo, ano: lido.ano, km: lido.km, preco: lido.preco, moeda: lido.moeda,
  };
  const { diferencas, faltandoNaLeitura } = compararDados(noVideo, dadoLido);
  const base = { em: agora.toISOString(), dadoLido };

  // Mudança concreta é mais grave que leitura incompleta: se achou diferença, diz.
  if (diferencas.length > 0) {
    return bloquear({ ...base, estado: "mudou", diferencas, motivo: null, codigo: null });
  }
  if (faltandoNaLeitura.length > 0) {
    return bloquear({
      ...base, estado: "nao_conferiu", diferencas: [], codigo: "leitura_incompleta",
      motivo: `A releitura não trouxe: ${faltandoNaLeitura.join(", ")}. Não dá para garantir que o vídeo está certo.`,
    });
  }
  const ok: ConferenciaPublicacao = { ...base, estado: "ok", diferencas: [], motivo: null, codigo: null };
  gravarConferencia(db, publicacaoId, ok);
  return { liberada: true, dispensada: false, conferencia: ok };
}
