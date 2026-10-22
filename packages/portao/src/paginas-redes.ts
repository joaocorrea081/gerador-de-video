// Bloco "por rede" do cartão de vídeo: validação (selo passa/não passa), legenda editável e prévia do feed.
// Só HTML. Os números vêm do que o servidor mediu no MP4 (core/midia.ts), nunca do modelo de linguagem.
import { LIMITE_LEGENDA, NOMES_REDE, type Rede } from "@gerador/core";
import { escaparHtml } from "./html.js";
import { t, tp, type Chave } from "./idioma/index.js";

export interface ValidacaoRede {
  rede: Rede;
  ok: boolean;
  bloqueios: { mensagem: string }[];
  avisos: { mensagem: string }[];
}

export interface LegendaDaRede {
  texto: string;
  /** manual = editada à mão; ia = escrita pela IA; ficha = ainda só a ficha lida do site. */
  origem: "manual" | "ia" | "ficha";
}

export interface DadosRedes {
  validacao: ValidacaoRede[] | null;
  /** Texto já no idioma da requisição. */
  validacaoErro: string | null;
  legendas: Record<Rede, LegendaDaRede>;
  /** Nome da conta conectada, para a prévia. Null = ainda não conectada. */
  contas: Record<Rede, string | null>;
  iaDisponivel: boolean;
}

/**
 * Onde cada app corta a legenda e mostra "mais". Aproximação: Instagram cerca de 125 caracteres,
 * TikTok cerca de 100 (blogs de ferramentas de social media; não há número oficial publicado).
 * Facebook: sem fonte, usa o mesmo do Instagram. Por isso a prévia avisa que é aproximada.
 */
export const CORTE_PREVIA: Record<Rede, number> = { instagram: 125, facebook: 125, tiktok: 100 };

export function cortarLegenda(texto: string, corte: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  const letras = [...limpo];
  return letras.length > corte ? `${letras.slice(0, corte).join("").trimEnd()}${t("redes.mais")}` : limpo;
}

const e = (chave: Chave, params?: Record<string, string | number>): string => escaparHtml(t(chave, params));

const GLIFOS: Record<string, string> = {
  coracao: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  comentario: '<path d="M4 5h16v11H9l-5 4z"/>',
  enviar: '<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>',
  salvar: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  mais: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/>',
  busca: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  musica: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
};
function glifo(nome: string): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLIFOS[nome] ?? ""}</svg>`;
}

/** Prévia aproximada do feed: moldura vertical 9:16, barra de cima, ícones de ação, conta, legenda cortada e contagem. */
function previa(id: number, temMp4: boolean, rede: Rede, texto: string, conta: string | null): string {
  const nome = NOMES_REDE[rede];
  const exemplo = conta === null;
  const quem = conta ?? t("redes.suaConta");
  const limite = LIMITE_LEGENDA[rede];
  const video = temMp4
    ? `<video src="/video/${id}.mp4" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video>`
    : `<div class="previa-vazio">${e("redes.semVideo")}</div>`;
  const topos: Record<Rede, string> = {
    instagram: `<span class="previa-titulo">Reels</span><span class="previa-ico">${glifo("camera")}</span>`,
    facebook: `<span class="previa-titulo">Reels</span><span class="previa-ico">${glifo("busca")}${glifo("mais")}</span>`,
    tiktok: `<span class="previa-abas"><span>${e("redes.tiktok.seguindo")}</span><b>${e("redes.tiktok.paraVoce")}</b></span><span class="previa-ico">${glifo("busca")}</span>`,
  };
  const lateral: Record<Rede, string> = {
    instagram: ["coracao", "comentario", "enviar", "mais"].map(glifo).join(""),
    facebook: ["coracao", "comentario", "enviar", "mais"].map(glifo).join(""),
    tiktok: ["coracao", "comentario", "salvar", "enviar"].map(glifo).join(""),
  };
  const seguir = rede === "tiktok" ? "" : `<span class="previa-seguir">${e("redes.seguir")}</span>`;
  const trilha = `<div class="previa-trilha">${glifo("musica")}<span>${rede === "tiktok" ? e("redes.somOriginal") : e("redes.audioOriginal")}</span></div>`;
  const marcaExemplo = exemplo ? `<span class="previa-exemplo">${e("redes.exemplo")}</span>` : "";
  const total = [...texto].length;
  return `<figure class="previa previa-${rede}" aria-label="${e("redes.previaAria", { rede: nome })}">
    <div class="previa-tela">${video}
      <div class="previa-topo">${topos[rede]}</div>
      <div class="previa-lateral" aria-hidden="true">${lateral[rede]}</div>
      <div class="previa-rodape">
        <div class="previa-linha-conta"><i class="previa-avatar" aria-hidden="true"></i><span class="previa-conta">${rede === "facebook" ? "" : "@"}${escaparHtml(quem)}</span>${seguir}${marcaExemplo}</div>
        <p class="previa-texto" data-previa-texto="${rede}" data-corte="${CORTE_PREVIA[rede]}">${escaparHtml(cortarLegenda(texto, CORTE_PREVIA[rede]))}</p>
        ${trilha}
      </div>
    </div>
    <figcaption class="leg"><span data-previa-contagem="${rede}" data-limite="${limite}">${e("redes.previaContagem", { n: total, limite })}</span><br />${e("redes.proporcao", { rede: nome, corte: CORTE_PREVIA[rede] })}</figcaption>
  </figure>`;
}

function seloValidacao(v: ValidacaoRede): string {
  const nome = NOMES_REDE[v.rede];
  const motivo = v.ok ? t("redes.passaTodas") : v.bloqueios.map((b) => b.mensagem).join(" ");
  return `<span class="selo ${v.ok ? "ok" : "erro"}" data-validacao="${v.rede}" data-passa="${v.ok}" title="${escaparHtml(motivo)}">${escaparHtml(t(v.ok ? "redes.seloPassa" : "redes.seloNaoPassa", { rede: nome }))}</span>`;
}

function colunaRede(id: number, temMp4: boolean, rede: Rede, d: DadosRedes): string {
  const l = d.legendas[rede];
  const limite = LIMITE_LEGENDA[rede];
  const nome = NOMES_REDE[rede];
  return `<div class="rede-col" data-rede="${rede}">
    <h3>${nome}</h3>
    ${previa(id, temMp4, rede, l.texto, d.contas[rede])}
    <div class="grupo">
      <label for="leg-${id}-${rede}">${e("redes.legendaDe", { rede: nome })}</label>
      <div><textarea class="campo" id="leg-${id}-${rede}" name="legenda-${rede}" data-legenda="${rede}" maxlength="${limite}">${escaparHtml(l.texto)}</textarea><div class="contador"></div></div>
      <span class="leg" data-origem="${rede}">${e(`redes.origem.${l.origem}` as Chave)} ${e("redes.limite", { n: limite })}</span>
    </div>
    <div class="acoes"><button type="button" class="btn outline pequeno" data-acao="salvar-legenda" data-rede="${rede}">${e("redes.salvarLegenda")}</button></div>
  </div>`;
}

export interface PartesRedes {
  /** Faixa compacta: selos por rede e, quando há o que explicar, um bloco que abre e fecha. */
  resumo: string;
  /** Botão que abre o painel de legenda e prévia (vai junto das outras ferramentas). */
  botaoLegenda: string;
  /** Painel de legenda e prévia por rede, escondido até a pessoa abrir. */
  painel: string;
}

export function partesRedes(id: number, caminhoMp4: string | null, d: DadosRedes): PartesRedes {
  const temMp4 = Boolean(caminhoMp4);
  let selos: string;
  let detalhes = "";
  let nota = "";
  if (d.validacao) {
    selos = d.validacao.map(seloValidacao).join("");
    const falhas = d.validacao.filter((v) => !v.ok);
    const ressalvas = d.validacao.filter((v) => v.ok && v.avisos.length > 0);
    let corpo = "";
    if (falhas.length > 0) {
      corpo += `<ul class="lista-simples motivos-validacao">${falhas
        .map((v) => `<li>${t("redes.naoPassaItem", { rede: `<strong>${NOMES_REDE[v.rede]}</strong>`, motivo: escaparHtml(v.bloqueios.map((b) => b.mensagem).join(" ")) })}</li>`)
        .join("")}</ul><p class="leg">${e("redes.naoAgenda")}</p>`;
    }
    if (ressalvas.length > 0) {
      corpo += `<ul class="lista-simples">${ressalvas
        .map((v) => `<li class="leg">${t("redes.atencaoItem", { rede: `<strong>${NOMES_REDE[v.rede]}</strong>`, motivo: escaparHtml(v.avisos.map((a) => a.mensagem).join(" ")) })}</li>`)
        .join("")}</ul>`;
    }
    if (corpo) {
      const n = falhas.length + ressalvas.length;
      detalhes = `<details class="detalhes${falhas.length > 0 ? " com-erro" : ""}"><summary>${escaparHtml(tp("redes.detalhes", n))}</summary><div class="detalhes-corpo">${corpo}</div></details>`;
    }
  } else {
    selos = `<span class="selo espera">${e("redes.indisponivel")}</span>`;
    nota = `<p class="leg">${escaparHtml(d.validacaoErro ?? t("redes.naoLeu"))}</p>`;
  }
  const aviso = d.iaDisponivel
    ? ""
    : `<div class="aviso info" data-sem-chave>${e("redes.semChave")} <a href="/configuracoes">${e("redes.abrirAjustes")}</a></div>`;
  const resumo = `<section class="redes redes-compacto" aria-label="${e("redes.aria")}" data-redes>
    <div class="redes-cab"><div class="selos-rede">${selos}</div></div>
    ${nota}${detalhes}
  </section>`;
  const botaoLegenda = `<button type="button" class="btn ghost" data-abre="redes" aria-pressed="false" aria-expanded="false">${e("redes.abrir")}</button>`;
  const painel = `<div class="painel" data-painel="redes" hidden>
      ${aviso}
      <div class="acoes">
        <button type="button" class="btn primary" data-acao="gerar-legendas">${e("redes.gerar")}</button>
        <button type="button" class="btn ghost" data-acao="fechar">${e("acao.fechar")}</button>
      </div>
      <p class="leg">${e("redes.iaAviso")}</p>
      <div class="redes-grade">${(Object.keys(d.legendas) as Rede[]).map((r) => colunaRede(id, temMp4, r, d)).join("")}</div>
      <p class="leg">${e("redes.previaAviso")}</p>
    </div>`;
  return { resumo, botaoLegenda, painel };
}

/** Versão em bloco único, usada no Histórico: faixa, botões e painel um depois do outro. */
export function blocoRedes(id: number, caminhoMp4: string | null, d: DadosRedes, op: { agendar: boolean }): string {
  const p = partesRedes(id, caminhoMp4, d);
  return `${p.resumo}
    <div class="acoes">
      ${p.botaoLegenda}
      ${op.agendar ? `<a class="btn primary" href="/calendario?video=${id}#marcar" data-nav>${e("redes.agendar")}</a>` : ""}
    </div>
    ${p.painel}`;
}
