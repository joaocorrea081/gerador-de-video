// Sites cadastrados: de onde o sistema lê. Guardados na tabela `ajuste`
// (chave "leitor.sites", JSON) — sem migração nova, para não colidir com
// outras frentes que mexem no esquema (v1..v4 intocadas).

import type Database from "better-sqlite3";
import { ehNomeAdaptador, type NomeAdaptador } from "./adaptadores/registro.js";
import { ehModoNavegacao, type ModoNavegacao } from "./navegador-modos.js";
import { normalizarEndereco, testarSite, type OpcoesTeste, type ResultadoTeste } from "./descoberta.js";

export interface Site {
  /** Identificador estável: host sem "www". */
  id: string;
  url: string;
  nome: string;
  adaptador: NomeAdaptador;
  ativo: boolean;
  /** Como navegar: padrão "playwright". Ver navegador-modos.ts. */
  modo: ModoNavegacao;
  ultimaLeituraEm: string | null;
  criadoEm: string;
}

export class ErroSite extends Error {}

const CHAVE = "leitor.sites";

function ler(db: Database.Database): Site[] {
  const linha = db.prepare("SELECT valor FROM ajuste WHERE chave = ?").get(CHAVE) as { valor: string } | undefined;
  if (!linha) return [];
  try {
    const lista = JSON.parse(linha.valor) as (Omit<Site, "modo"> & { modo?: unknown })[];
    return lista
      .filter((s) => ehNomeAdaptador(s.adaptador))
      .map((s) => ({ ...s, modo: ehModoNavegacao(s.modo) ? s.modo : "playwright" }));
  } catch {
    return [];
  }
}

function gravar(db: Database.Database, sites: Site[]): void {
  db.prepare(
    "INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
  ).run(CHAVE, JSON.stringify(sites));
}

export function idDoSite(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

export function listarSites(db: Database.Database): Site[] {
  return ler(db);
}

export function listarSitesAtivos(db: Database.Database): Site[] {
  return ler(db).filter((s) => s.ativo);
}

export function buscarSite(db: Database.Database, id: string): Site | undefined {
  return ler(db).find((s) => s.id === id);
}

export interface NovoSite {
  url: string;
  nome?: string;
  adaptador: NomeAdaptador;
  ativo?: boolean;
  modo?: ModoNavegacao;
}

export function cadastrarSite(db: Database.Database, novo: NovoSite): Site {
  const url = normalizarEndereco(novo.url);
  if (novo.modo !== undefined && !ehModoNavegacao(novo.modo)) throw new ErroSite(`Modo desconhecido: ${String(novo.modo)}`);
  if (!ehNomeAdaptador(novo.adaptador)) throw new ErroSite(`Adaptador desconhecido: ${String(novo.adaptador)}`);
  const id = idDoSite(url);
  const sites = ler(db);
  if (sites.some((s) => s.id === id)) throw new ErroSite(`O site ${id} já está cadastrado.`);
  const site: Site = {
    id,
    url,
    nome: novo.nome?.trim() || id,
    adaptador: novo.adaptador,
    ativo: novo.ativo ?? true,
    modo: novo.modo ?? "playwright",
    ultimaLeituraEm: null,
    criadoEm: new Date().toISOString(),
  };
  gravar(db, [...sites, site]);
  return site;
}

function alterar(db: Database.Database, id: string, mudar: (s: Site) => Site): Site {
  const sites = ler(db);
  const i = sites.findIndex((s) => s.id === id);
  if (i === -1) throw new ErroSite(`Site não cadastrado: ${id}`);
  const novo = mudar(sites[i]!);
  sites[i] = novo;
  gravar(db, sites);
  return novo;
}

export function definirSiteAtivo(db: Database.Database, id: string, ativo: boolean): Site {
  return alterar(db, id, (s) => ({ ...s, ativo }));
}

export function definirSiteModo(db: Database.Database, id: string, modo: ModoNavegacao): Site {
  if (!ehModoNavegacao(modo)) throw new ErroSite(`Modo desconhecido: ${String(modo)}`);
  return alterar(db, id, (s) => ({ ...s, modo }));
}

export function renomearSite(db: Database.Database, id: string, nome: string): Site {
  const limpo = nome.trim();
  if (limpo === "") throw new ErroSite("O nome não pode ficar vazio.");
  return alterar(db, id, (s) => ({ ...s, nome: limpo }));
}

export function marcarSiteLido(db: Database.Database, id: string, quando: Date = new Date()): void {
  if (buscarSite(db, id)) alterar(db, id, (s) => ({ ...s, ultimaLeituraEm: quando.toISOString() }));
}

export function removerSite(db: Database.Database, id: string): void {
  const sites = ler(db);
  if (!sites.some((s) => s.id === id)) throw new ErroSite(`Site não cadastrado: ${id}`);
  gravar(db, sites.filter((s) => s.id !== id));
}

/**
 * Botão "Adicionar site": testa o endereço e só cadastra se achou dado de
 * verdade (usando o adaptador detectado). Se não der para ler, não cadastra e
 * devolve o diagnóstico para a tela mostrar.
 */
export async function cadastrarSiteDetectando(
  db: Database.Database,
  url: string,
  extras: { nome?: string; modo?: ModoNavegacao } & OpcoesTeste = {},
): Promise<{ resultado: ResultadoTeste; site?: Site }> {
  const { nome, modo, ...opcoes } = extras;
  const resultado = await testarSite(url, modo === undefined ? opcoes : { ...opcoes, modo });
  if (!resultado.legivel || !resultado.adaptador) return { resultado };
  // Para o genérico, guarda a página onde os carros foram de fato achados.
  const endereco = resultado.adaptador === "jsonld" ? (resultado.urlListagem ?? resultado.url) : resultado.url;
  const novo: NovoSite = { url: endereco, adaptador: resultado.adaptador };
  if (nome !== undefined) novo.nome = nome;
  if (modo !== undefined) novo.modo = modo;
  return { resultado, site: cadastrarSite(db, novo) };
}
