// Padrão de "linha de configuração" (medido no Harness, tema/PADRAO.md): lista de linhas separadas por fio de 0.5px,
// rótulo pequeno, ajuda curta embaixo, desfazer à direita do rótulo, Salvar/Descartar juntos no pé do grupo.
import { escaparHtml } from "./html.js";
import { t } from "./idioma/index.js";

export interface OpcoesLinha {
  /** Texto do rótulo (já escapado ou texto puro, ver `rotuloHtml`). */
  rotulo: string;
  /** Id do campo, para o <label for>. Sem id o rótulo é um <span>. */
  para?: string;
  ajuda?: string | undefined;
  /** HTML do controle. */
  campo: string;
  /** Mostra "Desfazer" à direita do rótulo quando o campo muda (o campo precisa de data-inicial). */
  desfazer?: boolean;
  /** HTML extra à direita do rótulo (selos, ações). */
  cab?: string;
  classe?: string;
}

export function linha(o: OpcoesLinha): string {
  const rotulo = o.para
    ? `<label class="linha-rotulo" for="${o.para}">${escaparHtml(o.rotulo)}</label>`
    : `<span class="linha-rotulo">${escaparHtml(o.rotulo)}</span>`;
  const desfazer = o.desfazer
    ? `<button type="button" class="btn-desfazer" data-acao="desfazer" hidden>${escaparHtml(t("acao.desfazer"))}</button>`
    : "";
  return `<div class="linha${o.classe ? ` ${o.classe}` : ""}"><div class="linha-cab">${rotulo}<span class="linha-cab-dir">${o.cab ?? ""}${desfazer}</span></div>${
    o.ajuda ? `<p class="linha-ajuda">${escaparHtml(o.ajuda)}</p>` : ""
  }${o.campo}</div>`;
}

/** Grupo: título, introdução curta e a lista de linhas. `pe` é o rodapé (Salvar/Descartar). */
export function grupo(titulo: string, linhas: string[], o: { id?: string; intro?: string; extra?: string; classe?: string; attrs?: string } = {}): string {
  return `<section class="config-grupo${o.classe ? ` ${o.classe}` : ""}"${o.id ? ` id="${o.id}"` : ""}${o.attrs ? ` ${o.attrs}` : ""}>
    <h3>${titulo}</h3>${o.intro ? `<p class="linha-ajuda">${escaparHtml(o.intro)}</p>` : ""}
    <div class="config-linhas">${linhas.join("")}</div>${o.extra ?? ""}
  </section>`;
}

/** Salvar e Descartar juntos, escondidos até haver mudança pendente. */
export function peDoGrupo(): string {
  return `<div class="config-pe" data-pe hidden><button type="submit" class="btn primary">${escaparHtml(t("acao.salvar"))}</button><button type="button" class="btn ghost" data-acao="descartar">${escaparHtml(t("acao.descartar"))}</button></div>`;
}

/** Chave (switch): mostra o ESTADO pela posição e pela cor. Sem botão "Ligar" ao lado e sem etiqueta repetida. */
export function chave(o: { ligado: boolean; rotulo: string; attrs?: string; desabilitada?: boolean; id?: string }): string {
  return `<button type="button" role="switch" class="chave" aria-checked="${o.ligado}" aria-label="${escaparHtml(o.rotulo)}"${o.id ? ` id="${o.id}"` : ""}${o.desabilitada ? " disabled" : ""}${o.attrs ? ` ${o.attrs}` : ""}><span class="chave-trilho"><span class="chave-bola"></span></span></button>`;
}
