// HTML das telas do painel (barra lateral + Fila, Calendário, Publicações, Estoque, Histórico,
// Contas, Prontidão, Agendamento, Ajustes). As telas novas de publicação ficam em paginas-publicacao.ts.
// O servidor entrega a tela já pronta; o JS do navegador (cliente.ts) cuida das ações
// e atualiza a tela sozinho. Visual: tokens do tema (ver estilo.ts e tema/PADRAO.md).
// Nenhum texto visível mora aqui: tudo sai do catálogo de idiomas (idioma/*.ts) por t().
import {
  FUNDOS_ESCOLHA,
  MOTIVOS_REJEICAO,
  RITMOS_ESCOLHA,
  LIMITE_CORPO_TEXTO,
  LIMITE_TITULO_TEXTO,
  INTERVALO_MINIMO_MIN,
  type Agendamento,
  type ItemEstoque,
  type ProgressoFila,
  NOMES_REDE,
  type Rede,
} from "@gerador/core";
import { secaoIA, type DadosIA } from "./ia.js";
import type { Site } from "@gerador/leitor";
import { chave, grupo, linha, peDoGrupo } from "./linhas.js";
import { formatarKm, formatarPreco } from "./dinheiro.js";
import { formatarBrasilia, formatarDuracao } from "./tempo.js";
import { escaparHtml } from "./html.js";
import { blocoRedes, partesRedes, type DadosRedes } from "./paginas-redes.js";
import { IDIOMAS, NOME_NATIVO, idiomaAtual, localeDe, rotuloDe, t, tp, type Chave } from "./idioma/index.js";

export type Aba =
  | "fila" | "calendario" | "publicacoes" | "estoque" | "historico" | "contas" | "prontidao" | "agendamento" | "sites" | "configuracoes";

/** Números que a barra lateral mostra. Vêm do banco a cada tela e a cada atualização. */
export interface Contadores {
  /** Vídeos esperando a aprovação do João. */
  aguardando: number;
  /** Vídeos na fila de render ou renderizando. */
  renderizando: number;
  /** Publicações marcadas no calendário, ainda não saíram. */
  agendados: number;
  /** Publicações que falharam + vídeos que deram erro ao renderizar. */
  falharam: number;
}
export const SEM_CONTADORES: Contadores = { aguardando: 0, renderizando: 0, agendados: 0, falharam: 0 };

type ChaveContador = keyof Contadores;
interface ItemNav {
  chave: Aba;
  href: string;
  icone: string;
  contadores?: { k: ChaveContador; tom: "" | "erro" | "forte" }[];
}

const ICONES: Record<string, string> = {
  fila: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  publicacoes: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  estoque: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  historico: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  contas: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  prontidao: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  agendamento: '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>',
  sites: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  ajustes: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  recolher: '<path d="M15 6l-6 6 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  lua: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
};

export function icone(nome: string, classe = "icone"): string {
  return `<svg class="${classe}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome] ?? ""}</svg>`;
}

const GRUPOS_NAV: { titulo: Chave; itens: ItemNav[] }[] = [
  {
    titulo: "nav.grupo.trabalho",
    itens: [
      {
        chave: "fila", href: "/fila", icone: "fila",
        contadores: [
          { k: "aguardando", tom: "forte" },
          { k: "renderizando", tom: "" },
        ],
      },
      { chave: "calendario", href: "/calendario", icone: "calendario", contadores: [{ k: "agendados", tom: "" }] },
      { chave: "publicacoes", href: "/publicacoes", icone: "publicacoes", contadores: [{ k: "falharam", tom: "erro" }] },
    ],
  },
  {
    titulo: "nav.grupo.catalogo",
    itens: [
      { chave: "estoque", href: "/estoque", icone: "estoque" },
      { chave: "historico", href: "/historico", icone: "historico" },
    ],
  },
  {
    titulo: "nav.grupo.redes",
    itens: [
      { chave: "contas", href: "/contas", icone: "contas" },
      { chave: "prontidao", href: "/prontidao", icone: "prontidao" },
    ],
  },
  {
    titulo: "nav.grupo.sistema",
    itens: [
      { chave: "agendamento", href: "/agendamento", icone: "agendamento" },
      { chave: "sites", href: "/sites", icone: "sites" },
    ],
  },
];
/** As Configurações ficam ancoradas no rodapé da barra, num bloco próprio (como no Harness). */
const ITEM_RODAPE: ItemNav = { chave: "configuracoes", href: "/configuracoes", icone: "ajustes" };
export const ABAS: { chave: Aba; href: string }[] = [...GRUPOS_NAV.flatMap((g) => g.itens), ITEM_RODAPE];

/** Nome da tela no idioma atual ("Fila", "Queue"...). */
export function nomeDaAba(aba: Aba): string {
  return t(`aba.${aba}` as Chave);
}

const TONS_ESTADO: Record<string, "ok" | "espera" | "erro" | ""> = {
  rascunho: "espera",
  renderizando: "espera",
  aguardando_aprovacao: "espera",
  aprovado: "ok",
  publicado: "ok",
  rejeitado: "erro",
  erro: "erro",
};

export { escaparHtml };

/** Texto do catálogo já escapado para HTML (texto e atributo). Quando o texto leva marcação própria, use t() direto. */
export function e(chave: Chave, params?: Record<string, string | number>): string {
  return escaparHtml(t(chave, params));
}

function selo(estado: string): string {
  const tom = TONS_ESTADO[estado] ?? "";
  return `<span class="selo ${tom}">${escaparHtml(rotuloDe("estado", estado))}</span>`;
}

interface OpcoesCasca {
  aba: Aba;
  titulo: string;
  conteudo: string;
  contadores: Contadores;
  /** Atualização automática, em ms. 0 = só quando a pessoa agir. */
  atualizarACada: number;
}

function itemNav(a: ItemNav, atual: Aba, c: Contadores): string {
  const badges = (a.contadores ?? [])
    .map((x) => {
      const n = c[x.k];
      const classe = ["contagem", x.tom].filter(Boolean).join(" ");
      const rotulo = escaparHtml(t(`nav.contador.${x.k}` as Chave));
      return `<span class="${classe}" data-contador="${x.k}" data-rotulo="${rotulo}" title="${n} ${rotulo}" aria-label="${n} ${rotulo}"${n === 0 ? " hidden" : ""}>${n}</span>`;
    })
    .join("");
  const ativo = a.chave === atual ? ` aria-current="page"` : "";
  const nome = escaparHtml(nomeDaAba(a.chave));
  return `<a href="${a.href}" data-nav data-aba="${a.chave}"${ativo} title="${nome}">${icone(a.icone)}<span class="nav-rotulo">${nome}</span><span class="nav-contagens">${badges}</span></a>`;
}

/** Roda antes da pintura: aplica o tema escolhido (claro, escuro ou o do sistema) e a barra recolhida, sem piscar. */
const SCRIPT_ANTES_DA_PINTURA =
  'try{var p=localStorage.getItem("painel-tema");if(p==="escuro"||p==="dark"||((p==="sistema"||p==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches))document.body.setAttribute("data-ds-dark-theme","");if(localStorage.getItem("painel-lateral")==="recolhida")document.body.setAttribute("data-lateral","recolhida")}catch(e){}';

export function casca(o: OpcoesCasca): string {
  const grupos = GRUPOS_NAV.map(
    (g) => `<div class="nav-grupo"><span class="nav-titulo">${e(g.titulo)}</span>${g.itens.map((a) => itemNav(a, o.aba, o.contadores)).join("")}</div>`,
  ).join("");
  const nomeApp = e("app.nome");
  return `<!doctype html>
<html lang="${idiomaAtual()}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escaparHtml(o.titulo)} — ${nomeApp}</title>
<link rel="stylesheet" href="/tema/dsh-base.css" />
<link rel="stylesheet" href="/tema/design-platform.css" />
<link rel="stylesheet" href="/tema/elevacao.css" />
<link rel="stylesheet" href="/tema/focus.css" />
<link rel="stylesheet" href="/tema/scrollbar.css" />
<link rel="stylesheet" href="/tema/corner-shape.css" />
<link rel="stylesheet" href="/painel.css" />
</head>
<body>
<script>${SCRIPT_ANTES_DA_PINTURA}</script>
<a class="pular" href="#conteudo">${e("app.pular")}</a>
<div class="app">
  <aside class="lateral" id="lateral" aria-label="${e("app.navegacao")}">
    <div class="lateral-topo">
      <span class="marca">${nomeApp}</span>
      <button type="button" class="btn ghost icone-btn" data-acao="recolher" id="recolher" aria-expanded="true" aria-controls="lateral" aria-label="${e("app.recolher")}" title="${e("app.recolher")}">${icone("recolher")}</button>
    </div>
    <nav class="nav" aria-label="${e("app.telas")}">${grupos}</nav>
    <div class="lateral-pe">${itemNav(ITEM_RODAPE, o.aba, o.contadores)}</div>
  </aside>
  <div class="lateral-veu" data-acao="fechar-gaveta" hidden></div>
  <div class="coluna">
    <header class="barra-topo">
      <button type="button" class="btn ghost icone-btn so-estreita" data-acao="gaveta" id="abrir-gaveta" aria-expanded="false" aria-controls="lateral" aria-label="${e("app.abrirMenu")}">${icone("menu")}</button>
      <span class="marca so-estreita">${nomeApp}</span>
      <button type="button" class="btn ghost icone-btn" id="alternar-tema" data-acao="tema" aria-label="${e("tema.paraEscuro")}" title="${e("tema.paraEscuro")}" data-rotulo-escuro="${e("tema.paraEscuro")}" data-rotulo-claro="${e("tema.paraClaro")}">${icone("lua", "icone icone-lua")}${icone("sol", "icone icone-sol")}</button>
    </header>
    <main id="conteudo" tabindex="-1" data-aba="${o.aba}" data-titulo="${escaparHtml(o.titulo)}" data-contadores="${escaparHtml(JSON.stringify(o.contadores))}" data-poll="${o.atualizarACada}">
${o.conteudo}
</main>
  </div>
</div>
<div class="avisos" id="avisos" aria-live="polite"></div>
<script src="/painel.js" defer></script>
</body>
</html>`;
}

// ------------------------------------------------------------------ dados

export interface VideoParaCartao {
  id: number;
  estado: string;
  titulo: string | null;
  corpo: string | null;
  fundo: string | null;
  ritmo: string | null;
  caminhoMp4: string | null;
  criadoEm: string;
  atualizadoEm?: string;
  quantidadeFotos?: number;
  ordemFotos?: number[];
  /** Validação, legenda e prévia por rede (só vídeos com MP4 pronto). */
  redes?: DadosRedes | null;
  /** Motivos (chaves) de vídeos anteriores do mesmo carro que foram rejeitados. */
  rejeicoesAnteriores?: string[];
  produto: {
    marca?: string;
    modelo?: string;
    ano?: number;
    km?: number;
    preco?: number;
    moeda?: string;
    revenda?: string;
  } | null;
}

function fichaChips(p: VideoParaCartao["produto"], fotos?: number): string {
  if (!p) return "";
  const chips: string[] = [];
  const nome = [p.marca, p.modelo].filter(Boolean).join(" ");
  if (nome) chips.push(`<span><strong>${escaparHtml(nome)}</strong></span>`);
  if (p.ano) chips.push(`<span>${p.ano}</span>`);
  if (p.km !== undefined) chips.push(`<span>${escaparHtml(formatarKm(p.km))}</span>`);
  if (p.preco !== undefined) chips.push(`<span class="preco">${escaparHtml(formatarPreco(p.preco, p.moeda))}</span>`);
  if (p.revenda) chips.push(`<span>${escaparHtml(p.revenda)}</span>`);
  if (fotos !== undefined) chips.push(`<span>${escaparHtml(tp("cartao.fotos", fotos))}</span>`);
  return `<div class="ficha" aria-label="${e("cartao.fichaLida")}">${chips.join("")}</div>`;
}

/** Player quando o MP4 existe; senão, um espaço que explica por quê. */
function player(v: VideoParaCartao): string {
  if (v.caminhoMp4) return `<video src="/video/${v.id}.mp4" controls preload="metadata" aria-label="${e("cartao.videoDe", { id: v.id })}"></video>`;
  const motivo: Record<string, Chave> = {
    rascunho: "cartao.semVideo.rascunho",
    renderizando: "cartao.semVideo.renderizando",
    erro: "cartao.semVideo.erro",
  };
  return `<div class="semvideo">${e(motivo[v.estado] ?? "cartao.semVideo.padrao")}</div>`;
}

function escolhasDoVideo(v: VideoParaCartao): string {
  const fundo = v.fundo ? rotuloDe("fundo", v.fundo) : "-";
  const ritmo = v.ritmo ? rotuloDe("ritmo", v.ritmo) : "-";
  return escaparHtml(t("cartao.escolhas", { fundo, ritmo }));
}

function anuncio(v: VideoParaCartao): string {
  return `<div class="anuncio">
    <div class="titulo">${escaparHtml(v.titulo ?? t("cartao.semTitulo"))}</div>
    <div class="corpo">${escaparHtml(v.corpo ?? "")}</div>
  </div>
  <div class="escolhas">${escolhasDoVideo(v)}</div>`;
}

// ------------------------------------------------------------------- Fila

function opcoes(grupo: string, valores: readonly string[], prefixo: string, atual: string | null): string {
  const marcado = atual && valores.includes(atual) ? atual : valores[0];
  return `<div class="opcoes" data-grupo="${grupo}" role="group">${valores
    .map(
      (val) =>
        `<button type="button" class="btn outline" data-escolha="${escaparHtml(val)}" aria-pressed="${val === marcado}">${escaparHtml(rotuloDe(prefixo, val))}</button>`,
    )
    .join("")}</div>`;
}

function painelRefazer(v: VideoParaCartao): string {
  const n = v.quantidadeFotos ?? 0;
  let ordemAtual = v.ordemFotos && v.ordemFotos.length === n ? v.ordemFotos : Array.from({ length: n }, (_, i) => i);
  if (new Set(ordemAtual).size !== n) ordemAtual = Array.from({ length: n }, (_, i) => i);
  const fotos =
    n > 1
      ? `<div class="grupo">
        <span class="rotulo">${e("refazer.ordemFotos")}</span>
        <span class="leg">${e("refazer.ordemAjuda")}</span>
        <div class="ordem">${ordemAtual
          .map(
            (f) => `<div class="ordem-item" data-foto="${f}"><span class="n">${e("refazer.foto", { n: f + 1 })}</span>
              <button type="button" class="btn ghost pequeno" data-acao="subir" aria-label="${e("refazer.subirFoto", { n: f + 1 })}">${e("refazer.subir")}</button>
              <button type="button" class="btn ghost pequeno" data-acao="descer" aria-label="${e("refazer.descerFoto", { n: f + 1 })}">${e("refazer.descer")}</button></div>`,
          )
          .join("")}</div>
        <div><button type="button" class="btn ghost pequeno" data-acao="ordem-original">${e("refazer.ordemOriginal")}</button></div>
      </div>`
      : "";
  return `<div class="painel" data-painel="refazer" hidden>
    <div class="grupo"><span class="rotulo">${e("refazer.fundo")}</span>${opcoes("fundo", FUNDOS_ESCOLHA, "fundo", v.fundo)}</div>
    <div class="grupo"><span class="rotulo">${e("refazer.ritmo")}</span>${opcoes("ritmo", RITMOS_ESCOLHA, "ritmo", v.ritmo)}</div>
    ${fotos}
    <p class="leg">${e("refazer.aviso")}</p>
    <div class="acoes">
      <button type="button" class="btn primary" data-acao="refazer">${e("refazer.confirmar")}</button>
      <button type="button" class="btn ghost" data-acao="fechar">${e("acao.cancelar")}</button>
    </div>
  </div>`;
}

function painelRejeitar(): string {
  return `<div class="painel" data-painel="rejeitar" hidden>
    <span class="rotulo">${e("rejeitar.pergunta")}</span>
    <div class="opcoes">${MOTIVOS_REJEICAO.map(
      (m) => `<button type="button" class="btn outline perigo" data-acao="rejeitar" data-motivo="${m}">${escaparHtml(rotuloDe("motivo", m))}</button>`,
    ).join("")}</div>
    <div class="acoes"><button type="button" class="btn ghost" data-acao="fechar">${e("acao.cancelar")}</button></div>
  </div>`;
}

function painelEditar(v: VideoParaCartao): string {
  return `<div class="painel" data-painel="editar" hidden>
    <div class="grupo"><label for="titulo-${v.id}">${e("editar.titulo")}</label>
      <div><input class="campo" id="titulo-${v.id}" name="titulo" maxlength="${LIMITE_TITULO_TEXTO}" value="${escaparHtml(v.titulo ?? "")}" /><div class="contador"></div></div></div>
    <div class="grupo"><label for="corpo-${v.id}">${e("editar.corpo")}</label>
      <div><textarea class="campo" id="corpo-${v.id}" name="corpo" maxlength="${LIMITE_CORPO_TEXTO}">${escaparHtml(v.corpo ?? "")}</textarea><div class="contador"></div></div></div>
    <p class="leg">${e("editar.aviso")}</p>
    <div class="acoes">
      <button type="button" class="btn primary" data-acao="salvar-texto">${e("editar.salvar")}</button>
      <button type="button" class="btn ghost" data-acao="fechar">${e("acao.cancelar")}</button>
    </div>
  </div>`;
}

/** Decisões (Aprovar, Rejeitar) separadas das ferramentas (Refazer, Reescrever, Editar, Legenda). */
function acoesDaFila(v: VideoParaCartao, botaoLegenda: string): string {
  const podeAprovar = v.estado === "aguardando_aprovacao";
  const podeRefazer = v.estado === "aguardando_aprovacao" || v.estado === "erro";
  const podeTexto = v.estado === "aguardando_aprovacao" || v.estado === "erro" || v.estado === "rascunho";
  if (!podeAprovar && !podeRefazer && !podeTexto) {
    return `<p class="leg">${e("fila.esperandoVideo")}</p>`;
  }
  const decisao: string[] = [];
  if (podeAprovar) {
    decisao.push(`<button type="button" class="btn primary" data-acao="aprovar">${e("acao.aprovar")}</button>`);
    decisao.push(`<button type="button" class="btn outline perigo" data-abre="rejeitar" aria-pressed="false" aria-expanded="false">${e("acao.rejeitar")}</button>`);
  }
  const ferramentas: string[] = [];
  if (podeRefazer) ferramentas.push(`<button type="button" class="btn outline" data-abre="refazer" aria-pressed="false" aria-expanded="false">${e("acao.refazer")}</button>`);
  if (podeTexto) {
    ferramentas.push(`<button type="button" class="btn outline" data-acao="reescrever">${e("acao.reescrever")}</button>`);
    ferramentas.push(`<button type="button" class="btn outline" data-abre="editar" aria-pressed="false" aria-expanded="false">${e("acao.editar")}</button>`);
  }
  if (botaoLegenda) ferramentas.push(botaoLegenda);
  return `<div class="fila-acoes">
      ${decisao.length ? `<div class="acoes-grupo acoes-decisao" role="group" aria-label="${e("fila.grupoDecisao")}"><span class="acoes-rotulo">${e("fila.grupoDecisao")}</span><div class="acoes">${decisao.join("")}</div></div>` : ""}
      ${ferramentas.length ? `<div class="acoes-grupo acoes-ferramentas" role="group" aria-label="${e("fila.grupoFerramentas")}"><span class="acoes-rotulo">${e("fila.grupoFerramentas")}</span><div class="acoes">${ferramentas.join("")}</div></div>` : ""}
    </div>`;
}

/** Nome, preço em destaque e os dados miúdos do carro: o que ele é, antes de qualquer outra coisa. */
function identidadeDoCarro(v: VideoParaCartao): string {
  const p = v.produto;
  const nome = p ? [p.marca, p.modelo].filter(Boolean).join(" ") : "";
  const miudos: string[] = [];
  if (p?.ano) miudos.push(`<span>${p.ano}</span>`);
  if (p?.km !== undefined) miudos.push(`<span>${escaparHtml(formatarKm(p.km))}</span>`);
  if (p?.revenda) miudos.push(`<span>${escaparHtml(p.revenda)}</span>`);
  if (v.quantidadeFotos !== undefined) miudos.push(`<span>${escaparHtml(tp("cartao.fotos", v.quantidadeFotos))}</span>`);
  return `<header class="fila-id">
      <div class="fila-id-topo">${selo(v.estado)}<span class="leg">#${v.id}</span></div>
      <h3 class="fila-nome">${escaparHtml(nome || t("cartao.semNome"))}</h3>
      ${p?.preco !== undefined ? `<div class="fila-preco">${escaparHtml(formatarPreco(p.preco, p.moeda))}</div>` : ""}
      ${miudos.length ? `<div class="ficha" aria-label="${e("cartao.fichaLida")}">${miudos.join("")}</div>` : ""}
    </header>`;
}

function cartaoFila(v: VideoParaCartao): string {
  const redes = v.redes ? partesRedes(v.id, v.caminhoMp4, v.redes) : null;
  const abertoParaDecidir = v.estado === "aguardando_aprovacao";
  return `<article class="cartao fila-cartao${abertoParaDecidir ? " pede-decisao" : ""}" data-card data-id="${v.id}" id="video-${v.id}">
    <div class="fila-midia"><div class="video-player">${player(v)}</div></div>
    <div class="fila-corpo">
      ${identidadeDoCarro(v)}
      <section class="fila-secao" aria-label="${e("fila.secaoTexto")}">${anuncio(v)}</section>
      ${redes ? `<section class="fila-secao" aria-label="${e("fila.secaoRedes")}">${redes.resumo}</section>` : ""}
      <section class="fila-secao fila-secao-acoes" aria-label="${e("fila.secaoAcoes")}">
        ${acoesDaFila(v, redes?.botaoLegenda ?? "")}
        ${v.estado === "aguardando_aprovacao" ? painelRejeitar() : ""}
        ${v.estado === "aguardando_aprovacao" || v.estado === "erro" ? painelRefazer(v) : ""}
        ${v.estado === "aguardando_aprovacao" || v.estado === "erro" || v.estado === "rascunho" ? painelEditar(v) : ""}
        ${redes?.painel ?? ""}
      </section>
    </div>
  </article>`;
}

export function blocoProgresso(p: ProgressoFila): string {
  const exec = p.emExecucao;
  const faltam = p.pendentes + (exec ? 1 : 0);
  const pct = exec ? Math.min(95, Math.round((exec.haSegundos / Math.max(1, p.segundosPorVideo)) * 100)) : 0;
  const origem =
    p.origemEstimativa === "historico"
      ? t("progresso.origemHistorico", { n: p.amostras })
      : t("progresso.origemPadrao");
  const agora = exec
    ? t("progresso.renderizando", { id: `<strong>#${exec.videoId}</strong>`, tempo: escaparHtml(formatarDuracao(exec.haSegundos)) })
    : faltam > 0
      ? e("progresso.nenhumAgora")
      : e("progresso.vazia");
  return `<div class="progresso-linha">
      <div class="item"><span class="num">${faltam}</span><span class="leg">${e("progresso.naFila")}</span></div>
      <div class="item"><span class="num">${p.pendentes}</span><span class="leg">${e("progresso.esperando")}</span></div>
      <div class="item"><span class="num">${faltam > 0 ? escaparHtml(formatarDuracao(p.estimativaRestanteSegundos)) : "—"}</span><span class="leg">${e("progresso.paraTerminar")}</span></div>
    </div>
    <p>${agora}</p>
    ${exec ? `<div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${e("progresso.andamento")}"><span style="width:${pct}%"></span></div>` : ""}
    ${faltam > 0 ? `<p class="leg">${e("progresso.tempoEstimado", { origem })}</p>` : ""}`;
}

export function paginaFila(videos: VideoParaCartao[], progresso: ProgressoFila, contadores: Contadores = SEM_CONTADORES): string {
  const ativos = videos.filter((v) => ["rascunho", "renderizando", "aguardando_aprovacao", "erro"].includes(v.estado));
  const aguardando = ativos.filter((v) => v.estado === "aguardando_aprovacao").length;
  const lista =
    ativos.length === 0
      ? `<div class="cartao vazio">
          <span class="grande">${e("fila.vazio.titulo")}</span>
          <p class="leg">${e("fila.vazio.texto")}</p>
          <div class="acoes"><a class="btn primary" href="/agendamento">${e("fila.vazio.buscar")}</a><a class="btn outline" href="/estoque">${e("fila.vazio.estoque")}</a></div>
        </div>`
      : ativos.map(cartaoFila).join("");
  const conteudo = `
  <div class="cartao-cab" style="margin:0">
    <div><h2>${e("aba.fila")}</h2><p class="leg">${aguardando > 0 ? escaparHtml(tp("fila.aguardando", aguardando)) : e("fila.instrucao")}</p></div>
  </div>
  <section class="cartao progresso" aria-label="${e("progresso.titulo")}" data-viva="sempre" data-viva-id="progresso">${blocoProgresso(progresso)}</section>
  <div id="lista-fila" class="lista-fila">${lista}</div>`;
  return casca({ aba: "fila", titulo: nomeDaAba("fila"), conteudo, contadores: { ...contadores, aguardando }, atualizarACada: 4000 });
}

// ---------------------------------------------------------------- Estoque

function fichaDe(item: ItemEstoque): VideoParaCartao["produto"] {
  return item.ficha as VideoParaCartao["produto"];
}

export function paginaEstoque(itens: ItemEstoque[], contadores: Contadores = SEM_CONTADORES): string {
  const emAndamento = itens.some((i) => i.video?.estado === "rascunho" || i.video?.estado === "renderizando");
  let conteudo: string;
  if (itens.length === 0) {
    conteudo = `<h2>${e("aba.estoque")}</h2><div class="cartao vazio">
      <span class="grande">${e("estoque.vazio.titulo")}</span>
      <p class="leg">${e("estoque.vazio.texto")}</p>
      <div class="acoes"><a class="btn primary" href="/agendamento">${e("estoque.vazio.ir")}</a></div></div>`;
  } else {
    const linhas = itens
      .map((i) => {
        const p = fichaDe(i);
        const nome = [p?.marca, p?.modelo, p?.ano].filter(Boolean).join(" ") || t("estoque.semNome");
        const estadoVideo = i.video ? selo(i.video.estado) : `<span class="selo">${e("estoque.semVideo")}</span>`;
        const botoes = [
          `<button type="button" class="btn outline pequeno" data-acao="reler">${e("estoque.reler")}</button>`,
          i.temVideo
            ? ""
            : `<button type="button" class="btn primary pequeno" data-acao="gerar-video">${e("estoque.gerar")}</button>`,
        ].join("");
        return `<tr data-card data-produto="${i.produtoId}">
          <td><div><strong>${escaparHtml(nome)}</strong></div><div class="leg"><a href="${escaparHtml(i.origemUrl)}" target="_blank" rel="noopener noreferrer">${e("estoque.verNoSite")}</a></div></td>
          <td>${p?.preco !== undefined ? escaparHtml(formatarPreco(p.preco, p.moeda)) : "—"}</td>
          <td>${p?.km !== undefined ? escaparHtml(formatarKm(p.km)) : "—"}</td>
          <td>${i.quantidadeFotos}</td>
          <td>${escaparHtml(formatarBrasilia(i.lidoEm))}</td>
          <td>${estadoVideo}${i.totalVideos > 1 ? `<div class="leg">${escaparHtml(tp("estoque.videosFeitos", i.totalVideos))}</div>` : ""}</td>
          <td><div class="acoes">${botoes}</div></td>
        </tr>`;
      })
      .join("");
    conteudo = `<div><h2>${e("aba.estoque")}</h2><p class="leg">${escaparHtml(tp("estoque.resumo", itens.length))}</p></div>
    <div class="cartao rolagem"><table class="tabela">
      <thead><tr><th>${e("estoque.col.carro")}</th><th>${e("estoque.col.preco")}</th><th>${e("estoque.col.km")}</th><th>${e("estoque.col.fotos")}</th><th>${e("estoque.col.lido")}</th><th>${e("estoque.col.video")}</th><th><span class="sr-only">${e("estoque.col.acoes")}</span></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>`;
  }
  return casca({ aba: "estoque", titulo: nomeDaAba("estoque"), conteudo, contadores, atualizarACada: emAndamento ? 5000 : 0 });
}

// -------------------------------------------------------------- Histórico

/** Uma coisa que já SAIU: um vídeo publicado numa rede, ou um vídeo rejeitado com o motivo. */
export interface EntradaHistorico {
  tipo: "publicado" | "rejeitado";
  /** ISO UTC de quando aconteceu. */
  quando: string;
  videoId: number;
  nome: string;
  preco?: number | undefined;
  moeda?: string | undefined;
  /** Versão do MP4 (para a miniatura); ausente = sem arquivo. */
  versao?: string | undefined;
  rede?: Rede | undefined;
  simulado?: boolean | undefined;
  idExterno?: string | null | undefined;
  motivo?: string | undefined;
}

function linhaHistorico(h: EntradaHistorico): string {
  const mini = h.versao ? `<img class="hist-mini" src="/api/videos/${h.videoId}/miniatura.jpg?v=${encodeURIComponent(h.versao)}" alt="" width="40" height="71" loading="lazy" decoding="async" onerror="this.hidden=true" />` : `<span class="hist-mini vazio" aria-hidden="true"></span>`;
  const preco = h.preco !== undefined ? ` · ${escaparHtml(formatarPreco(h.preco, h.moeda))}` : "";
  let detalhe: string;
  if (h.tipo === "publicado") {
    const id = h.idExterno
      ? /^https?:\/\//.test(h.idExterno)
        ? `<a href="${escaparHtml(h.idExterno)}" target="_blank" rel="noopener noreferrer">${e("hist.verPost")}</a>`
        : `<span class="fraco">${e("hist.postId", { id: h.idExterno })}</span>`
      : "";
    detalhe = `<span class="linha-valor">${escaparHtml(t("cal.cartaoQuando", { rede: NOMES_REDE[h.rede!], quando: formatarBrasilia(h.quando) }))}</span> ${h.simulado ? `<span class="selo">${e("pub.modoSeco")}</span>` : ""} ${id}`;
  } else {
    detalhe = `<span class="linha-valor">${escaparHtml(t("hist.rejeitadoEm", { quando: formatarBrasilia(h.quando), motivo: rotuloDe("motivo", h.motivo ?? "") }))}</span>`;
  }
  return `<article class="linha hist-linha" data-card data-id="${h.videoId}">${mini}<div class="hist-corpo"><div class="linha-rotulo">${escaparHtml(h.nome)}${preco}</div><div class="hist-detalhe">${detalhe}</div></div></article>`;
}

export function paginaHistorico(entradas: EntradaHistorico[], contadores: Contadores = SEM_CONTADORES): string {
  const ordenadas = [...entradas].sort((a, b) => b.quando.localeCompare(a.quando));
  const publicados = ordenadas.filter((h) => h.tipo === "publicado");
  const rejeitados = ordenadas.filter((h) => h.tipo === "rejeitado");
  const vazio = (chaveTexto: Chave): string => `<div class="linha"><p class="linha-ajuda">${e(chaveTexto)}</p></div>`;
  const conteudo =
    entradas.length === 0
      ? `<div><h2>${e("aba.historico")}</h2><p class="leg">${e("hist.proposito")}</p></div>
         <div class="cartao vazio"><span class="grande">${e("hist.vazio.titulo")}</span>
          <p class="leg">${e("hist.vazio.texto")}</p>
          <div class="acoes"><a class="btn primary" href="/fila">${e("hist.vazio.ir")}</a></div></div>`
      : `<div><h2>${e("aba.historico")}</h2><p class="leg">${e("hist.proposito")}</p></div>
        <div class="config-pagina">
        ${grupo(`${e("hist.publicados")} <span class="fraco">${publicados.length}</span>`, publicados.length ? publicados.map(linhaHistorico) : [vazio("hist.semPublicados")], { id: "historico-publicados" })}
        ${grupo(`${e("hist.rejeitados")} <span class="fraco">${rejeitados.length}</span>`, rejeitados.length ? rejeitados.map(linhaHistorico) : [vazio("hist.semRejeitados")], { id: "historico-rejeitados" })}
        </div>`;
  return casca({ aba: "historico", titulo: nomeDaAba("historico"), conteudo, contadores, atualizarACada: 0 });
}

// ------------------------------------------------------------ Agendamento

const INTERVALOS_MIN = [15, 30, 60, 120, 360, 720, 1440];

function textoIntervalo(min: number): string {
  if (min === 1440) return t("agenda.intervalo.diario");
  if (min < 60 || min % 60 !== 0) return tp("agenda.intervalo.minutos", min);
  return tp("agenda.intervalo.horas", min / 60);
}

export function paginaAgendamento(ag: Agendamento, agora: Date, contadores: Contadores = SEM_CONTADORES, sites: Site[] = []): string {
  const vencida = ag.ligado && ag.proximaRodada !== null && new Date(ag.proximaRodada) <= agora;
  const proxima = !ag.ligado
    ? t("agenda.proxima.desligado")
    : vencida
      ? t("agenda.proxima.agora")
      : formatarBrasilia(ag.proximaRodada);
  const lista = [...INTERVALOS_MIN];
  if (!lista.includes(ag.intervaloMinutos)) {
    lista.push(ag.intervaloMinutos);
    lista.sort((a, b) => a - b);
  }
  const seletor = lista
    .map((min) => `<option value="${min}"${min === ag.intervaloMinutos ? " selected" : ""}>${escaparHtml(textoIntervalo(min))}</option>`)
    .join("");
  const f = ag.filtro;
  const v = (n: number | undefined): string => (n === undefined ? "" : String(n));
  const r = ag.ultimoResultado;
  let resultado = `<p class="linha-ajuda">${e("agenda.semRodada")}</p>`;
  if (r) {
    const novos = r.itens.filter((i) => i.enfileirado).length;
    resultado = r.erro
      ? `<div class="aviso erro">${e("agenda.rodadaFalhou", { erro: r.erro })}</div>`
      : `<p class="linha-valor">${escaparHtml(t("agenda.ultimaRodada", { vistos: tp("agenda.carrosVistos", r.itens.length), novos: tp("agenda.videosNovos", novos) }))}</p>`;
    const pulados = (r.sites ?? []).filter((s) => s.estado === "pulado-agendada");
    if (pulados.length > 0) resultado += `<div class="aviso info">${e("agenda.pulados", { sites: pulados.map((s) => s.url).join(", ") })}</div>`;
  }
  const ativos = sites.filter((s) => s.ativo);
  const soPessoa = ativos.filter((s) => s.modo === "navegador-da-pessoa");
  const siteslido =
    ativos.length === 0
      ? `<p class="linha-valor">${e("agenda.nenhumSite")} <a href="/sites" data-nav>${e("agenda.gerenciarSites")}</a></p>`
      : `<ul class="lista-simples">${ativos.map((s) => `<li>${escaparHtml(s.nome)} <span class="fraco">${escaparHtml(s.url)}</span></li>`).join("")}</ul>
         <p class="linha-ajuda"><a href="/sites" data-nav>${e("agenda.gerenciarSites")}</a></p>`;
  const avisoPessoa = soPessoa.length > 0 ? `<div class="aviso info">${e("agenda.avisoNavegadorPessoa", { sites: soPessoa.map((s) => s.nome).join(", ") })}</div>` : "";
  const campo = (id: string, nome: string, tipo: string, valor: string, extra = ""): string =>
    `<input class="campo" id="${id}" name="${nome}" type="${tipo}" value="${escaparHtml(valor)}" data-inicial="${escaparHtml(valor)}"${extra} />`;
  const conteudo = `
  <div class="config-pagina">
  <div><h2>${e("aba.agendamento")}</h2><p class="leg">${e("agenda.subtitulo")}</p></div>

  ${grupo(e("agenda.buscaAuto"), [
    linha({
      rotulo: t("agenda.buscaAuto"),
      ajuda: t(ag.ligado ? "agenda.ligadaTexto" : "agenda.desligadaTexto"),
      cab: chave({ ligado: ag.ligado, rotulo: t("agenda.buscaAuto"), attrs: 'data-acao="agendamento-alternar"' }),
      campo: "",
    }),
    linha({
      rotulo: t("agenda.rodarAgora"),
      ajuda: t("agenda.rodarAjuda"),
      campo: `<div class="acoes"><button type="button" class="btn outline" data-acao="rodar-agora">${e("agenda.rodarAgora")}</button></div>`,
    }),
    `<div data-viva="sempre" data-viva-id="horarios">${
      linha({ rotulo: t("agenda.ultima"), campo: `<span class="linha-valor">${escaparHtml(formatarBrasilia(ag.ultimaRodada, t("agenda.aindaNaoRodou")))}</span>` }) +
      linha({ rotulo: t("agenda.proxima"), campo: `<span class="linha-valor">${escaparHtml(proxima)}</span>` }) +
      linha({ rotulo: t("agenda.resultado"), campo: resultado })
    }</div>`,
    linha({ rotulo: t("agenda.siteLido"), ajuda: t("agenda.siteLidoAjuda"), campo: siteslido + avisoPessoa }),
  ])}

  <form id="form-agendamento" data-config-form>
  ${grupo(e("agenda.comoBuscar"), [
    linha({ rotulo: t("agenda.frequencia"), para: "ag-intervalo", ajuda: t("agenda.minimo", { n: INTERVALO_MINIMO_MIN }), desfazer: true,
      campo: `<select class="campo" id="ag-intervalo" name="intervaloMinutos" data-inicial="${ag.intervaloMinutos}">${seletor}</select>` }),
    linha({ rotulo: t("agenda.quantos"), para: "ag-qtd", ajuda: t("agenda.quantosAjuda"), desfazer: true,
      campo: campo("ag-qtd", "quantidade", "number", String(ag.quantidade), ' min="1" max="100"') }),
    linha({ rotulo: t("agenda.marca"), para: "f-marca", ajuda: t("agenda.quaisAjuda"), desfazer: true,
      campo: `<input class="campo" id="f-marca" name="marca" type="text" placeholder="${e("agenda.qualquer")}" value="${escaparHtml(f.marca ?? "")}" data-inicial="${escaparHtml(f.marca ?? "")}" />` }),
    linha({ rotulo: t("agenda.anoDe"), para: "f-anomin", desfazer: true, campo: campo("f-anomin", "anoMin", "number", v(f.anoMin), ' min="0"') }),
    linha({ rotulo: t("agenda.anoAte"), para: "f-anomax", desfazer: true, campo: campo("f-anomax", "anoMax", "number", v(f.anoMax), ' min="0"') }),
    linha({ rotulo: t("agenda.precoAte"), para: "f-preco", desfazer: true, campo: campo("f-preco", "precoMax", "number", v(f.precoMax), ' min="0"') }),
    linha({ rotulo: t("agenda.kmAte"), para: "f-km", desfazer: true, campo: campo("f-km", "kmMax", "number", v(f.kmMax), ' min="0"') }),
  ], { extra: peDoGrupo() })}
  </form>
  </div>`;
  return casca({ aba: "agendamento", titulo: nomeDaAba("agendamento"), conteudo, contadores, atualizarACada: 10000 });
}

// ---------------------------------------------------------------- Ajustes

export interface InfoProvedor {
  nome: string;
  variavel: string;
  chavePresente: boolean;
  desconhecido: boolean;
}

/** Só diz SE a chave existe. O valor nunca sai desta função. */
export function infoProvedor(env: Record<string, string | undefined> = process.env): InfoProvedor {
  const nome = (env["PROVEDOR_IA"] ?? "claude").trim().toLowerCase();
  if (nome === "deepseek") return { nome: "DeepSeek", variavel: "DEEPSEEK_API_KEY", chavePresente: Boolean(env["DEEPSEEK_API_KEY"]), desconhecido: false };
  if (nome === "claude") return { nome: "Claude (Anthropic)", variavel: "ANTHROPIC_API_KEY", chavePresente: Boolean(env["ANTHROPIC_API_KEY"]), desconhecido: false };
  return { nome: nome || "?", variavel: "PROVEDOR_IA", chavePresente: false, desconhecido: true };
}

/** Idiomas em que o anúncio pode ser escrito (ajuste separado do idioma do painel). */
const IDIOMAS_ANUNCIO = ["pt-BR", "ro", "ru"] as const;

export function paginaAjustes(
  ajustes: { chave: string; valor: string }[],
  contagens: Record<string, number>,
  ia: DadosIA,
  contadores: Contadores = SEM_CONTADORES,
): string {
  const idioma = ajustes.find((a) => a.chave === "idioma_anuncio")?.valor ?? "pt-BR";
  const lista: { valor: string; texto: string }[] = IDIOMAS_ANUNCIO.map((v) => ({ valor: v, texto: t(`ajustes.idiomaAnuncio.${v}` as Chave) }));
  if (!lista.some((i) => i.valor === idioma)) lista.push({ valor: idioma, texto: idioma });
  const espacamento = ajustes.find((a) => a.chave === "publicacao.espacamento_minutos")?.valor ?? "60";
  const urlPublica = ajustes.find((a) => a.chave === "publicacao.url_publica")?.valor ?? "";
  const total = MOTIVOS_REJEICAO.reduce((s, m) => s + (contagens[m] ?? 0), 0);
  const caixas = MOTIVOS_REJEICAO.map(
    (m) => `<div class="caixa"><div class="num">${contagens[m] ?? 0}</div><div class="leg">${escaparHtml(rotuloDe("motivo", m))}</div></div>`,
  ).join("");
  const opcaoIdiomaPainel = IDIOMAS.map(
    (i) => `<option value="${i}"${i === idiomaAtual() ? " selected" : ""}>${escaparHtml(NOME_NATIVO[i])}</option>`,
  ).join("");
  const opcaoTema = (valor: string, chaveTexto: Chave): string =>
    `<label class="opcao-rede"><input type="radio" name="tema" value="${valor}"${valor === "light" ? " checked" : ""} /> <span>${e(chaveTexto)}</span></label>`;
  const idiomaAnuncio = {
    valor: idioma,
    opcoes: lista.map((i) => `<option value="${escaparHtml(i.valor)}"${i.valor === idioma ? " selected" : ""}>${escaparHtml(i.texto)}</option>`).join(""),
  };
  const conteudo = `
  <div class="config-pagina">
  <div><h2>${e("aba.configuracoes")}</h2><p class="leg">${e("ajustes.subtitulo")}</p></div>

  ${grupo(e("ajustes.aparencia.titulo"), [
    linha({
      rotulo: t("ajustes.tema.titulo"),
      ajuda: t("ajustes.tema.ajuda"),
      campo: `<div class="opcoes" id="escolha-tema" role="radiogroup" aria-label="${e("ajustes.tema.titulo")}">${opcaoTema("light", "ajustes.tema.claro")}${opcaoTema("dark", "ajustes.tema.escuro")}${opcaoTema("system", "ajustes.tema.sistema")}</div>`,
    }),
    linha({
      rotulo: t("ajustes.idiomaPainel.titulo"),
      para: "idioma-painel",
      ajuda: `${t("ajustes.idiomaPainel.ajuda")} ${t("ajustes.idiomaPainel.aplica")}`,
      campo: `<select class="campo" id="idioma-painel" name="idiomaPainel" data-idioma-painel>${opcaoIdiomaPainel}</select>`,
    }),
  ])}

  ${secaoIA(ia, idiomaAnuncio)}

  <form id="form-publicacao" data-config-form>
  ${grupo(e("ajustes.pub.titulo"), [
    linha({
      rotulo: t("ajustes.pub.espacamento"), para: "aj-espacamento", ajuda: t("ajustes.pub.espacamentoAjuda"), desfazer: true,
      campo: `<input class="campo" id="aj-espacamento" name="espacamento" type="number" min="0" value="${escaparHtml(espacamento)}" data-inicial="${escaparHtml(espacamento)}" />`,
    }),
    linha({
      rotulo: t("ajustes.pub.url"), para: "aj-url", ajuda: t("ajustes.pub.urlAjuda"), desfazer: true,
      campo: `<input class="campo" id="aj-url" name="urlPublica" type="url" placeholder="https://videos.exemplo.com.br" value="${escaparHtml(urlPublica)}" data-inicial="${escaparHtml(urlPublica)}" />`,
    }),
  ], { extra: peDoGrupo() })}
  </form>

  ${grupo(e("ajustes.rej.titulo"), [
    linha({
      rotulo: t("ajustes.rej.titulo"),
      ajuda: total === 0 ? t("ajustes.rej.nenhuma") : tp("ajustes.rej.total", total),
      campo: `<div class="motivos">${caixas}</div>`,
    }),
  ])}
  </div>`;
  return casca({ aba: "configuracoes", titulo: nomeDaAba("configuracoes"), conteudo, contadores, atualizarACada: 0 });
}
