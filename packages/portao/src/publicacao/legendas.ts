// Legenda por rede. A IA escreve só o texto livre e as hashtags; tudo que é
// dado (marca, modelo, ano, km, preço) entra por código, a partir da ficha
// lida (REGRAS-DE-NEGOCIO.md). Por isso o texto da IA NÃO pode ter dígito:
// qualquer número que a IA escrevesse seria dado inventado.

import {
  contextoParaEscritor, ErroPublicacao, gravarLegenda, LIMITE_LEGENDA, listarLegendas, MAXIMO_HASHTAGS, NOMES_REDE,
  obterVideo, REDES, type LegendaVideo, type Rede,
} from "@gerador/core";
import { formatarKm, formatarPreco } from "../dinheiro.js";
import { acharAfirmacoesDaLoja, acharNumerosInventados, formatarFicha, montarSistemaLegendas, validarLegendaRede, type Provedor } from "@gerador/escritor";
import type { DadosVeiculo } from "@gerador/core";
import type Database from "better-sqlite3";

export class ErroLegenda extends Error {}


/** Linha de ficha montada SÓ do dado lido. Campo ausente some; nada é inventado. */
export function fichaEmTexto(dados: Record<string, unknown>): string {
  const partes: string[] = [];
  const nome = [dados["marca"], dados["modelo"]].filter((x) => typeof x === "string" && x).join(" ");
  if (nome) partes.push(nome);
  if (typeof dados["ano"] === "number") partes.push(String(dados["ano"]));
  if (typeof dados["km"] === "number") partes.push(formatarKm(dados["km"], "pt-BR"));
  // preço só entra com a moeda do dado; sem moeda não se inventa uma
  if (typeof dados["preco"] === "number" && typeof dados["moeda"] === "string" && dados["moeda"]) partes.push(formatarPreco(dados["preco"], dados["moeda"] as string, "pt-BR"));
  return partes.join(" • ");
}

/** Legenda do banco (IA ou à mão) ou, na falta, a ficha pura. Nunca texto inventado. */
export function resolverLegenda(db: Database.Database, videoId: number, rede: Rede): string {
  const salva = listarLegendas(db, videoId).find((l) => l.rede === rede);
  if (salva) return salva.texto;
  const ctx = contextoParaEscritor(db, videoId);
  return fichaEmTexto(ctx.dados);
}

function sistema(): string {
  return [
    montarSistemaLegendas(REDES),
    "",
    "Responda APENAS com JSON no formato:",
    '{"instagram":{"texto":"...","hashtags":["#a"]},"facebook":{"texto":"...","hashtags":["#a"]},"tiktok":{"texto":"...","hashtags":["#a"]}}',
    ...REDES.map((r) => `Limite final de ${NOMES_REDE[r]}: ${LIMITE_LEGENDA[r]} caracteres (incluindo a ficha e as hashtags). Máximo de ${MAXIMO_HASHTAGS[r]} hashtags.`),
  ].join("\n");
}

export function comporLegenda(rede: Rede, bruto: unknown, ficha: string, idioma = "pt-BR", dados: DadosVeiculo = {}): string {
  if (typeof bruto !== "object" || bruto === null) throw new ErroLegenda(`falta o bloco "${rede}"`);
  const o = bruto as Record<string, unknown>;
  const texto = typeof o["texto"] === "string" ? o["texto"].trim() : "";
  if (!texto) throw new ErroLegenda(`${rede}.texto vazio`);
  // dígito só passa se for do nome do carro ou de um opcional real ("208", "Câmera 360"); o resto vem da ficha
  const inventados = acharNumerosInventados("", texto, dados);
  if (inventados.length) throw new ErroLegenda(`${rede}.texto tem dígito; números só vêm da ficha (${inventados.join("; ")})`);
  const tags = Array.isArray(o["hashtags"]) ? o["hashtags"] : [];
  if (tags.length > MAXIMO_HASHTAGS[rede]) throw new ErroLegenda(`${rede} passou de ${MAXIMO_HASHTAGS[rede]} hashtags`);
  for (const t of tags) {
    if (typeof t !== "string" || !/^#[\p{L}_]+$/u.test(t)) throw new ErroLegenda(`${rede}: hashtag inválida (só letras, sem dígitos)`);
  }
  // regras de escrita (escritor): a da rede e a de humanizar; soma-se aos testes de dígito e ficha acima
  const motivos = validarLegendaRede(rede, texto, tags as string[], idioma);
  // texto padrão da loja não é fato do carro (acharAfirmacoesDaLoja, do escritor)
  motivos.push(...acharAfirmacoesDaLoja("", texto, dados).map((x) => `[texto da loja] ${x}`));
  if (motivos.length) throw new ErroLegenda(`${rede}: ${motivos.join("; ")}`);
  const final = [texto, ficha, (tags as string[]).join(" ")].filter(Boolean).join("\n\n");
  if ([...final].length > LIMITE_LEGENDA[rede]) {
    throw new ErroLegenda(`${rede}: ${[...final].length} caracteres, limite ${LIMITE_LEGENDA[rede]}`);
  }
  return final;
}

function extrairJson(texto: string): unknown {
  const a = texto.indexOf("{");
  const b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ErroLegenda("resposta sem JSON");
  try { return JSON.parse(texto.slice(a, b + 1)); } catch { throw new ErroLegenda("JSON inválido"); }
}

/**
 * Gera as 3 legendas. Mantém as editadas à mão (manual=1). Até 3 tentativas,
 * reinjetando o erro; esgotou = erro explícito, nunca legenda inventada.
 */
export async function gerarLegendas(
  db: Database.Database, videoId: number, provedor: Provedor, agora: Date,
): Promise<{ legendas: LegendaVideo[]; mantidasManuais: Rede[] }> {
  if (!obterVideo(db, videoId)) throw new ErroPublicacao(`vídeo ${videoId} não encontrado`, 404, "video_inexistente");
  const ctx = contextoParaEscritor(db, videoId);
  const ficha = fichaEmTexto(ctx.dados);
  const manuais = listarLegendas(db, videoId).filter((l) => l.manual).map((l) => l.rede);
  const erros: string[] = [];
  for (let t = 1; t <= 3; t++) {
    const usuario = [
      "Ficha do carro (contexto; não repita números):", ...formatarFicha(ctx.dados as DadosVeiculo), "", `Idioma: ${ctx.idioma}.`,
      ...(erros.length ? ["", `A tentativa anterior falhou: ${erros.at(-1)}. Corrija.`] : []),
    ].join("\n");
    const resp = await provedor.gerar({ sistema: sistema(), usuario });
    try {
      const j = extrairJson(resp.textoCru) as Record<string, unknown>;
      const novas = REDES.map((r) => [r, comporLegenda(r, j[r], ficha, ctx.idioma, ctx.dados as DadosVeiculo)] as const);
      for (const [r, txt] of novas) if (!manuais.includes(r)) gravarLegenda(db, videoId, r, txt, false, agora);
      return { legendas: listarLegendas(db, videoId), mantidasManuais: manuais };
    } catch (e) {
      if (!(e instanceof ErroLegenda)) throw e;
      erros.push(e.message);
    }
  }
  throw new ErroLegenda(`o escritor não entregou legendas válidas em 3 tentativas: ${[...new Set(erros)].join(" | ")}`);
}
