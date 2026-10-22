// JavaScript do navegador, sem build. Fica como texto para o servidor entregar em /painel.js.
// Cuidado ao editar: está dentro de um template literal; sem crases e sem "dollar-chave" aqui dentro.

import { Idioma, catalogoDoNavegador, localeDe } from "./idioma/index.js";

/**
 * Início do script: o idioma, o pedaço do catálogo que o navegador usa e as funções T() e TP().
 * É texto gerado no servidor para cada idioma (o navegador nunca monta frase em português por conta própria).
 */
function preludio(idioma: Idioma): string {
  return `var IDIOMA = ${JSON.stringify(idioma)};
var LOCALE = ${JSON.stringify(localeDe(idioma))};
var I18N = ${JSON.stringify(catalogoDoNavegador(idioma))};
` + String.raw`
function preencher(m, p) {
  return m.replace(/\{(\w+)\}/g, function (x, n) { return p && p[n] !== undefined ? String(p[n]) : x; });
}
function T(k, p) { return preencher(Object.prototype.hasOwnProperty.call(I18N, k) ? I18N[k] : k, p); }
function TP(k, n, p) {
  var cat = IDIOMA === "pt-BR" ? (n === 1 ? "one" : "other") : new Intl.PluralRules(LOCALE).select(n);
  var m = I18N[k + "." + cat] || I18N[k + ".other"] || k;
  var q = { n: n }; if (p) for (var c in p) q[c] = p[c];
  return preencher(m, q);
}
`;
}

/** Apresentação dos erros: frase humana para os códigos conhecidos; o resto mostra o que o servidor mandou. */
export function errosJs(idioma: Idioma): string {
  return preludio(idioma) + String.raw`
var MENSAGENS_POR_CODIGO = {
  chave_ausente: { texto: "js.erro.chave_ausente", link: { href: "/configuracoes", rotulo: "js.link.ajustes" } },
  escritor_falhou: { texto: "js.erro.escritor_falhou" },
  nao_conectada: { texto: "js.erro.nao_conectada", link: { href: "/contas", rotulo: "js.link.contas" } },
  video_nao_aprovado: { texto: "js.erro.video_nao_aprovado", link: { href: "/fila", rotulo: "js.link.fila" } },
  sem_mp4: { texto: "js.erro.sem_mp4" },
  limite_diario: { texto: "js.erro.limite_diario" },
  visibilidade_obrigatoria: { texto: "js.erro.visibilidade_obrigatoria" },
  ja_publicada: { texto: "js.erro.ja_publicada" },
  ja_agendada: { texto: "js.erro.ja_agendada" },
  no_passado: { texto: "js.erro.no_passado" },
  periodo_invalido: { texto: "js.erro.periodo_invalido" }
};
function mensagemDeErro(e) {
  var m = e && e.codigo && Object.prototype.hasOwnProperty.call(MENSAGENS_POR_CODIGO, e.codigo) ? MENSAGENS_POR_CODIGO[e.codigo] : null;
  return m
    ? { texto: T(m.texto), link: m.link ? { href: m.link.href, rotulo: T(m.link.rotulo) } : null }
    : { texto: e && e.message ? e.message : String(e), link: null };
}
`;
}

/** Os mesmos scripts em português: o que os testes e qualquer leitura de código enxergam. */
export const ERROS_JS = errosJs("pt-BR");

const CORPO_JS = String.raw`
(function () {
  "use strict";
  var corpo = document.body;

  // ---------- tema: "claro" (padrão), "escuro" ou "sistema" (segue prefers-color-scheme) ----------
  var escuroDoSistema = window.matchMedia("(prefers-color-scheme: dark)");
  function lerTema() {
    try {
      var p = localStorage.getItem("painel-tema");
      if (p === "escuro" || p === "dark") return "dark";
      if (p === "sistema" || p === "system") return "system";
    } catch (e) {}
    return "light";
  }
  function guardarTema(pref) { try { localStorage.setItem("painel-tema", pref); } catch (e) {} }
  function aplicarTema(pref) {
    var escuro = pref === "dark" || (pref === "system" && escuroDoSistema.matches);
    if (escuro) corpo.setAttribute("data-ds-dark-theme", ""); else corpo.removeAttribute("data-ds-dark-theme");
    var b = document.getElementById("alternar-tema");
    if (b) { var r = b.getAttribute(escuro ? "data-rotulo-claro" : "data-rotulo-escuro"); if (r) { b.setAttribute("aria-label", r); b.title = r; } }
    document.querySelectorAll('input[name="tema"]').forEach(function (i) { i.checked = i.value === pref; });
  }
  aplicarTema(lerTema());
  escuroDoSistema.addEventListener("change", function () { if (lerTema() === "system") aplicarTema("system"); });

  // ---------- avisos (erros no idioma escolhido, sempre visíveis) ----------
  function aviso(tipo, texto, link) {
    var area = document.getElementById("avisos");
    var el = document.createElement("div");
    el.className = "aviso " + tipo;
    el.setAttribute("role", tipo === "erro" ? "alert" : "status");
    var span = document.createElement("span");
    span.textContent = texto;
    var x = document.createElement("button");
    x.className = "btn ghost pequeno"; x.type = "button"; x.textContent = T("acao.fechar");
    x.addEventListener("click", function () { el.remove(); });
    el.appendChild(span);
    if (link) {
      var a = document.createElement("a");
      a.className = "btn outline pequeno"; a.href = link.href; a.textContent = link.rotulo;
      el.appendChild(a);
    }
    el.appendChild(x);
    area.appendChild(el);
    if (tipo !== "erro") setTimeout(function () { el.remove(); }, 8000);
  }

  // ---------- chamada ao servidor ----------
  function chamar(metodo, url, dados) {
    var opcoes = { method: metodo, headers: {} };
    if (dados !== undefined) { opcoes.headers["content-type"] = "application/json"; opcoes.body = JSON.stringify(dados); }
    return fetch(url, opcoes).then(function (r) {
      return r.text().then(function (t) {
        var j = {};
        try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; }
        if (!r.ok) {
          var e2 = new Error(j.erro || j.motivo || T("js.erroServidor", { status: r.status }));
          e2.codigo = j.codigo; e2.status = r.status; e2.corpo = j;
          throw e2;
        }
        return j;
      });
    }, function () {
      var er = new Error(T("js.semServidor")); er.rede = true; throw er;
    });
  }

  // ---------- atualização sozinha, sem perder o que a pessoa está fazendo ----------
  var assinatura = null; var navegando = false;
  function principal() { return document.getElementById("conteudo"); }
  function semVivos(raiz) {
    var c = raiz.cloneNode(true);
    c.querySelectorAll('[data-viva="sempre"]').forEach(function (n) { n.remove(); });
    return c.innerHTML;
  }
  function ocupado() {
    var m = principal();
    if (m.querySelector(".painel:not([hidden])")) return true;
    if (m.querySelector("details[open]")) return true;
    if (m.querySelector(".btn.ocupado")) return true;
    var a = document.activeElement;
    if (a && m.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
    var vs = m.querySelectorAll("video");
    for (var i = 0; i < vs.length; i++) if (!vs[i].paused && !vs[i].ended) return true;
    return false;
  }
  function atualizarContagem() {
    var c = {}; try { c = JSON.parse(principal().getAttribute("data-contadores") || "{}"); } catch (e) { c = {}; }
    document.querySelectorAll("[data-contador]").forEach(function (el) {
      var n = Number(c[el.getAttribute("data-contador")] || 0);
      el.textContent = String(n); el.hidden = n === 0;
      var t = n + " " + el.getAttribute("data-rotulo"); el.title = t; el.setAttribute("aria-label", t);
    });
  }
  function marcarAba() {
    var m = principal(); var atual = m.getAttribute("data-aba");
    document.querySelectorAll(".nav a").forEach(function (a) {
      if (a.getAttribute("data-aba") === atual) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = m.getAttribute("data-titulo") + " — " + T("app.nome");
  }
  // Cada cartão guarda a assinatura do HTML que o servidor mandou. Só se troca o cartão cujo HTML mudou:
  // o resto da lista (vídeo tocando, texto sendo editado, posição de rolagem) não é tocado.
  function marcarAssinaturas(raiz) {
    raiz.querySelectorAll("#lista-fila > [data-id]").forEach(function (c) { if (c.sig === undefined) c.sig = c.outerHTML; });
  }
  function cartaoOcupado(c) {
    if (c.querySelector(".painel:not([hidden]), .btn.ocupado, details[open]")) return true;
    var a = document.activeElement;
    if (a && c.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return true;
    var vs = c.querySelectorAll("video");
    for (var i = 0; i < vs.length; i++) if (!vs[i].paused && !vs[i].ended) return true;
    return false;
  }
  function reconciliarLista(atual, nova, alvoId) {
    var porId = {};
    Array.prototype.forEach.call(atual.children, function (c) { var id = c.getAttribute("data-id"); if (id) porId[id] = c; });
    var cartoesNovos = Array.prototype.filter.call(nova.children, function (n) { return n.getAttribute("data-id"); });
    if (cartoesNovos.length === 0 || Object.keys(porId).length === 0) { // lista vazia (ou voltando de vazia): troca tudo
      atual.innerHTML = nova.innerHTML; marcarAssinaturas(atual); return;
    }
    var vistos = {};
    cartoesNovos.forEach(function (n, posicao) {
      var id = n.getAttribute("data-id"); vistos[id] = true;
      var existente = porId[id]; var no;
      if (!existente) { no = n; no.sig = n.outerHTML; }
      else if (existente.sig === n.outerHTML) { no = existente; }
      else if (!cartaoOcupado(existente) || id === alvoId) { n.sig = n.outerHTML; existente.replaceWith(n); no = n; }
      else { no = existente; }
      if (atual.children[posicao] !== no) atual.insertBefore(no, atual.children[posicao] || null);
    });
    Object.keys(porId).forEach(function (id) { if (!vistos[id] && (!cartaoOcupado(porId[id]) || id === alvoId)) porId[id].remove(); });
  }
  function atualizarVivos(m, novo) {
    novo.querySelectorAll('[data-viva="sempre"]').forEach(function (n) {
      var alvo = m.querySelector('[data-viva-id="' + n.getAttribute("data-viva-id") + '"]');
      if (alvo) alvo.innerHTML = n.innerHTML;
    });
  }
  function trocar(novo, forcar, alvoId) {
    var m = principal();
    var rolagem = window.scrollY;
    var listaAtual = m.querySelector("#lista-fila"); var listaNova = novo.querySelector("#lista-fila");
    if (listaAtual && listaNova && m.getAttribute("data-aba") === novo.getAttribute("data-aba")) {
      atualizarVivos(m, novo);
      var cabA = m.querySelector(".cartao-cab"); var cabN = novo.querySelector(".cartao-cab");
      if (cabA && cabN && cabA.innerHTML !== cabN.innerHTML) cabA.innerHTML = cabN.innerHTML;
      reconciliarLista(listaAtual, listaNova, alvoId);
    } else {
      var nova = semVivos(novo);
      var mudou = nova !== assinatura;
      var podeTrocar = forcar || !ocupado();
      if (mudou && podeTrocar) {
        // quem navega por teclado não pode perder o lugar quando a tela se atualiza
        var foco = document.activeElement; var focoAcao = foco && foco.getAttribute ? foco.getAttribute("data-acao") : null;
        var focoSite = foco && foco.getAttribute ? foco.getAttribute("data-site") : null; var focoId = foco && foco.id;
        m.innerHTML = novo.innerHTML; assinatura = nova;
        var volta = focoId ? document.getElementById(focoId) : (focoAcao ? m.querySelector('[data-acao="' + focoAcao + '"]' + (focoSite ? '[data-site="' + focoSite + '"]' : "")) : null);
        if (volta && m.contains(volta) && foco !== document.body) volta.focus({ preventScroll: true });
      } else {
        atualizarVivos(m, novo);
      }
      marcarAssinaturas(m);
    }
    ["data-contadores", "data-poll", "data-titulo", "data-aba"].forEach(function (k) {
      m.setAttribute(k, novo.getAttribute(k) || "");
    });
    atualizarContagem(); marcarAba(); prepararTela();
    if (Math.abs(window.scrollY - rolagem) > 1 && !navegando) window.scrollTo(0, rolagem); // atualizar nunca mexe na rolagem
  }
  function buscarTela(url) {
    return fetch(url, { headers: { "x-painel": "1" } }).then(function (r) { return r; }, function () {
      var e = new Error(T("js.semServidor")); e.rede = true; throw e;
    }).then(function (r) {
      if (!r.ok) throw new Error(T("js.naoAtualizou", { status: r.status }));
      return r.text();
    }).then(function (t) {
      return new DOMParser().parseFromString(t, "text/html").getElementById("conteudo");
    });
  }
  // Servidor fora do ar durante a atualização automática não é erro da pessoa: aviso calmo, nova tentativa sozinha, espera crescente.
  var tentativasRede = 0, retomada = null;
  function reconectando(ligado) {
    var area = document.getElementById("avisos"), el = document.getElementById("aviso-reconectando");
    if (ligado && !el) {
      el = document.createElement("div"); el.id = "aviso-reconectando"; el.className = "aviso info"; el.setAttribute("role", "status");
      el.textContent = T("js.reconectando"); area.appendChild(el);
    }
    if (!ligado && el) el.remove();
  }
  function atualizar(forcar, alvoId) {
    return buscarTela(location.pathname + location.search).then(function (n) {
      trocar(n, forcar, alvoId); tentativasRede = 0; reconectando(false); return true;
    }).catch(function (e) { if (e && e.rede) reconectando(true); return false; });
  }
  function tentarDeNovo() {
    clearTimeout(retomada);
    var ms = Math.min(30000, 2000 * Math.pow(2, tentativasRede)); tentativasRede++;
    retomada = setTimeout(function () { atualizar(false).then(function (ok) { if (ok) agendarVolta(); else tentarDeNovo(); }); }, ms);
  }
  var temporizador = null;
  function agendarVolta() {
    clearTimeout(temporizador);
    var ms = Number(principal().getAttribute("data-poll") || 0);
    if (ms > 0) temporizador = setTimeout(function () {
      if (document.hidden) { agendarVolta(); return; }
      atualizar(false).then(function (ok) { if (ok) agendarVolta(); else tentarDeNovo(); });
    }, ms);
  }

  // ---------- navegação entre telas sem recarregar ----------
  function irPara(url, empilhar) {
    return buscarTela(url).then(function (n) {
      if (empilhar) history.pushState({}, "", url);
      assinatura = null; navegando = true; trocar(n, true); navegando = false; agendarVolta();
      var h = location.hash && document.getElementById(location.hash.slice(1));
      if (h) h.scrollIntoView({ block: "start" }); else window.scrollTo(0, 0);
      principal().focus({ preventScroll: true });
    }).catch(function () { location.href = url; });
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("a[data-nav]");
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    gaveta(false, false);
    var destino = a.getAttribute("href");
    if (a.getAttribute("aria-current") === "page" && a.closest(".nav")) return;
    irPara(destino, true);
  });
  window.addEventListener("popstate", function () { irPara(location.pathname + location.search, false); });

  // ---------- barra lateral: recolher (guardado) e gaveta em tela estreita ----------
  var lateral = document.getElementById("lateral");
  var veu = document.querySelector(".lateral-veu");
  var larga = window.matchMedia("(min-width: 900px)");
  function ajustarInert() {
    var fechada = !larga.matches && corpo.getAttribute("data-gaveta") !== "aberta";
    if (fechada) lateral.setAttribute("inert", ""); else lateral.removeAttribute("inert");
  }
  function aplicarLateral(recolhida) {
    if (recolhida) corpo.setAttribute("data-lateral", "recolhida"); else corpo.removeAttribute("data-lateral");
    var b = document.getElementById("recolher");
    var t = recolhida ? T("app.expandir") : T("app.recolher");
    b.setAttribute("aria-expanded", recolhida ? "false" : "true"); b.setAttribute("aria-label", t); b.title = t;
  }
  function gaveta(abrir, devolverFoco) {
    var estava = corpo.getAttribute("data-gaveta") === "aberta";
    if (abrir) corpo.setAttribute("data-gaveta", "aberta"); else corpo.removeAttribute("data-gaveta");
    veu.hidden = !abrir;
    var b = document.getElementById("abrir-gaveta");
    b.setAttribute("aria-expanded", abrir ? "true" : "false");
    ajustarInert();
    if (abrir) { var p = lateral.querySelector('a[aria-current="page"]') || lateral.querySelector("a"); if (p) p.focus(); }
    else if (estava && devolverFoco) b.focus();
  }
  larga.addEventListener("change", function () { gaveta(false, false); });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && corpo.getAttribute("data-gaveta") === "aberta") { gaveta(false, true); }
  });
  (function () {
    var rec = false; try { rec = localStorage.getItem("painel-lateral") === "recolhida"; } catch (e) {}
    aplicarLateral(rec); ajustarInert();
  })();

  // ---------- botão ocupado ----------
  function ocupar(botao, texto) {
    var card = botao.closest("[data-card]") || principal();
    var todos = card.querySelectorAll(".btn");
    todos.forEach(function (b) { if (!b.disabled) { b.disabled = true; b.setAttribute("data-reabilitar", "1"); } });
    botao.setAttribute("data-rotulo", botao.textContent);
    botao.textContent = texto; botao.classList.add("ocupado");
    // o cartão inteiro se mostra trabalhando, e nada nele pode ser clicado de novo
    card.classList.add("trabalhando"); card.setAttribute("aria-busy", "true");
    var faixa = null;
    if (card.hasAttribute("data-id") && card.querySelector(".fila-corpo")) {
      faixa = document.createElement("div"); faixa.className = "trabalho-acao"; faixa.setAttribute("role", "status"); faixa.textContent = texto;
      card.querySelector(".fila-corpo").insertBefore(faixa, card.querySelector(".fila-corpo").firstChild);
    }
    return function liberar() {
      card.classList.remove("trabalhando"); card.removeAttribute("aria-busy"); if (faixa) faixa.remove();
      todos.forEach(function (b) { if (b.getAttribute("data-reabilitar")) { b.disabled = false; b.removeAttribute("data-reabilitar"); } });
      if (document.body.contains(botao)) { botao.textContent = botao.getAttribute("data-rotulo"); botao.classList.remove("ocupado"); }
    };
  }
  function executar(botao, textoOcupado, fazer, aoTerminar) {
    var cartaoAlvo = botao.closest("[data-card]"); var alvoId = cartaoAlvo ? cartaoAlvo.getAttribute("data-id") : null;
    var liberar = ocupar(botao, textoOcupado);
    return fazer().then(function (r) {
      liberar();
      if (aoTerminar) aoTerminar(r);
      return atualizar(true, alvoId);
    }, function (e) {
      liberar();
      var m = mensagemDeErro(e);
      aviso("erro", m.texto, m.link);
    });
  }

  function executarLocal(botao, textoOcupado, fazer, aoTerminar) {
    var liberar = ocupar(botao, textoOcupado);
    return fazer().then(function (r) { liberar(); if (aoTerminar) aoTerminar(r); }, function (e) {
      liberar(); var m = mensagemDeErro(e); aviso("erro", m.texto, m.link);
    });
  }

  // ---------- hora de Brasília (o servidor guarda UTC; Brasília é UTC-3 o ano todo) ----------
  var FMT_BR = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  function partesBr(iso) {
    var o = {}; FMT_BR.formatToParts(new Date(iso)).forEach(function (p) { o[p.type] = p.value; });
    var h = o.hour === "24" ? "00" : o.hour;
    return { dia: o.year + "-" + o.month + "-" + o.day, hora: h + ":" + o.minute, texto: T("tempo.formato", { d: o.day, m: o.month, y: o.year, h: h, min: o.minute }) + " " + T("tempo.fuso") };
  }
  function paraIso(dia, hora) { return new Date(dia + "T" + hora + ":00-03:00").toISOString(); }
  function avisoDeConflito(area, e, usar) {
    var c = e.corpo || {}; var p = partesBr(c.proximoHorarioLivre);
    area.textContent = T("js.conflito", { min: c.espacamentoMinutos, quando: p.texto }) + " ";
    var b = document.createElement("button"); b.type = "button"; b.className = "btn outline pequeno"; b.textContent = T("js.usarHorario", { hora: p.hora, dia: T("tempo.diaMes", { d: p.dia.slice(8, 10), m: p.dia.slice(5, 7) }) });
    b.addEventListener("click", function () { usar(p); });
    area.appendChild(b); area.hidden = false;
  }
  function avisoDaExecucao(r) {
    if (r.resultado === "publicada") aviso("ok", T(r.simulado ? "js.publicadoSeco" : "js.publicado"));
    else if (r.resultado === "ja_publicada") aviso("ok", T("js.jaEstavaPublicado"));
    else if (r.resultado === "em_andamento") aviso("info", T("js.emAndamento"));
    else if (r.resultado === "tentara_de_novo") aviso("info", T("js.tentaraDeNovo") + (r.motivo ? " " + T("js.motivoSufixo", { motivo: r.motivo }) : ""));
    else aviso("ok", T("js.pronto"));
  }

  // ---------- legenda por rede: prévia ao vivo ----------
  function cortar(texto, n) {
    var limpo = texto.replace(/\s+/g, " ").trim(); var l = Array.from(limpo);
    return l.length > n ? l.slice(0, n).join("").replace(/\s+$/, "") + T("redes.mais") : limpo;
  }
  function atualizarPrevia(campo) {
    var card = campo.closest("[data-card]"); if (!card) return;
    var rede = campo.getAttribute("data-legenda");
    var p = card.querySelector('[data-previa-texto="' + rede + '"]');
    if (p) p.textContent = cortar(campo.value, Number(p.getAttribute("data-corte")));
    var c = card.querySelector('[data-previa-contagem="' + rede + '"]');
    if (c) c.textContent = T("redes.previaContagem", { n: Array.from(campo.value).length, limite: c.getAttribute("data-limite") });
  }
  document.addEventListener("input", function (ev) { if (ev.target.matches("[data-legenda]")) atualizarPrevia(ev.target); });
  function definirLegenda(card, rede, texto, origem) {
    var campo = card.querySelector('[data-legenda="' + rede + '"]'); if (!campo) return;
    campo.value = texto; contar(campo); atualizarPrevia(campo);
    var o = card.querySelector('[data-origem="' + rede + '"]');
    if (o) o.textContent = T(origem === "manual" ? "redes.origem.manual" : "redes.origem.ia") + " " + T("redes.limite", { n: campo.getAttribute("maxlength") });
  }

  // ---------- validação por rede no formulário do calendário ----------
  var validacaoSeq = 0;
  function validarMarcar() {
    var f = document.getElementById("form-marcar"); if (!f) return;
    var video = f.elements["video"].value; if (!video) return;
    var vis = (f.querySelector('input[name="visibilidade"]:checked') || {}).value || "publica";
    var chave = video + ":" + vis;
    if (f.getAttribute("data-validado") === chave) return;
    f.setAttribute("data-validado", chave);
    var seq = ++validacaoSeq;
    chamar("GET", "/api/videos/" + video + "/validacao?visibilidade=" + vis).then(function (r) {
      if (seq !== validacaoSeq) return;
      r.redes.forEach(function (v) {
        var box = f.querySelector('input[name="rede"][value="' + v.rede + '"]');
        var msg = f.querySelector('[data-valida="' + v.rede + '"]');
        if (!box || !msg) return;
        if (!msg.hasAttribute("data-base")) msg.setAttribute("data-base", msg.innerHTML);
        if (box.hasAttribute("data-sem-conta")) return;
        if (!v.ok) {
          box.disabled = true; box.checked = false;
          msg.textContent = T("js.naoPassa", { motivo: v.bloqueios.map(function (b) { return b.mensagem; }).join(" ") });
        } else { box.disabled = false; msg.innerHTML = msg.getAttribute("data-base"); }
      });
    }, function (e) {
      f.removeAttribute("data-validado");
      if (e && e.rede) return;
      var m = mensagemDeErro(e); aviso("erro", T("js.naoValidou", { erro: m.texto }), m.link);
    });
  }
  document.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.matches && t.matches('input[name="tema"]')) { guardarTema(t.value); aplicarTema(t.value); return; }
    if (t.matches && t.matches("[data-site-modo]")) {
      chamar("POST", "/api/sites/" + encodeURIComponent(t.getAttribute("data-site")) + "/modo", { modo: t.value }).then(function () {
        aviso("ok", T("js.sites.modoSalvo")); return atualizar(true);
      }, function (er) { var mm = mensagemDeErro(er); aviso("erro", mm.texto, mm.link); });
      return;
    }
    if (t.matches && t.matches("[data-idioma-anuncio]")) {
      chamar("POST", "/api/ajustes", { chave: "idioma_anuncio", valor: t.value }).then(function () { aviso("ok", T("js.idiomaSalvo")); },
        function (er) { var mm = mensagemDeErro(er); aviso("erro", mm.texto, mm.link); });
      return;
    }
    if (t.matches && t.matches("[data-idioma-painel]")) {
      document.cookie = "painel-idioma=" + encodeURIComponent(t.value) + "; path=/; max-age=31536000; SameSite=Lax";
      location.reload(); return;
    }
    if (t.matches && t.matches("#form-marcar select, #form-marcar input[name=visibilidade]")) validarMarcar();
    if (t.matches && t.matches('#form-marcar input[name="rede"]')) {
      var tk = document.querySelector('#form-marcar input[name="rede"][value="tiktok"]');
      document.querySelector("#form-marcar [data-so-tiktok]").hidden = !(tk && tk.checked);
    }
    if (t.matches && t.matches('.form-conta input[name="modo"]')) {
      var f = t.closest("form"); f.querySelector("[data-so-real]").hidden = t.value === "seco";
    }
  });

  // ---------- painéis de cada cartão ----------
  function abrirPainel(botao, nome) {
    var card = botao.closest("[data-card]");
    card.querySelectorAll(".painel").forEach(function (p) { p.hidden = p.getAttribute("data-painel") !== nome || !p.hidden; });
    card.querySelectorAll("[data-abre]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-expanded", "false"); });
    var aberto = card.querySelector('.painel[data-painel="' + nome + '"]:not([hidden])');
    if (aberto) {
      botao.setAttribute("aria-pressed", "true"); botao.setAttribute("aria-expanded", "true");
      var menos = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      aberto.scrollIntoView({ block: "nearest", behavior: menos ? "auto" : "smooth" });
    }
  }
  function lerOrdem(card) {
    return Array.prototype.map.call(card.querySelectorAll(".ordem-item"), function (li) { return Number(li.getAttribute("data-foto")); });
  }
  function moverFoto(botao, delta) {
    var li = botao.closest(".ordem-item"); var lista = li.parentNode;
    var alvo = delta < 0 ? li.previousElementSibling : li.nextElementSibling;
    if (!alvo) return;
    if (delta < 0) lista.insertBefore(li, alvo); else lista.insertBefore(alvo, li);
    lista.setAttribute("data-mudou", "1");
  }
  function contar(campo) {
    var c = campo.parentNode.querySelector(".contador"); if (!c) return;
    var max = Number(campo.getAttribute("maxlength"));
    c.textContent = campo.value.length + " / " + max;
    c.classList.toggle("estouro", campo.value.length >= max);
  }
  function prepararTela() {
    aplicarTema(lerTema());
    principal().querySelectorAll("[maxlength]").forEach(contar);
    validarMarcar();
  }
  document.addEventListener("input", function (ev) { if (ev.target.matches("[maxlength]")) contar(ev.target); });

  // ---------- formulários de configuração: Salvar e Descartar só aparecem quando há mudança ----------
  function sujo(f) {
    var mudou = false;
    f.querySelectorAll("[data-inicial]").forEach(function (c) {
      var diff = c.value !== c.getAttribute("data-inicial");
      var linha = c.closest(".linha"); var u = linha && linha.querySelector('[data-acao="desfazer"]');
      if (u) u.hidden = !diff;
      if (diff) mudou = true;
    });
    var pe = f.querySelector("[data-pe]"); if (pe) pe.hidden = !mudou;
  }
  function aoMudarConfig(ev) { var f = ev.target.closest && ev.target.closest("[data-config-form]"); if (f) sujo(f); }
  document.addEventListener("input", aoMudarConfig);
  document.addEventListener("change", aoMudarConfig);

  // ---------- arte do vídeo ao passar o mouse (ou focar) numa marcação do calendário ----------
  var flutuante = null;
  function mostrarCartao(chip) {
    var modelo = chip.parentNode.querySelector(".chip-info"); if (!modelo) return;
    if (!flutuante) {
      flutuante = document.createElement("div"); flutuante.id = "cartao-flutuante"; flutuante.className = "cartao-flutuante";
      flutuante.setAttribute("role", "tooltip"); document.body.appendChild(flutuante);
    }
    flutuante.innerHTML = modelo.innerHTML; flutuante.hidden = false;
    var r = chip.getBoundingClientRect(); var w = flutuante.offsetWidth; var h = flutuante.offsetHeight;
    var x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    var y = r.bottom + 8; if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    flutuante.style.left = x + "px"; flutuante.style.top = y + "px";
    chip.setAttribute("aria-describedby", "cartao-flutuante");
  }
  function esconderCartao(chip) { if (flutuante) flutuante.hidden = true; if (chip) chip.removeAttribute("aria-describedby"); }
  function chipDe(ev) { return ev.target.closest ? ev.target.closest(".chip[data-cartao]") : null; }
  document.addEventListener("mouseover", function (ev) { var c = chipDe(ev); if (c) mostrarCartao(c); });
  document.addEventListener("mouseout", function (ev) { var c = chipDe(ev); if (c && !c.contains(ev.relatedTarget)) esconderCartao(c); });
  document.addEventListener("focusin", function (ev) { var c = chipDe(ev); if (c) mostrarCartao(c); });
  document.addEventListener("focusout", function (ev) { var c = chipDe(ev); if (c) esconderCartao(c); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && flutuante && !flutuante.hidden) esconderCartao(null); });

  // ---------- ações ----------

  document.addEventListener("click", function (ev) {
    var interruptor = ev.target.closest(".chave[data-campo]");
    if (interruptor) { interruptor.setAttribute("aria-checked", interruptor.getAttribute("aria-checked") === "true" ? "false" : "true"); return; }
    var el = ev.target.closest("[data-acao],[data-abre],[data-escolha]");
    if (!el || el.disabled) return;
    var card = el.closest("[data-card]");
    var id = card ? card.getAttribute("data-id") : null;

    if (el.hasAttribute("data-abre")) { abrirPainel(el, el.getAttribute("data-abre")); return; }

    if (el.hasAttribute("data-escolha")) {
      el.parentNode.querySelectorAll("[data-escolha]").forEach(function (b) { b.setAttribute("aria-pressed", b === el ? "true" : "false"); });
      return;
    }

    var acao = el.getAttribute("data-acao");

    if (acao === "desfazer") {
      var campoD = el.closest(".linha").querySelector("[data-inicial]"); campoD.value = campoD.getAttribute("data-inicial");
      sujo(el.closest("[data-config-form]")); return;
    }
    if (acao === "descartar") { var fd = el.closest("form"); fd.reset(); setTimeout(function () { sujo(fd); }, 0); return; }

    // ----- chaves (switch): o estado é a posição da chave
    if (acao === "agendamento-alternar" || acao === "site-ativo") {
      var novo = el.getAttribute("aria-checked") !== "true";
      el.setAttribute("aria-checked", novo ? "true" : "false"); el.disabled = true;
      var pedido = acao === "agendamento-alternar"
        ? chamar("POST", "/api/agendamento", { ligado: novo })
        : chamar("POST", "/api/sites/" + encodeURIComponent(el.getAttribute("data-site")) + "/ativo", { ativo: novo });
      pedido.then(function () {
        el.disabled = false;
        aviso("ok", T(acao === "site-ativo" ? (novo ? "js.sites.ligado" : "js.sites.desligado") : (novo ? "js.agendamentoLigado" : "js.agendamentoDesligado")));
        return atualizar(true);
      }, function (er) {
        el.setAttribute("aria-checked", novo ? "false" : "true"); el.disabled = false;
        var mm = mensagemDeErro(er); aviso("erro", mm.texto, mm.link);
      });
      return;
    }

    // ----- sites
    if (acao === "site-confirmar") {
      var fs = document.getElementById("form-site");
      executar(el, T("js.sites.cadastrando"), function () {
        return chamar("POST", "/api/sites/cadastrar", { url: el.getAttribute("data-url"), adaptador: el.getAttribute("data-adaptador"), nome: fs.elements["nome"].value.trim(), modo: fs.elements["modo"].value });
      }, function (r) { aviso("ok", T("js.sites.adicionado", { nome: r.site.nome })); });
      return;
    }
    if (acao === "site-remover") {
      if (!window.confirm(T("js.sites.confirmarRemover"))) return;
      var idR = el.getAttribute("data-site");
      executar(el, T("js.sites.verificando"), function () { return chamar("POST", "/api/sites/" + encodeURIComponent(idR) + "/remover"); }, function () { aviso("ok", T("js.sites.removido")); });
      return;
    }
    if (acao === "site-navegador") {
      executarLocal(el, T("js.sites.verificando"), function () { return chamar("POST", "/api/sites/navegador"); }, function (r) {
        el.closest(".linha").querySelector("[data-navegador-resultado]").textContent = r.mensagem;
      });
      return;
    }

    if (acao === "tema") {
      var pref = corpo.hasAttribute("data-ds-dark-theme") ? "light" : "dark";
      guardarTema(pref); aplicarTema(pref); return;
    }
    if (acao === "recolher") {
      var rec = !corpo.hasAttribute("data-lateral");
      try { localStorage.setItem("painel-lateral", rec ? "recolhida" : "aberta"); } catch (e) {}
      aplicarLateral(rec); return;
    }
    if (acao === "gaveta") { gaveta(corpo.getAttribute("data-gaveta") !== "aberta", true); return; }
    if (acao === "fechar-gaveta") { gaveta(false, true); return; }

    // ----- calendário
    if (acao === "abrir-pub") {
      var pid = el.getAttribute("data-pub"); var alvo = document.getElementById("pub-" + pid);
      var abrir = alvo.hidden;
      document.querySelectorAll("#detalhes-pub .painel").forEach(function (p) { p.hidden = true; });
      document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-expanded", "false"); });
      if (abrir) {
        alvo.hidden = false; el.setAttribute("aria-expanded", "true");
        var menos2 = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        alvo.scrollIntoView({ block: "nearest", behavior: menos2 ? "auto" : "smooth" });
      }
      return;
    }
    if (acao === "fechar-pub") {
      var pn = el.closest(".painel"); pn.hidden = true;
      document.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-expanded", "false"); });
      return;
    }
    if (acao === "marcar-dia") {
      var fm = document.getElementById("form-marcar");
      if (!fm) { aviso("info", T("js.marcarSemForm")); return; }
      fm.elements["dia"].value = el.getAttribute("data-dia");
      fm.scrollIntoView({ block: "start" }); fm.elements["hora"].focus(); return;
    }
    if (acao === "remarcar" || acao === "desmarcar") {
      var pubId = el.getAttribute("data-pub"); var painelPub = el.closest(".painel");
      if (acao === "desmarcar") {
        executar(el, T("js.desmarcando"), function () { return chamar("POST", "/api/calendario/" + pubId + "/desmarcar"); },
          function () { aviso("ok", T("js.desmarcada")); });
        return;
      }
      var diaR = document.getElementById("rm-dia-" + pubId).value; var horaR = document.getElementById("rm-hora-" + pubId).value;
      if (!diaR || !horaR) { aviso("erro", T("js.escolhaDiaHora")); return; }
      var areaR = painelPub.querySelector("[data-conflito]"); if (areaR) areaR.hidden = true;
      var liberarR = ocupar(el, T("js.remarcando"));
      chamar("POST", "/api/calendario/" + pubId + "/remarcar", { quando: paraIso(diaR, horaR) }).then(function () {
        liberarR(); aviso("ok", T("js.remarcada")); return atualizar(true);
      }, function (e) {
        liberarR();
        if (e.codigo === "espacamento" && e.corpo && e.corpo.proximoHorarioLivre && areaR) {
          avisoDeConflito(areaR, e, function (p) {
            document.getElementById("rm-dia-" + pubId).value = p.dia; document.getElementById("rm-hora-" + pubId).value = p.hora;
            areaR.hidden = true; el.click();
          });
        } else { var m = mensagemDeErro(e); aviso("erro", m.texto, m.link); }
      });
      return;
    }

    // ----- publicações
    if (acao === "processar") {
      executar(el, T("js.processando"), function () { return chamar("POST", "/api/publicacoes/processar"); },
        function (r) { aviso("ok", r.verificadas === 0 ? T("js.nadaVencido") : TP("js.processadas", r.verificadas)); });
      return;
    }
    if (acao === "publicar-agora") {
      var pa = el.getAttribute("data-pub");
      executar(el, T("js.publicando"), function () { return chamar("POST", "/api/calendario/" + pa + "/publicar-agora"); }, avisoDaExecucao);
      return;
    }
    if (acao === "tentar-de-novo") {
      var corpoT = { rede: el.getAttribute("data-rede") };
      if (corpoT.rede === "tiktok") corpoT.visibilidade = el.getAttribute("data-visibilidade");
      executar(el, T("js.publicando"), function () { return chamar("POST", "/api/videos/" + el.getAttribute("data-video") + "/publicar", corpoT); }, avisoDaExecucao);
      return;
    }

    // ----- contas
    if (acao === "renovar") {
      var redeR = el.getAttribute("data-rede");
      executar(el, T("js.renovando"), function () { return chamar("POST", "/api/contas/" + redeR + "/renovar"); },
        function (r) { aviso("ok", T("js.tokenRenovado") + (r.rotacionouRefresh ? " " + T("js.refreshRotacionou") : "")); });
      return;
    }

    // ----- legenda por rede
    if (acao === "gerar-legendas") {
      executarLocal(el, T("js.escrevendo"), function () { return chamar("POST", "/api/videos/" + id + "/legendas/gerar"); },
        function (r) {
          r.legendas.forEach(function (l) { definirLegenda(card, l.rede, l.texto, l.manual ? "manual" : "ia"); });
          var man = r.mantidasManuais || [];
          aviso("ok", T("js.legendasEscritas") + (man.length ? " " + T("js.legendasMantidas") : ""));
        });
      return;
    }
    if (acao === "salvar-legenda") {
      var redeL = el.getAttribute("data-rede"); var campoL = card.querySelector('[data-legenda="' + redeL + '"]');
      executarLocal(el, T("js.salvando"), function () { return chamar("POST", "/api/videos/" + id + "/legendas/" + redeL, { texto: campoL.value }); },
        function () { definirLegenda(card, redeL, campoL.value, "manual"); aviso("ok", T("js.legendaSalva")); });
      return;
    }
    if (acao === "fechar") { var p = el.closest(".painel"); p.hidden = true; card.querySelectorAll("[data-abre]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); b.setAttribute("aria-expanded", "false"); }); return; }
    if (acao === "subir") { moverFoto(el, -1); return; }
    if (acao === "descer") { moverFoto(el, 1); return; }
    if (acao === "ordem-original") {
      var lista = card.querySelector(".ordem");
      Array.prototype.slice.call(lista.children).sort(function (a, b) { return Number(a.getAttribute("data-foto")) - Number(b.getAttribute("data-foto")); })
        .forEach(function (li) { lista.appendChild(li); });
      lista.setAttribute("data-mudou", "1"); return;
    }

    if (acao === "ia-testar" || acao === "ia-usar") {
      var cartaoIa = el.closest("[data-ia-provedor]"); var selIa = cartaoIa.querySelector("[data-ia-modelo]");
      var corpoIa = { provedor: el.getAttribute("data-provedor"), modelo: selIa ? selIa.value : undefined };
      var saidaIa = cartaoIa.querySelector("[data-ia-resultado]");
      if (acao === "ia-testar") {
        executarLocal(el, T("js.ia.testando"), function () { return chamar("POST", "/api/ia/testar", corpoIa); }, function (r) {
          saidaIa.textContent = r.mensagem; saidaIa.className = "leg ia-resultado " + (r.ok ? "ok" : "erro");
          cartaoIa.querySelector("[data-ia-modelos]").innerHTML = r.htmlModelos;
        });
      } else {
        executar(el, T("js.salvando"), function () { return chamar("POST", "/api/ia/escolher", corpoIa); }, function (r) { aviso("ok", r.mensagem); });
      }
      return;
    }

    if (acao === "aprovar") {
      executar(el, T("js.aprovando"), function () { return chamar("POST", "/api/videos/" + id + "/aprovar"); },
        function () { aviso("ok", T("js.aprovado")); });
    } else if (acao === "rejeitar") {
      var motivo = el.getAttribute("data-motivo");
      executar(el, T("js.rejeitando"), function () { return chamar("POST", "/api/videos/" + id + "/rejeitar", { motivo: motivo }); },
        function () { aviso("ok", T("js.rejeitado", { motivo: T("motivo." + motivo) })); });
    } else if (acao === "refazer") {
      var corpoReq = {};
      card.querySelectorAll('.painel[data-painel="refazer"] [data-grupo]').forEach(function (g) {
        var marcado = g.querySelector('[aria-pressed="true"]');
        if (marcado) corpoReq[g.getAttribute("data-grupo")] = marcado.getAttribute("data-escolha");
      });
      var ordem = card.querySelector(".ordem");
      if (ordem && ordem.getAttribute("data-mudou")) corpoReq.ordemFotos = lerOrdem(card);
      executar(el, T("js.enviandoFila"), function () { return chamar("POST", "/api/videos/" + id + "/refazer", corpoReq); },
        function () { aviso("ok", T("js.refeito")); });
    } else if (acao === "reescrever") {
      executar(el, T("js.reescrevendo"), function () { return chamar("POST", "/api/videos/" + id + "/reescrever-texto"); },
        function (r) {
          aviso("ok", T(r.videoDesatualizado ? "js.reescritoDesatualizado" : "js.reescrito"));
        }).then(function () {}, function () {});
    } else if (acao === "salvar-texto") {
      var t = card.querySelector('[name="titulo"]').value; var c = card.querySelector('[name="corpo"]').value;
      executar(el, T("js.salvando"), function () { return chamar("POST", "/api/videos/" + id + "/editar-texto", { titulo: t, corpo: c }); },
        function () { aviso("ok", T("js.textoSalvo")); });
    } else if (acao === "reler") {
      var pid = el.closest("[data-produto]").getAttribute("data-produto");
      executar(el, T("js.lendoSite"), function () { return chamar("POST", "/api/estoque/" + pid + "/reler"); },
        function () { aviso("ok", T("js.carroRelido")); });
    } else if (acao === "gerar-video") {
      var pid2 = el.closest("[data-produto]").getAttribute("data-produto");
      executar(el, T("js.enviandoFila"), function () { return chamar("POST", "/api/estoque/" + pid2 + "/gerar-video"); },
        function () { aviso("ok", T("js.videoNaFila")); });
    } else if (acao === "rodar-agora") {
      executar(el, T("js.lendoSite"), function () { return chamar("POST", "/api/agendamento/rodar-agora"); },
        function (r) {
          var novos = (r.resumo.itens || []).filter(function (i) { return i.enfileirado; }).length;
          aviso("ok", TP("js.rodadaConcluida", novos));
        });
    }
  });

  document.addEventListener("submit", function (ev) {
    var f = ev.target; ev.preventDefault();
    var botao = f.querySelector('button[type="submit"]');
    if (f.id === "form-site") {
      var areaS = f.querySelector("[data-site-resultado]"); var urlS = f.elements["url"].value.trim();
      if (!urlS) return;
      executarLocal(f.querySelector('[data-acao="site-testar"]'), T("js.sites.testando"), function () {
        return chamar("POST", "/api/sites/testar", { url: urlS, modo: f.elements["modo"].value });
      }, function (r) { areaS.innerHTML = r.html; });
      return;
    }
    if (f.id === "form-marcar") {
      var redesMarcadas = Array.prototype.map.call(f.querySelectorAll('input[name="rede"]:checked'), function (c) { return c.value; });
      if (!redesMarcadas.length) { aviso("erro", T("js.escolhaRede")); return; }
      var visM = (f.querySelector('input[name="visibilidade"]:checked') || {}).value;
      if (redesMarcadas.indexOf("tiktok") >= 0 && !visM) { aviso("erro", T("js.tiktokEscolha")); return; }
      var quando = paraIso(f.elements["dia"].value, f.elements["hora"].value);
      var areaM = document.getElementById("cal-conflito"); areaM.hidden = true;
      var liberarM = ocupar(botao, T("js.marcando"));
      var feitas = []; var atual = "";
      redesMarcadas.reduce(function (p, r) {
        return p.then(function () {
          atual = r;
          var corpoM = { videoId: Number(f.elements["video"].value), rede: r, quando: quando, iaGerado: f.querySelector('[data-campo="iaGerado"]').getAttribute("aria-checked") === "true" };
          if (r === "tiktok") corpoM.visibilidade = visM;
          return chamar("POST", "/api/calendario/agendar", corpoM).then(function () {
            feitas.push(r); f.querySelector('input[name="rede"][value="' + r + '"]').checked = false;
          });
        });
      }, Promise.resolve()).then(function () {
        liberarM(); aviso("ok", TP("js.publicacoesMarcadas", feitas.length)); return atualizar(true);
      }, function (e) {
        liberarM();
        if (feitas.length) aviso("ok", T("js.jaMarcado", { lista: feitas.join(", ") }));
        if (e.codigo === "espacamento" && e.corpo && e.corpo.proximoHorarioLivre) {
          avisoDeConflito(areaM, e, function (p) {
            f.elements["dia"].value = p.dia; f.elements["hora"].value = p.hora; areaM.hidden = true; f.requestSubmit();
          });
          areaM.scrollIntoView({ block: "nearest" });
        } else { var m = mensagemDeErro(e); aviso("erro", m.texto, m.link); }
      });
      return;
    }
    if (f.classList.contains("form-conta")) {
      var redeC = f.getAttribute("data-rede"); var modo = f.elements["modo"].value; var dadosC;
      if (modo === "seco") dadosC = { modo: "seco" };
      else {
        if (!f.elements["expiraEm"].value) { aviso("erro", T("js.expiraObrig")); return; }
        dadosC = {
          modo: "real", accessToken: f.elements["accessToken"].value, contaId: f.elements["contaId"].value.trim(),
          escopos: f.elements["escopos"].value.split(",").map(function (x) { return x.trim(); }).filter(Boolean),
          expiraEm: new Date(f.elements["expiraEm"].value + ":00-03:00").toISOString()
        };
        var nomeC = f.elements["contaNome"].value.trim(); if (nomeC) dadosC.contaNome = nomeC;
        if (f.elements["refreshToken"].value) dadosC.refreshToken = f.elements["refreshToken"].value;
        if (f.elements["refreshExpiraEm"].value) dadosC.refreshExpiraEm = new Date(f.elements["refreshExpiraEm"].value + ":00-03:00").toISOString();
      }
      executar(botao, T("js.conectando"), function () { return chamar("POST", "/api/contas/" + redeC + "/conectar", dadosC); },
        function () { f.reset(); aviso("ok", T(modo === "seco" ? "js.conectadoSeco" : "js.contaConectada")); });
      return;
    }
    if (f.id === "form-publicacao") {
      var esp = f.elements["espacamento"].value.trim(); var urlP = f.elements["urlPublica"].value.trim();
      if (!/^\d+$/.test(esp)) { aviso("erro", T("js.espacamentoInvalido")); return; }
      executar(botao, T("js.salvando"), function () {
        return chamar("POST", "/api/ajustes", { chave: "publicacao.espacamento_minutos", valor: esp }).then(function () {
          return chamar("POST", "/api/ajustes", { chave: "publicacao.url_publica", valor: urlP });
        });
      }, function () { aviso("ok", T("js.ajustesPubSalvos")); });
      return;
    }
    if (f.id === "form-agendamento") {
      var num = function (n) { var v = f.elements[n].value.trim(); return v === "" ? null : Number(v); };
      var filtro = {};
      var marca = f.elements["marca"].value.trim(); if (marca) filtro.marca = marca;
      ["anoMin", "anoMax", "precoMax", "kmMax"].forEach(function (n) { var v = num(n); if (v !== null) filtro[n] = v; });
      var dados = { intervaloMinutos: Number(f.elements["intervaloMinutos"].value), filtro: filtro, quantidade: Number(f.elements["quantidade"].value) };
      executar(botao, T("js.salvando"), function () { return chamar("POST", "/api/agendamento", dados); },
        function () { aviso("ok", T("js.agendamentoSalvo")); });
    }
  });

  window.addEventListener("DOMContentLoaded", function () {
    assinatura = semVivos(principal()); marcarAssinaturas(principal());
    marcarAba(); atualizarContagem(); prepararTela(); agendarVolta();
  });
})();
`;

/** O script completo do painel, no idioma pedido. */
export function clienteJs(idioma: Idioma): string {
  return errosJs(idioma) + CORPO_JS;
}

export const CLIENTE_JS = clienteJs("pt-BR");
