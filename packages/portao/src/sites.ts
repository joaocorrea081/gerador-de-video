// Tela de Sites: de onde o sistema lê os carros. Tudo o que é leitura de site vem do pacote leitor
// (testarSite, cadastrarSite, definirSiteAtivo...). Esta tela só mostra, pergunta e confirma.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  cadastrarSite, definirSiteAtivo, definirSiteModo, ehModoNavegacao, ehNomeAdaptador, ErroSite, execBskReal, listarSites,
  MODOS_NAVEGACAO, removerSite, testarSite, verificarNavegadorDaPessoa,
  type EstadoNavegadorPessoa, type ModoNavegacao, type OpcoesTeste, type ResultadoTeste, type Site,
} from "@gerador/leitor";
import { traduzirErro } from "./erros.js";
import { formatarPreco } from "./dinheiro.js";
import { escaparHtml } from "./html.js";
import { lerCorpoJson, responderJson } from "./http.js";
import { idiomaAtual, t, tp, type Chave } from "./idioma/index.js";
import { chave, grupo, linha } from "./linhas.js";
import { casca, e, nomeDaAba, SEM_CONTADORES, type Contadores } from "./paginas.js";
import { formatarBrasilia } from "./tempo.js";
import type { Dependencias } from "./rotas-acoes.js";

const modoNome = (m: ModoNavegacao): string => t(`sites.modoNome.${m}` as Chave);
const modoAjuda = (m: ModoNavegacao): string => t(`sites.modo.${m}` as Chave);

/** Aviso OBRIGATÓRIO: modo que depende do navegador da pessoa não roda sozinho. Escrito na tela, nunca escondido. */
function avisoDoModo(m: ModoNavegacao): string {
  if (m === "navegador-da-pessoa") return `<div class="aviso info" data-aviso-modo="${m}">${e("sites.avisoPessoa")}</div>`;
  if (m === "automatico") return `<div class="aviso info" data-aviso-modo="${m}">${e("sites.avisoAutomatico")}</div>`;
  return "";
}

function opcoesModo(atual: ModoNavegacao): string {
  return MODOS_NAVEGACAO.map((m) => `<option value="${m}"${m === atual ? " selected" : ""}>${escaparHtml(modoNome(m))}</option>`).join("");
}

function linhaSite(s: Site): string {
  return `<article class="linha site-linha" data-card data-site="${escaparHtml(s.id)}">
    <div class="linha-cab"><span class="linha-rotulo">${escaparHtml(s.nome)} <span class="fraco">${escaparHtml(s.url)}</span></span>
      <span class="linha-cab-dir"><span class="chave-texto">${e("sites.ativo")}</span>${chave({ ligado: s.ativo, rotulo: `${t("sites.ativo")}: ${s.nome}`, attrs: `data-acao="site-ativo" data-site="${escaparHtml(s.id)}"` })}</span></div>
    <p class="linha-ajuda">${escaparHtml(s.ultimaLeituraEm ? t("sites.ultimaLeitura", { quando: formatarBrasilia(s.ultimaLeituraEm) }) : t("sites.ultimaLeituraNunca"))}</p>
    <div class="grupo"><label for="modo-${escaparHtml(s.id)}">${e("sites.modo")}</label>
      <select class="campo" id="modo-${escaparHtml(s.id)}" data-site-modo data-site="${escaparHtml(s.id)}">${opcoesModo(s.modo)}</select>
      <span class="linha-ajuda">${escaparHtml(modoAjuda(s.modo))}</span></div>
    ${avisoDoModo(s.modo)}
    <div class="acoes"><button type="button" class="btn ghost perigo pequeno" data-acao="site-remover" data-site="${escaparHtml(s.id)}">${e("sites.remover")}</button></div>
  </article>`;
}

export function paginaSites(sites: Site[], contadores: Contadores = SEM_CONTADORES): string {
  const lista = sites.length === 0 ? [`<div class="linha"><p class="linha-valor">${e("sites.nenhum")}</p></div>`] : sites.map(linhaSite);
  const todasAsDescricoes = `<ul class="lista-simples">${MODOS_NAVEGACAO.map((m) => `<li><strong>${escaparHtml(modoNome(m))}.</strong> ${escaparHtml(modoAjuda(m))}</li>`).join("")}</ul>`;
  const conteudo = `
  <div class="config-pagina">
  <div><h2>${e("aba.sites")}</h2><p class="leg">${e("sites.subtitulo")}</p></div>
  ${grupo(e("sites.cadastrados"), lista, { id: "sites-lista" })}
  <form id="form-site" autocomplete="off">
  ${grupo(e("sites.adicionar"), [
    linha({ rotulo: t("sites.url"), para: "site-url", ajuda: t("sites.urlAjuda"), campo: `<input class="campo" id="site-url" name="url" type="text" inputmode="url" placeholder="https://" required />` }),
    linha({ rotulo: t("sites.nome"), para: "site-nome", ajuda: t("sites.nomeAjuda"), campo: `<input class="campo" id="site-nome" name="nome" type="text" />` }),
    linha({ rotulo: t("sites.modo"), para: "site-modo", campo: `<select class="campo" id="site-modo" name="modo">${opcoesModo("playwright")}</select>${todasAsDescricoes}${avisoDoModo("navegador-da-pessoa")}` }),
    linha({ rotulo: t("sites.testar"), campo: `<div class="acoes"><button type="submit" class="btn primary" data-acao="site-testar">${e("sites.testar")}</button></div><div data-site-resultado role="status" aria-live="polite"></div>` }),
  ], { id: "adicionar-site" })}
  </form>
  ${grupo(e("sites.navegador.titulo"), [
    linha({ rotulo: t("sites.navegador.titulo"), ajuda: t("sites.navegador.ajuda"), campo: `<div class="acoes"><button type="button" class="btn outline" data-acao="site-navegador">${e("sites.navegador.verificar")}</button></div><p class="linha-valor" data-navegador-resultado role="status" aria-live="polite"></p>` }),
  ])}
  </div>`;
  return casca({ aba: "sites", titulo: nomeDaAba("sites"), conteudo, contadores, atualizarACada: 0 });
}

// ---------------------------------------------------------------- amostra do teste

function enderecoParaCadastro(r: ResultadoTeste): string {
  return r.adaptador === "jsonld" ? (r.urlListagem ?? r.url) : r.url;
}

/** O que o teste achou, em palavras da pessoa, e (se leu de verdade) a amostra e o botão de confirmar. */
export function blocoResultadoTeste(r: ResultadoTeste): string {
  const mensagem = t(`sites.situacao.${r.situacao}` as Chave, { regra: r.regraRobots ?? "", sinal: r.sinalBloqueio ?? "" });
  // os detalhes da leitura vêm em português do pacote leitor: só aparecem para quem lê português
  const detalhes = idiomaAtual() === "pt-BR" && r.avisos.length > 0 ? `<ul class="lista-simples">${r.avisos.map((a) => `<li class="leg">${escaparHtml(a)}</li>`).join("")}</ul>` : "";
  if (!r.legivel || !r.adaptador) return `<div class="aviso erro">${escaparHtml(mensagem)}</div>${detalhes}`;
  const linhas = r.amostra.map(({ url, ficha }) => {
    const nome = [ficha.marca, ficha.modelo].filter(Boolean).join(" ") || url;
    return `<tr><td>${escaparHtml(nome)}</td><td>${ficha.ano ?? "—"}</td><td>${ficha.km !== undefined ? escaparHtml(formatarKmSimples(ficha.km)) : "—"}</td><td>${ficha.preco !== undefined ? escaparHtml(formatarPreco(ficha.preco, ficha.moeda)) : "—"}</td></tr>`;
  });
  return `<div class="aviso ok">${escaparHtml(mensagem)}</div>
    <p class="linha-valor">${escaparHtml(tp("sites.carrosAchados", r.carrosNaListagem))}</p>
    <div class="rolagem"><table class="tabela amostra"><caption class="sr-only">${e("sites.amostra")}</caption>
      <thead><tr><th>${e("estoque.col.carro")}</th><th>${e("sites.col.ano")}</th><th>${e("estoque.col.km")}</th><th>${e("estoque.col.preco")}</th></tr></thead>
      <tbody>${linhas.join("")}</tbody></table></div>
    ${detalhes}
    <p class="linha-ajuda">${e("sites.amostraPergunta")}</p>
    <div class="acoes"><button type="button" class="btn primary" data-acao="site-confirmar" data-url="${escaparHtml(enderecoParaCadastro(r))}" data-adaptador="${escaparHtml(r.adaptador)}">${e("sites.confirmar")}</button></div>`;
}

import { formatarKm } from "./dinheiro.js";
const formatarKmSimples = (km: number): string => formatarKm(km);

// ------------------------------------------------------------------ rotas

export async function tratarRotaSites(caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias): Promise<boolean> {
  if (!caminho.startsWith("/api/sites") || metodo !== "POST") return false;
  const corpo = (await lerCorpoJson(req)) as Record<string, unknown>;
  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const modoDe = (v: unknown): ModoNavegacao | undefined => (v === undefined || v === "" ? undefined : ehModoNavegacao(v) ? v : (() => { throw new ErroSite(t("sites.erro.modo")); })());

  try {
    if (caminho === "/api/sites/testar") {
      const url = texto(corpo["url"]);
      if (!url) { responderJson(res, 400, { erro: t("sites.erro.dado") }); return true; }
      const modo = modoDe(corpo["modo"]);
      const opcoes: OpcoesTeste = modo ? { modo } : {};
      const r = await (deps.testarSiteFn ?? testarSite)(url, opcoes);
      responderJson(res, 200, { legivel: r.legivel, situacao: r.situacao, html: blocoResultadoTeste(r) });
      return true;
    }
    if (caminho === "/api/sites/cadastrar") {
      const url = texto(corpo["url"]);
      const adaptador = texto(corpo["adaptador"]);
      if (!url || !ehNomeAdaptador(adaptador)) { responderJson(res, 400, { erro: t("sites.erro.nada") }); return true; }
      const modo = modoDe(corpo["modo"]);
      const db = deps.abrirBanco();
      try {
        const site = cadastrarSite(db, { url, adaptador, ...(texto(corpo["nome"]) ? { nome: texto(corpo["nome"]) } : {}), ...(modo ? { modo } : {}) });
        responderJson(res, 200, { site });
      } finally { db.close(); }
      return true;
    }
    if (caminho === "/api/sites/navegador") {
      const verificar = deps.verificarNavegadorFn ?? ((): Promise<EstadoNavegadorPessoa> => verificarNavegadorDaPessoa(execBskReal, { subirDaemon: false }));
      const st = await verificar();
      const mensagem = st.disponivel ? t("sites.navegador.conectado") : (st.motivo ? t(`sites.navegador.${st.motivo}` as Chave) : st.mensagem);
      responderJson(res, 200, { disponivel: st.disponivel, mensagem });
      return true;
    }
    const m = /^\/api\/sites\/([^/]+)\/(ativo|modo|remover)$/.exec(caminho);
    if (m) {
      const id = decodeURIComponent(m[1]!);
      const db = deps.abrirBanco();
      try {
        if (m[2] === "ativo") responderJson(res, 200, { site: definirSiteAtivo(db, id, corpo["ativo"] === true) });
        else if (m[2] === "modo") {
          const modo = modoDe(corpo["modo"]);
          if (!modo) throw new ErroSite(t("sites.erro.modo"));
          responderJson(res, 200, { site: definirSiteModo(db, id, modo) });
        } else { removerSite(db, id); responderJson(res, 200, { removido: id }); }
      } finally { db.close(); }
      return true;
    }
  } catch (erro) {
    if (erro instanceof ErroSite) { responderJson(res, 400, { erro: traduzirErro(erro.message) }); return true; }
    throw erro;
  }
  return false;
}

export { listarSites };
