// Peças de tela dos controles do operador: parar tudo, carro vendido, sugestões de variação e o quadro de "aprovado".
// Só HTML e texto do catálogo. Os dados vêm de quem chama (rotas-controle.ts e a casca em paginas.ts).
import {
  NOMES_REDE, PADRAO_CARDAPIO,
  type AlertaEstoque, type CardapioCompleto, type EstadoPausa, type RespostaAprovar, type SugestaoRede,
} from "@gerador/core";
import { formatarPreco } from "./dinheiro.js";
import { escaparHtml } from "./html.js";
import { t, tOpcional, tp, type Chave } from "./idioma/index.js";
import { formatarBrasilia } from "./tempo.js";

const e = (chave: Chave, params?: Record<string, string | number>): string => escaparHtml(t(chave, params));

// ------------------------------------------------------------------ parar tudo

/** A frase do aviso fixo: quem puxou o freio, quando e por quê. */
export function textoPausa(p: EstadoPausa): string {
  const base = t("pausa.banner", { por: p.por ?? "?", quando: formatarBrasilia(p.em) });
  return p.motivo ? `${base} ${t("pausa.bannerMotivo", { motivo: p.motivo })}` : base;
}

const ICONE_PARAR =
  '<svg class="icone" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9 9h6v6H9z"/></svg>';

/** O freio de mão: sempre no topo, em todas as telas, inconfundível. Vira "Retomar" quando está puxado. */
export function botaoPausa(p: EstadoPausa): string {
  const rotulo = p.pausado ? t("pausa.retomar") : t("pausa.botao");
  return `<button type="button" class="btn parar${p.pausado ? " retomar" : ""}" id="pausa-botao" data-acao="pausa-abrir" title="${escaparHtml(rotulo)}" data-pausado="${p.pausado ? "1" : "0"}" data-rotulo-parar="${e("pausa.botao")}" data-rotulo-retomar="${e("pausa.retomar")}">${ICONE_PARAR}<span class="parar-texto">${escaparHtml(rotulo)}</span></button>`;
}

/** Faixa que aparece enquanto tudo está parado. Fica escondida (e pronta) quando não está. */
export function faixaPausa(p: EstadoPausa): string {
  return `<div class="faixa faixa-pausa" id="pausa-banner" role="status"${p.pausado ? "" : " hidden"}><strong class="faixa-titulo">${e("pausa.titulo")}</strong><span data-pausa-texto>${p.pausado ? escaparHtml(textoPausa(p)) : ""}</span><span class="faixa-ajuda">${e("pausa.ajuda")}</span></div>`;
}

/** Os quadros de confirmação do freio (parar e retomar) e o quadro de "aprovado". Ficam na casca, fechados. */
export function dialogosDeControle(): string {
  const campoNome = (id: string): string => `<div class="grupo"><label for="${id}">${e("pausa.nome")}</label>
        <input class="campo" id="${id}" name="por" type="text" maxlength="80" autocomplete="name" required />
        <span class="linha-ajuda">${e("pausa.nomeAjuda")}</span></div>`;
  return `<dialog class="dialogo" id="dlg-pausa" aria-labelledby="dlg-pausa-t">
    <form id="form-pausa" class="dialogo-corpo">
      <h2 id="dlg-pausa-t">${e("pausa.dialogo.titulo")}</h2>
      <p>${e("pausa.dialogo.texto")}</p>
      ${campoNome("pausa-nome")}
      <div class="grupo"><label for="pausa-motivo">${e("pausa.motivo")}</label>
        <input class="campo" id="pausa-motivo" name="motivo" type="text" maxlength="200" /></div>
      <div class="acoes"><button type="submit" class="btn parar">${e("pausa.confirmar")}</button><button type="button" class="btn ghost" data-acao="fechar-dialogo">${e("acao.cancelar")}</button></div>
    </form>
  </dialog>
  <dialog class="dialogo" id="dlg-retomar" aria-labelledby="dlg-retomar-t">
    <form id="form-retomar" class="dialogo-corpo">
      <h2 id="dlg-retomar-t">${e("pausa.retomarTitulo")}</h2>
      <p>${e("pausa.retomarTexto")}</p>
      ${campoNome("retomar-nome")}
      <div class="acoes"><button type="submit" class="btn primary">${e("pausa.retomarConfirmar")}</button><button type="button" class="btn ghost" data-acao="fechar-dialogo">${e("acao.cancelar")}</button></div>
    </form>
  </dialog>
  <dialog class="dialogo" id="dlg-aprovado" aria-labelledby="dlg-aprovado-t"><div class="dialogo-corpo" data-aprovado-corpo></div></dialog>`;
}

// ---------------------------------------------------------------- carro vendido

/** Quantos vídeos de carros que saíram do site ainda estão no ar (esperando a decisão de uma pessoa). */
export function noArDe(alertas: readonly AlertaEstoque[]): AlertaEstoque[] {
  return alertas.filter((a) => a.situacao === "tirar_do_ar");
}

/** Faixa em todas as telas: existe vídeo no ar de um carro que o site já não lista. */
export function faixaAlertas(alertas: readonly AlertaEstoque[]): string {
  const n = noArDe(alertas).length;
  if (n === 0) return "";
  return `<div class="faixa faixa-alerta" id="alerta-estoque" role="status"><strong class="faixa-titulo">${escaparHtml(tp("alerta.faixa", n))}</strong><a class="btn outline pequeno" href="/publicacoes#alertas-estoque" data-nav>${e("alerta.revisar")}</a></div>`;
}

function nomeDoCarro(ficha: Record<string, unknown>): string {
  return [ficha["marca"], ficha["modelo"], ficha["ano"]].filter((x) => x !== undefined && x !== null && x !== "").join(" ");
}

function linhaAlerta(a: AlertaEstoque): string {
  const nome = nomeDoCarro(a.ficha) || t("pub.videoN", { id: a.videoId });
  const preco = typeof a.ficha["preco"] === "number" ? ` · ${formatarPreco(a.ficha["preco"], a.ficha["moeda"] as string | undefined)}` : "";
  const rede = NOMES_REDE[a.rede as keyof typeof NOMES_REDE] ?? a.rede;
  const noAr = a.situacao === "tirar_do_ar";
  const link = noAr && a.idExterno && /^https?:\/\//.test(a.idExterno)
    ? `<a class="btn outline pequeno" href="${escaparHtml(a.idExterno)}" target="_blank" rel="noopener noreferrer">${e("alerta.abrirPost", { rede })}</a>`
    : "";
  const resolver = noAr
    ? `<button type="button" class="btn ghost pequeno" data-acao="alerta-resolver" data-pub="${a.publicacaoId}" data-rede="${escaparHtml(rede)}">${e("alerta.resolver")}</button>`
    : "";
  const seco = a.simulado ? ` <span class="selo">${e("pub.modoSeco")}</span>` : "";
  return `<div class="linha alerta-linha" data-alerta="${a.publicacaoId}" data-situacao="${a.situacao}">
    <div class="linha-cab"><span class="linha-rotulo">${escaparHtml(nome)}${escaparHtml(preco)}</span>
      <span class="linha-cab-dir"><span class="selo ${noAr ? "erro" : "espera"}">${escaparHtml(noAr ? t("alerta.noAr", { rede }) : t("alerta.bloqueada", { rede }))}</span>${seco}</span></div>
    <p class="linha-valor">${escaparHtml(noAr ? t("alerta.pergunta", { rede }) : t("alerta.bloqueadaTexto", { rede }))}</p>
    <p class="linha-ajuda">${escaparHtml(t("alerta.saiuEm", { quando: formatarBrasilia(a.saiuEm) }))}</p>
    ${noAr ? `<p class="linha-ajuda">${e("alerta.nuncaSozinho")}</p>` : ""}
    ${link || resolver ? `<div class="acoes">${link}${resolver}</div>` : ""}
  </div>`;
}

/** O bloco cheio, na tela de Publicações: cada publicação ligada a um carro que saiu do site. */
export function blocoAlertasEstoque(alertas: readonly AlertaEstoque[]): string {
  if (alertas.length === 0) return "";
  const ordenados = [...noArDe(alertas), ...alertas.filter((a) => a.situacao !== "tirar_do_ar")];
  return `<section class="config-grupo alerta-bloco" id="alertas-estoque" aria-labelledby="alertas-estoque-t">
    <h3 id="alertas-estoque-t">${e("alerta.titulo")}</h3>
    <p class="linha-ajuda">${e("alerta.intro")}</p>
    <div class="config-linhas">${ordenados.map(linhaAlerta).join("")}</div>
  </section>`;
}

// ---------------------------------------------------------- sugestões de variação

const CAMPOS_VARIACAO = ["modelo", "cor", "enquadramento"] as const;
type CampoVariacao = (typeof CAMPOS_VARIACAO)[number];

/** Nome legível de uma escolha do cardápio, no idioma da pessoa. */
export function nomeDaOpcao(campo: string, id: string): string {
  return tOpcional(`cardapio.${campo}.${id}`) ?? tOpcional(`${campo}.${id}`) ?? id;
}

export function chaveDaVariacao(c: Pick<CardapioCompleto, CampoVariacao>): string {
  return `${c.modelo}|${c.cor}|${c.enquadramento}`;
}

/** Só as escolhas que as sugestões mexem (as outras ficam como estão). */
export function escolhaAtual(v: { modelo?: string | null | undefined; cor?: string | null | undefined; enquadramento?: string | null | undefined }): Pick<CardapioCompleto, CampoVariacao> {
  return {
    modelo: (v.modelo ?? PADRAO_CARDAPIO.modelo) as CardapioCompleto["modelo"],
    cor: (v.cor ?? PADRAO_CARDAPIO.cor) as CardapioCompleto["cor"],
    enquadramento: (v.enquadramento ?? PADRAO_CARDAPIO.enquadramento) as CardapioCompleto["enquadramento"],
  };
}

/** Os botões das sugestões. O que muda em relação ao vídeo atual vai em negrito; o resto fica discreto. */
export function botoesDeSugestoes(lista: readonly CardapioCompleto[], atual: Pick<CardapioCompleto, CampoVariacao>): string {
  if (lista.length === 0) return `<p class="leg">${e("refazer.semSugestoes")}</p>`;
  return lista
    .map((s) => {
      const dados = escaparHtml(JSON.stringify({ modelo: s.modelo, cor: s.cor, enquadramento: s.enquadramento }));
      const nomes = CAMPOS_VARIACAO.map((campo) => {
        const mudou = s[campo] !== atual[campo];
        const amostra = campo === "cor" ? `<i class="sug-cor" data-cor="${escaparHtml(s.cor)}" aria-hidden="true"></i>` : "";
        return `<span class="sug-linha${mudou ? " mudou" : ""}" title="${escaparHtml(tOpcional(`cardapio.grupo.${campo}`) ?? campo)}">${amostra}<span class="sug-valor">${escaparHtml(nomeDaOpcao(campo, s[campo]))}</span></span>`;
      }).join("");
      return `<button type="button" class="btn sugestao" data-sugestao="${dados}" data-chave="${escaparHtml(chaveDaVariacao(s))}" aria-pressed="false">${nomes}</button>`;
    })
    .join("");
}

export function blocoVariacoes(lista: readonly CardapioCompleto[], atual: Pick<CardapioCompleto, CampoVariacao>, semente = 1): string {
  return `<div class="grupo variacoes" data-variacoes data-semente="${semente}">
    <span class="rotulo">${e("refazer.sugestoes")}</span>
    <span class="leg">${e("refazer.sugestoesAjuda")}</span>
    <div class="sugestoes" role="group" aria-label="${e("refazer.sugestoes")}" data-sugestoes>${botoesDeSugestoes(lista, atual)}</div>
    <div><button type="button" class="btn ghost pequeno" data-acao="outras-sugestoes">${e("refazer.outras")}</button></div>
  </div>`;
}

// ------------------------------------------------------------- aprovado + agendar

const MOTIVOS_APROVAR = new Set([
  "video_inexistente", "nao_aprovado", "nao_conectada", "ja_agendada", "ja_publicada", "nao_passa_validacao",
  "validacao_indisponivel", "visibilidade_obrigatoria", "grade_desligada", "rede_fora_da_grade", "sem_vaga",
]);

function motivoDaRede(s: SugestaoRede, bloqueios: string | undefined): string {
  if (s.motivo === "nao_passa_validacao" && bloqueios) return bloqueios;
  if (s.motivo && MOTIVOS_APROVAR.has(s.motivo)) return t(`aprovar.motivo.${s.motivo}` as Chave);
  return t("aprovar.motivo.nao_passa_validacao");
}

/**
 * O quadro que abre depois de aprovar: só as redes em que o vídeo PASSA têm caixa para marcar.
 * As que não passam aparecem como aviso, sem caixa nenhuma: nunca se oferece o que não pode sair.
 * `bloqueios` traz a frase de cada bloqueio já no idioma da pessoa.
 */
export function quadroAprovado(r: RespostaAprovar, bloqueios: Partial<Record<string, string>> = {}): string {
  const oferecidas = r.sugestoes.filter((s) => s.passa && s.sugestao);
  const semVaga = r.sugestoes.filter((s) => s.passa && !s.sugestao);
  const fora = r.sugestoes.filter((s) => !s.passa);
  const caixas = oferecidas.map((s) => {
    const it = s.sugestao!;
    const origem = it.origem === "grade" ? t("aprovar.origemGrade") : t("aprovar.origemLivre");
    return `<label class="opcao-rede"><input type="checkbox" name="rede" value="${s.rede}" data-quando="${escaparHtml(it.horario.iso)}" checked /><span><strong>${escaparHtml(NOMES_REDE[s.rede])}</strong><span class="leg">${escaparHtml(formatarBrasilia(it.horario.iso))} · ${escaparHtml(origem)}</span></span></label>`;
  });
  const avisos = [
    ...semVaga.map((s) => `<li>${escaparHtml(t("aprovar.semVaga", { rede: NOMES_REDE[s.rede], motivo: motivoDaRede(s, undefined) }))}</li>`),
    ...fora.map((s) => `<li>${escaparHtml(t("aprovar.naoPassa", { rede: NOMES_REDE[s.rede], motivo: motivoDaRede(s, bloqueios[s.rede]) }))}</li>`),
  ];
  return `<h2 id="dlg-aprovado-t">${e("aprovar.titulo")}</h2>
    <form id="form-aprovado" data-video="${r.video.id}">
      ${oferecidas.length > 0
        ? `<p>${e("aprovar.intro")}</p><div class="redes-opcoes" role="group" aria-label="${e("aprovar.intro")}">${caixas.join("")}</div>`
        : `<p>${e("aprovar.nenhuma")}</p>`}
      ${avisos.length > 0 ? `<div class="aviso info"><p class="rotulo">${e("aprovar.naoOferecidas")}</p><ul class="lista-simples">${avisos.join("")}</ul></div>` : ""}
      <div class="acoes">
        ${oferecidas.length > 0 ? `<button type="submit" class="btn primary">${e("aprovar.agendar")}</button>` : ""}
        <button type="button" class="btn ${oferecidas.length > 0 ? "ghost" : "primary"}" data-acao="fechar-dialogo">${e(oferecidas.length > 0 ? "aprovar.depois" : "acao.fechar")}</button>
      </div>
      <p class="linha-ajuda">${e("aprovar.ajuda")}</p>
    </form>`;
}
