// Seção "IA do escritor" da tela de Configurações: os provedores vêm do registro do pacote escritor (PROVEDORES),
// nada de provedor ou modelo cravado aqui. A CHAVE nunca é lida para a tela: só se ela existe e em qual variável.
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  acharDefinicao, AJUSTE_MODELO, AJUSTE_PROVEDOR, criarProvedorPorEnv, ErroConfiguracaoProvedor, MENSAGEM_CHAVE_RECUSADA,
  PROVEDOR_PADRAO, PROVEDORES, testarConexao, type InfoProvedor, type ListagemModelos, type ModeloListado, type Provedor,
} from "@gerador/escritor";
import { definirAjuste } from "@gerador/core";
import { formatarPreco } from "./dinheiro.js";
import { escaparHtml } from "./html.js";
import { lerCorpoJson, responderJson } from "./http.js";
import { linha } from "./linhas.js";
import { t, tOpcional, type Chave } from "./idioma/index.js";
import type { Dependencias } from "./rotas-acoes.js";

type Ambiente = Record<string, string | undefined>;

export interface DadosIA {
  provedorEmUso: string;
  modeloEmUso: string;
  provedores: { info: InfoProvedor; chavePresente: boolean }[];
}

const cheio = (v: string | undefined): string | undefined => (v?.trim() ? v.trim() : undefined);

/** Escolha atual (ajuste do banco, depois ambiente, depois padrão) e quais chaves existem. Nunca o valor da chave. */
export function dadosIA(ajustes: { chave: string; valor: string }[], env: Ambiente): DadosIA {
  const aj = (k: string): string | undefined => cheio(ajustes.find((a) => a.chave === k)?.valor);
  const pedido = (aj(AJUSTE_PROVEDOR) ?? cheio(env["PROVEDOR_IA"]) ?? PROVEDOR_PADRAO).toLowerCase();
  const info = PROVEDORES.find((p) => p.id === pedido) ?? PROVEDORES.find((p) => p.id === PROVEDOR_PADRAO) ?? PROVEDORES[0]!;
  const modelo = aj(AJUSTE_MODELO) ?? cheio(env[info.variavelModelo]) ?? info.modeloPadrao;
  return {
    provedorEmUso: info.id,
    modeloEmUso: info.modelos.some((m) => m.id === modelo) ? modelo : info.modeloPadrao,
    provedores: PROVEDORES.map((p) => ({ info: p, chavePresente: Boolean(cheio(env[p.variavelChave])) })),
  };
}

/** Nome para a tela: o do registro, salvo quando o catálogo tem a versão no idioma da pessoa. */
function nomeDe(info: InfoProvedor): string {
  return tOpcional(`ia.nome.${info.id}`) ?? info.nome;
}

function precoDe(m: ModeloListado): string {
  if (m.precoEntradaPorMilhao === undefined && m.precoSaidaPorMilhao === undefined) return "";
  const f = (n: number | undefined): string => (n === undefined ? "—" : formatarPreco(n, "USD"));
  return ` — ${t("ia.preco", { entrada: f(m.precoEntradaPorMilhao), saida: f(m.precoSaidaPorMilhao) })}`;
}

function sugeridosDoRegistro(info: InfoProvedor): ListagemModelos {
  return {
    origem: "sugerida",
    modelos: info.modelos.map((m) => ({ id: m.id, nome: m.id, ...(m.id === info.modeloPadrao ? { recomendado: true } : {}) })),
  };
}

/** Seletor de modelo + a frase que diz de onde veio a lista. Lista sugerida SEMPRE diz que é sugerida. */
export function blocoModelos(info: InfoProvedor, listagem: ListagemModelos | null, selecionado: string): string {
  const lista = listagem ?? sugeridosDoRegistro(info);
  const aprovados = new Set(info.modelos.map((m) => m.id));
  const opcoes = lista.modelos
    .map((m) => {
      const rotulo = [lista.origem === "sugerida" ? m.id : (m.nome ?? m.id), m.recomendado ? `(${t("ia.recomendado")})` : "", aprovados.has(m.id) ? "" : `(${t("ia.foraDaLista")})`]
        .filter(Boolean).join(" ") + precoDe(m);
      return `<option value="${escaparHtml(m.id)}"${m.id === selecionado ? " selected" : ""}${aprovados.has(m.id) ? "" : " disabled"}>${escaparHtml(rotulo)}</option>`;
    })
    .join("");
  const nota = lista.origem === "consultada"
    ? t("ia.listaConsultada")
    : listagem && lista.aviso ? t("ia.listaSugeridaMotivo", { aviso: traduzirMensagemIA(lista.aviso, info) }) : t("ia.listaSugerida");
  return `<label for="ia-modelo-${info.id}">${escaparHtml(t("ia.modelo"))}</label>
    <select class="campo" id="ia-modelo-${info.id}" name="modelo" data-ia-modelo>${opcoes}</select>
    <p class="leg" data-ia-origem="${lista.origem}">${escaparHtml(nota)}</p>`;
}

/** Mensagens fixas do pacote escritor (em português) no idioma da pessoa; o que não se reconhece sai como veio. */
export function traduzirMensagemIA(mensagem: string, info?: InfoProvedor): string {
  if (mensagem === MENSAGEM_CHAVE_RECUSADA) return t("ia.msg.chaveRecusada");
  const falta = /^([A-Z][A-Z0-9_]+) não está definida\./.exec(mensagem);
  if (falta) return t("ia.msg.chaveAusente", { variavel: falta[1]! });
  void info;
  return mensagem;
}

export function secaoIA(ia: DadosIA, idiomaAnuncio: { valor: string; opcoes: string }): string {
  const linhas = ia.provedores.map(({ info, chavePresente }) => {
    const emUso = info.id === ia.provedorEmUso;
    const selecionado = emUso ? ia.modeloEmUso : info.modeloPadrao;
    return `<article class="ia-provedor${emUso ? " em-uso" : ""}" data-card data-ia-provedor="${info.id}" aria-label="${escaparHtml(nomeDe(info))}">
      <div class="linha-cab"><span class="linha-rotulo">${escaparHtml(nomeDe(info))}</span>
        <span class="linha-cab-dir">${emUso ? `<span class="selo ok">${escaparHtml(t("ia.emUso"))}</span>` : ""}${
          chavePresente ? `<span class="selo ok">${escaparHtml(t("ajustes.ia.presente"))}</span>` : `<span class="selo erro">${escaparHtml(t("ajustes.ia.ausente"))}</span>`}</span></div>
      <p class="linha-ajuda">${escaparHtml(t("ia.variavel", { variavel: info.variavelChave }))}</p>
      <div class="grupo" data-ia-modelos>${blocoModelos(info, null, selecionado)}</div>
      <div class="acoes">
        <button type="button" class="btn outline" data-acao="ia-usar" data-provedor="${info.id}">${escaparHtml(t("ia.usar"))}</button>
        <button type="button" class="btn ghost" data-acao="ia-testar" data-provedor="${info.id}">${escaparHtml(t("ia.testar"))}</button>
      </div>
      <p class="leg ia-resultado" data-ia-resultado role="status" aria-live="polite"></p>
    </article>`;
  });
  const linhaIdioma = linha({
    rotulo: t("ajustes.anuncio.idiomaTitulo"),
    para: "idioma",
    ajuda: t("ajustes.anuncio.idiomaAjuda"),
    campo: `<select class="campo" id="idioma" name="idioma" data-idioma-anuncio>${idiomaAnuncio.opcoes}</select>`,
  });
  return `<section class="config-grupo ia-secao" id="ia">
    <h3>${escaparHtml(t("ajustes.ia.titulo"))}</h3>
    <p class="linha-ajuda">${escaparHtml(t("ia.subtitulo"))}</p>
    <p class="linha-ajuda">${escaparHtml(t("ia.recomendacao"))}</p>
    <div class="config-linhas">${linhaIdioma}<div class="ia-grade">${linhas.join("")}</div></div>
  </section>`;
}

// ------------------------------------------------------------------ rotas

function redigir(texto: string, env: Ambiente): string {
  let saida = texto;
  for (const p of PROVEDORES) {
    const chave = cheio(env[p.variavelChave]);
    if (chave) saida = saida.split(chave).join("***");
  }
  return saida;
}

export async function tratarRotaIA(caminho: string, metodo: string, req: IncomingMessage, res: ServerResponse, deps: Dependencias): Promise<boolean> {
  if (!(metodo === "POST" && (caminho === "/api/ia/testar" || caminho === "/api/ia/escolher"))) return false;
  const env = deps.envIA ?? process.env;
  const corpo = (await lerCorpoJson(req)) as { provedor?: unknown; modelo?: unknown };
  const def = typeof corpo.provedor === "string" ? acharDefinicao(corpo.provedor) : undefined;
  if (!def) { responderJson(res, 400, { erro: t("ia.erro.provedor") }); return true; }
  const info = PROVEDORES.find((p) => p.id === def.id)!;
  let modelo = typeof corpo.modelo === "string" && corpo.modelo ? corpo.modelo : info.modeloPadrao;
  if (!info.modelos.some((m) => m.id === modelo)) { responderJson(res, 400, { erro: t("ia.erro.modelo") }); return true; }

  if (caminho === "/api/ia/escolher") {
    const db = deps.abrirBanco();
    try {
      definirAjuste(db, AJUSTE_PROVEDOR, info.id);
      definirAjuste(db, AJUSTE_MODELO, modelo);
    } finally { db.close(); }
    responderJson(res, 200, { provedor: info.id, modelo, mensagem: t("ia.salvo", { provedor: nomeDe(info), modelo }) });
    return true;
  }

  const fabrica = deps.provedorParaTeste ?? ((id: string, m: string, e: Ambiente): Provedor => criarProvedorPorEnv(e, { [AJUSTE_PROVEDOR]: id, [AJUSTE_MODELO]: m }));
  const r = await testarConexao(() => fabrica(info.id, modelo, env), info.id);
  const mensagem = r.ok
    ? t("ia.resultadoOk", { modelo: r.modelo ?? modelo, entrada: r.tokensEntrada, saida: r.tokensSaida })
    : t("ia.resultadoErro", { mensagem: redigir(traduzirMensagemIA(r.mensagem, info), env) });
  const listagem: ListagemModelos = { ...r.listagem, ...(r.listagem.aviso ? { aviso: redigir(r.listagem.aviso, env) } : {}) };
  responderJson(res, 200, {
    ok: r.ok, modelo: r.modelo ?? null, tokensEntrada: r.tokensEntrada, tokensSaida: r.tokensSaida, mensagem,
    origem: listagem.origem, htmlModelos: blocoModelos(info, listagem, modelo),
  });
  return true;
}

export { ErroConfiguracaoProvedor };
export type { Chave };
