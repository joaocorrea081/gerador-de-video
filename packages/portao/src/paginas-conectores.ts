// Telas de Contas e de Prontidão. Montam-se a partir do registro de conectores (conectores/): nenhuma rede é citada aqui.
// Segredo nunca entra: recebem só a visão pública da conta, que não tem token.
import { casca, e, nomeDaAba, SEM_CONTADORES, type Contadores } from "./paginas.js";
import { escaparHtml } from "./html.js";
import { chave, grupo, linha } from "./linhas.js";
import { textoDe, type CampoCredencial, type FalhaDeCarga, type VistaConector } from "./conectores/index.js";
import { t, tp, type Chave } from "./idioma/index.js";
import type { ProntidaoRede } from "./publicacao/prontidao.js";
import { formatarBrasilia } from "./tempo.js";

const tx = (x: Parameters<typeof textoDe>[0]): string => textoDe(x);

// ------------------------------------------------------------------ Contas

function campoDoFormulario(c: VistaConector["conector"], f: CampoCredencial): string {
  const id = `${c.id}-${f.id}`;
  const rotulo = tx(f.rotulo);
  const tipo = f.tipo === "segredo" ? "password" : f.tipo === "data_hora" ? "datetime-local" : "text";
  const attrs = `class="campo" id="${id}" name="${f.id}" type="${tipo}" autocomplete="off" spellcheck="false" data-campo-cred="${f.tipo}"${f.obrigatorio ? " data-obrig" : ""}`;
  const valor = f.sugestao ? ` value="${escaparHtml(f.sugestao)}"` : "";
  return linha({
    rotulo, para: id, ajuda: f.ajuda ? tx(f.ajuda) : undefined,
    campo: `<input ${attrs}${valor} />`,
  });
}

function formularioDeConexao(c: VistaConector["conector"]): string {
  const real = c.modos.includes("real");
  const seco = c.modos.includes("seco");
  const modos = [
    ...(real ? [`<label class="opcao-rede"><input type="radio" name="modo" value="real" checked /> <span>${e("contas.modoReal")}</span></label>`] : []),
    ...(seco ? [`<label class="opcao-rede"><input type="radio" name="modo" value="seco"${real ? "" : " checked"} /> <span>${e("contas.modoSeco")}</span></label>`] : []),
  ].join("");
  const escolhaDeModo = real && seco
    ? `<fieldset class="grupo" style="border:0;padding:0;margin:0"><legend class="rotulo">${e("contas.comoConectar")}</legend>
          <div class="opcoes">${modos}</div><span class="linha-ajuda">${e("contas.modoSecoAjuda")}</span></fieldset>`
    : `<input type="hidden" name="modo" value="${real ? "real" : "seco"}" /><p class="linha-ajuda">${e(real ? "contas.soReal" : "contas.soSeco")}</p>`;
  const camposReais = real
    ? `<div data-so-real style="display:flex;flex-direction:column">${c.campos.map((f) => campoDoFormulario(c, f)).join("")}</div>
        <p class="linha-ajuda">${e("contas.tokensGuardados")}</p>`
    : "";
  return `<div class="painel" data-painel="conectar" hidden style="margin-top:12px">
      <form class="form-conta" data-rede="${c.id}" autocomplete="off" style="display:flex;flex-direction:column;gap:4px">
        ${escolhaDeModo}
        ${camposReais}
        <div class="acoes"><button type="submit" class="btn primary">${e("contas.salvarConexao")}</button><button type="button" class="btn ghost" data-acao="fechar">${e("acao.cancelar")}</button></div>
      </form>
    </div>`;
}

function linhaAtiva(v: VistaConector): string {
  const { conector: c } = v;
  const parada = v.agendadas > 0 && !v.ativo ? ` ${t("contas.agendadasParadas", { n: v.agendadas })}` : "";
  return linha({
    rotulo: t("contas.usarRede"),
    ajuda: `${t("contas.usarRedeAjuda")}${parada}`,
    cab: chave({ ligado: v.ativo, rotulo: t("contas.usarRedeAria", { rede: c.nome }), attrs: `data-acao="conector-ativo" data-conector="${c.id}"` }),
    campo: "",
  });
}

function blocoDoConector(v: VistaConector, agora: Date): string {
  const { conector: c, conta } = v;
  const real = conta.modo === "real";
  const selos = `${c.exemplo ? `<span class="selo">${e("contas.exemploSelo")}</span> ` : ""}${
    !v.ativo
      ? `<span class="selo">${e("contas.desligada")}</span>`
      : conta.conectada
        ? `<span class="selo ${real ? "ok" : "espera"}">${e(real ? "contas.conectada" : "contas.conectadaSeco")}</span>`
        : `<span class="selo erro">${e("contas.naoConectada")}</span>`
  }`;
  const titulo = `${escaparHtml(c.nome)} ${selos}`;
  const atributos = `data-card data-rede="${c.id}" data-ativo="${v.ativo}"`;
  if (!v.ativo) return grupo(titulo, [linhaAtiva(v)], { id: `conta-${c.id}`, attrs: atributos, classe: "conector-desligado" });

  let token = `<span class="linha-valor fraco">${e("contas.semToken")}</span>`;
  if (conta.conectada && conta.tokenExpiraEm) {
    const ms = Date.parse(conta.tokenExpiraEm) - agora.getTime();
    const selo = ms <= 0 ? `<span class="selo erro">${e("contas.expirado")}</span>` : ms < 24 * 3_600_000 ? `<span class="selo espera">${e("contas.expiraEmBreve")}</span>` : "";
    token = `<span class="linha-valor">${escaparHtml(formatarBrasilia(conta.tokenExpiraEm))}</span> ${selo}`;
  }
  const botoes = `<button type="button" class="btn ${conta.conectada ? "outline" : "primary"} pequeno" data-abre="conectar" aria-pressed="false" aria-expanded="false">${e(conta.conectada ? "contas.reconectar" : "contas.conectar")}</button>${
    conta.conectada && c.fila && c.modos.includes("real") ? `<button type="button" class="btn outline pequeno" data-acao="renovar" data-rede="${c.id}">${e("contas.renovar")}</button>` : ""}`;
  const faltam = c.escopos.filter((x) => !conta.escopos.includes(x));
  const limites = [
    c.limites.legenda !== undefined ? t("contas.limiteLegenda", { n: c.limites.legenda, h: c.limites.hashtags ?? 0 }) : "",
    c.limites.diario !== undefined ? t("contas.limiteDiario", { n: c.limites.diario }) : "",
  ].filter(Boolean);
  const linhas = [
    linhaAtiva(v),
    linha({
      rotulo: t("contas.conta"),
      ajuda: conta.conectada && !real ? t("contas.seco.texto", { rede: c.nome }) : undefined,
      cab: botoes,
      campo: `<span class="linha-valor">${conta.conectada ? escaparHtml(conta.contaNome ?? conta.contaId ?? "—") : "—"}</span>`,
    }),
    ...(c.modos.includes("real") ? [linha({ rotulo: t("contas.tokenExpira"), ajuda: t("contas.tokenAjuda"), campo: token })] : []),
    ...(conta.refreshExpiraEm
      ? [linha({ rotulo: t("contas.refreshExpira"), campo: `<span class="linha-valor">${escaparHtml(formatarBrasilia(conta.refreshExpiraEm))}</span>` })]
      : []),
    linha({ rotulo: tx(c.aprovacao.rotulo), campo: `<span class="linha-valor">${e(conta.aprovacaoPlataforma ? "contas.sim" : "contas.aindaNao")}</span>` }),
    linha({
      rotulo: t("contas.regrasMidia"),
      ajuda: limites.join(" ") || undefined,
      campo: `<ul class="lista-simples">${c.midia.map((m) => `<li>${escaparHtml(tx(m))}</li>`).join("")}</ul>`,
    }),
    ...(conta.conectada && faltam.length > 0
      ? [`<div class="linha"><div class="aviso erro">${e("contas.faltamPermissoes", { lista: faltam.join(", ") })}</div></div>`]
      : []),
    ...(c.fila ? [] : [`<div class="linha"><div class="aviso info">${e("contas.semFila")}</div></div>`]),
    ...(c.exemplo ? [`<div class="linha"><div class="aviso info">${e("contas.exemploAjuda")}</div></div>`] : []),
  ];
  return grupo(titulo, linhas, { id: `conta-${c.id}`, attrs: atributos, extra: formularioDeConexao(c) });
}

export function paginaContas(vistas: VistaConector[], falhas: readonly FalhaDeCarga[], agora: Date, contadores: Contadores = SEM_CONTADORES): string {
  const nenhuma = vistas.filter((v) => v.ativo).every((v) => !v.conta.conectada);
  const conteudo = `
  <div><h2>${e("aba.contas")}</h2><p class="leg">${e("contas.subtitulo")}</p></div>
  ${nenhuma ? `<div class="aviso info">${e("contas.nenhuma")}</div>` : ""}
  ${falhas.map((f) => `<div class="aviso erro" role="status">${e("contas.falhaCarga", { arquivo: f.arquivo, motivo: f.motivo })}</div>`).join("")}
  ${vistas.map((v) => blocoDoConector(v, agora)).join("")}
  <p class="leg">${t("contas.rodape", { link: `<a href="/prontidao" data-nav>${e("aba.prontidao")}</a>` })}</p>`;
  return casca({ aba: "contas", titulo: nomeDaAba("contas"), conteudo, contadores, atualizarACada: 0 });
}

// ------------------------------------------------------------------ Prontidão

/** Passos que o cliente precisa providenciar (PUBLICACAO.md). */
const PROVIDENCIAR = [1, 2, 3, 4, 5, 6];

export function paginaProntidao(
  redes: ProntidaoRede[],
  ia: { ok: boolean; falta?: string | undefined },
  contadores: Contadores = SEM_CONTADORES,
  desligadas: { id: string; nome: string }[] = [],
): string {
  const limitesDeLegenda = redes.filter((r) => r.limiteLegenda !== null).map((r) => `${r.nome} ${r.limiteLegenda}`).join(", ");
  const algumaReal = redes.some((r) => r.prontaParaPublicarDeVerdade);
  const faixa = algumaReal
    ? `<div class="aviso ok">${e("pront.prontoEm", { redes: redes.filter((r) => r.prontaParaPublicarDeVerdade).map((r) => r.nome).join(", ") })}</div>`
    : `<div class="aviso erro" role="status"><strong>${e("pront.nenhumaPronta")}</strong> ${e("pront.nenhumaProntaTexto")}</div>`;
  const cartao = (r: ProntidaoRede): string => {
    const estado = r.prontaParaPublicarDeVerdade
      ? `<span class="selo ok">${e("pront.pronta")}</span>`
      : r.prontaParaModoSeco
        ? `<span class="selo espera">${e("pront.soSeco")}</span>`
        : `<span class="selo erro">${e("contas.naoConectada")}</span>`;
    const faltam = r.itens.filter((i) => !i.ok).length;
    const uso = r.uso24h.limite !== null
      ? t("pront.uso", { usado: r.uso24h.usado, limite: r.uso24h.limite })
      : t("pront.usoSemLimite", { usado: r.uso24h.usado });
    return `<section class="config-grupo" data-rede="${r.rede}" id="prontidao-${r.rede}">
      <div><h3>${escaparHtml(r.nome)} ${r.exemplo ? `<span class="selo">${e("contas.exemploSelo")}</span> ` : ""}${estado}</h3>
        <p class="linha-ajuda">${faltam === 0 ? e("pront.todosCumpridos") : escaparHtml(tp("pront.itensFaltam", faltam))}</p></div>
      <p class="pront-resumo" data-resumo><strong>${e("pront.resumoRotulo")}</strong> ${escaparHtml(r.resumo)}</p>
      <ul class="checklist">${r.itens
        .map(
          (i) => `<li class="${i.ok ? "ok" : "falta"}"><span class="marca-item" aria-hidden="true">${i.ok ? "✓" : "✗"}</span>
          <div><span>${escaparHtml(i.descricao)}</span><span class="sr-only"> ${e(i.ok ? "pront.srOk" : "pront.srFalta")}</span>${i.ok || !i.falta ? "" : `<div class="leg">${escaparHtml(i.falta)}</div>`}</div></li>`,
        )
        .join("")}</ul>
      <div class="aviso info"><strong>${e("pront.prazoReal")}</strong> ${escaparHtml(r.prazo)}</div>
      <p class="linha-ajuda" style="margin-top:8px">${escaparHtml(uso)}</p>
    </section>`;
  };
  const conteudo = `
  <div><h2>${e("aba.prontidao")}</h2><p class="leg">${e("pront.subtitulo")}</p><p class="leg">${e("pront.glossario")}</p></div>
  ${faixa}
  ${redes.map(cartao).join("")}
  ${desligadas.length > 0 ? `<p class="leg" data-desligadas>${t("pront.desligadas", { redes: escaparHtml(desligadas.map((d) => d.nome).join(", ")), link: `<a href="/contas" data-nav>${e("aba.contas")}</a>` })}</p>` : ""}
  <section class="config-grupo">
    <h3 style="margin-bottom:8px">${e("pront.legendaIa")}</h3>
    <p>${ia.ok ? `<span class="selo ok">${e("ajustes.ia.presente")}</span>` : `<span class="selo erro">${e("ajustes.ia.ausente")}</span>`}</p>
    ${ia.ok ? "" : `<p class="leg" style="margin-top:8px">${e("pront.semChave")} <a href="/configuracoes" data-nav>${e("redes.abrirAjustes")}</a></p>`}
    ${limitesDeLegenda ? `<p class="leg" style="margin-top:8px">${e("pront.limiteLegenda", { lista: limitesDeLegenda })}</p>` : ""}
  </section>
  <section class="config-grupo">
    <h3 style="margin-bottom:8px">${e("pront.providenciar.titulo")}</h3>
    <p class="leg" style="margin-bottom:8px">${e("pront.providenciar.texto")}</p>
    <ul class="lista-simples">${PROVIDENCIAR.map((n) => `<li>${e(`pront.prov.${n}` as Chave)}</li>`).join("")}</ul>
  </section>`;
  return casca({ aba: "prontidao", titulo: nomeDaAba("prontidao"), conteudo, contadores, atualizarACada: 0 });
}
