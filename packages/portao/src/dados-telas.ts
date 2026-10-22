// Dados que as telas precisam e que não são só "ler do banco": contadores da barra lateral e o bloco por rede.
import { statSync } from "node:fs";
import {
  lerCaracteristicas, listarContas, listarLegendas, obterConta, REDES, type CaracteristicasMidia, type Rede, type Video,
} from "@gerador/core";
import type Database from "better-sqlite3";
import type { Contadores } from "./paginas.js";
import type { DadosRedes, ValidacaoRede } from "./paginas-redes.js";
import { t } from "./idioma/index.js";
import { resolverLegenda } from "./publicacao/legendas.js";
import { validarPublicacaoDeMidia } from "./publicacao/publicador.js";
import type { Dependencias } from "./rotas-acoes.js";

export function calcularContadores(db: Database.Database): Contadores {
  const n = (sql: string): number => (db.prepare(sql).get() as { n: number }).n;
  return {
    aguardando: n("SELECT COUNT(*) AS n FROM video WHERE estado = 'aguardando_aprovacao'"),
    renderizando: n("SELECT COUNT(*) AS n FROM video WHERE estado IN ('rascunho','renderizando')"),
    agendados: n("SELECT COUNT(*) AS n FROM publicacao WHERE estado = 'agendada'"),
    falharam:
      n("SELECT COUNT(*) AS n FROM publicacao WHERE estado = 'falhou'") + n("SELECT COUNT(*) AS n FROM video WHERE estado = 'erro'"),
  };
}

// ffprobe a cada atualização da tela seria desperdício: o resultado só muda se o arquivo mudar.
const cacheMidia = new Map<string, CaracteristicasMidia>();

async function medir(deps: Dependencias, caminho: string): Promise<CaracteristicasMidia> {
  if (deps.lerMidia) return deps.lerMidia(caminho); // injetado (teste): sem cache
  const st = statSync(caminho); // lança se o arquivo sumiu
  const chave = `${caminho}:${st.mtimeMs}:${st.size}`;
  const guardado = cacheMidia.get(chave);
  if (guardado) return guardado;
  const c = await lerCaracteristicas(caminho);
  if (cacheMidia.size > 200) cacheMidia.clear();
  cacheMidia.set(chave, c);
  return c;
}

export function iaDisponivel(deps: Dependencias): boolean {
  try {
    deps.criarProvedor();
    return true;
  } catch {
    return false;
  }
}

const ESTADOS_COM_REDES = new Set(["aguardando_aprovacao", "aprovado", "publicado"]);

export async function dadosRedes(db: Database.Database, v: Pick<Video, "id" | "estado" | "caminhoMp4">, deps: Dependencias, ia: boolean): Promise<DadosRedes | null> {
  if (!v.caminhoMp4 || !ESTADOS_COM_REDES.has(v.estado)) return null;
  const salvas = listarLegendas(db, v.id);
  const legendas = Object.fromEntries(
    REDES.map((r) => {
      const s = salvas.find((l) => l.rede === r);
      return [r, s ? { texto: s.texto, origem: s.manual ? "manual" : "ia" } : { texto: resolverLegenda(db, v.id, r), origem: "ficha" }];
    }),
  ) as DadosRedes["legendas"];
  const contas = Object.fromEntries(
    REDES.map((r) => {
      const c = obterConta(db, r);
      return [r, c.conectada ? c.contaNome : null];
    }),
  ) as Record<Rede, string | null>;
  let validacao: ValidacaoRede[] | null = null;
  let validacaoErro: string | null = null;
  try {
    const c = await medir(deps, v.caminhoMp4);
    validacao = REDES.map((r) => {
      const x = validarPublicacaoDeMidia(r, c, obterConta(db, r), "publica");
      return { rede: r, ok: x.ok, bloqueios: x.bloqueios, avisos: x.avisos };
    });
  } catch (e) {
    validacaoErro = e instanceof Error && /ENOENT/.test(e.message) ? t("erro.mp4Sumiu") : t("erro.ffprobe");
  }
  return { validacao, validacaoErro, legendas, contas, iaDisponivel: ia };
}

export { listarContas };
