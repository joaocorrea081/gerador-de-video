// Telas de publicação: Calendário, Publicações, Contas e Prontidão.
// Hora em Brasília na tela (tempo.ts); o servidor continua em UTC. Segredo nunca entra aqui:
// as funções recebem só a visão pública da conta (ContaRede), que não tem token.
import {
  MAXIMO_TENTATIVAS_PUBLICACAO,
  NOMES_REDE,
  type ContaRede,
  type EstadoPublicacao,
  type Publicacao,
  type PublicacaoNoCalendario,
  type Rede,
} from "@gerador/core";
import { casca, e, icone, nomeDaAba, SEM_CONTADORES, type Contadores } from "./paginas.js";
import { escaparHtml } from "./html.js";
import { chave } from "./linhas.js";
import { formatarPreco } from "./dinheiro.js";
import { contextoTela } from "./contexto-tela.js";
import { blocoAlertasEstoque } from "./pecas-controle.js";
import { localeDe, t, tp, type Chave } from "./idioma/index.js";
import {
  diaCurto, diaDaSemana, diaMes, formatarBrasilia, horaBrasilia, mesPorExtenso, somarDias, ymdDeIso, ymdValido,
} from "./tempo.js";

const TOM_ESTADO_PUB: Record<EstadoPublicacao, "" | "ok" | "espera" | "erro"> = {
  agendada: "",
  publicando: "espera",
  publicada: "ok",
  falhou: "erro",
  cancelada: "",
  verificar: "espera",
};

function rotuloEstadoPub(estado: EstadoPublicacao): string {
  return t(`pub.estado.${estado}` as Chave);
}

function seloPub(estado: EstadoPublicacao): string {
  return `<span class="selo ${TOM_ESTADO_PUB[estado]}">${escaparHtml(rotuloEstadoPub(estado))}</span>`;
}

// ----------------------------------------------------------- conferência de preço

const ESPERAS_CONFERENCIA = [0, 15, 30, 60, 120] as const;

/** Por que a conferência segurou esta publicação, com as diferenças "de X para Y" e as duas saídas: desmarcar ou tentar de novo. */
export function blocoConferencia(p: Publicacao, opcoes: { comDesmarcar?: boolean } = {}): string {
  const comDesmarcar = opcoes.comDesmarcar !== false;
  const c = p.conferencia;
  if (p.estado !== "agendada" || !c || c.estado === "ok") return "";
  const mudou = c.estado === "mudou";
  const semReferencia = c.codigo === "sem_referencia";
  const motivo = semReferencia
    ? t("conf.semReferencia")
    : c.codigo === "tempo_esgotado"
      ? t("conf.tempoEsgotado")
      : (c.motivo ?? "");
  const corpo = mudou
    ? `<ul class="lista-simples" data-diferencas>${c.diferencas.map((d) => `<li>${escaparHtml(d.descricao)}</li>`).join("")}</ul><p class="leg">${e("conf.mudouTexto")}</p>`
    : `<p data-motivo>${escaparHtml(motivo)}</p>${semReferencia ? "" : `<p class="leg">${e("conf.naoConferiuTexto")}</p>`}`;
  const espera = semReferencia
    ? `<a class="btn outline pequeno" data-nav href="/fila">${e("conf.refazer")}</a>`
    : `<span class="conf-espera"><label for="conf-espera-${p.id}">${e("conf.tentarEm")}</label>
        <select class="campo" id="conf-espera-${p.id}">${ESPERAS_CONFERENCIA.map((n) => `<option value="${n}"${n === 30 ? " selected" : ""}>${n === 0 ? e("conf.agora") : e("conf.minutos", { n })}</option>`).join("")}</select>
        <button type="button" class="btn primary pequeno" data-acao="conferir-de-novo" data-pub="${p.id}">${e("conf.tentar")}</button></span>`;
  return `<div class="aviso ${mudou ? "erro" : "info"} conf-bloco" role="status" data-conferencia="${c.estado}" data-conferencia-codigo="${escaparHtml(c.codigo ?? "")}">
    <strong>${escaparHtml(NOMES_REDE[p.rede])}: ${e(`conf.titulo.${c.estado}` as Chave)}</strong>
    ${corpo}
    <p class="leg">${e("conf.lidoEm", { quando: formatarBrasilia(c.em) })}</p>
    <div class="acoes">${espera}${comDesmarcar ? `<button type="button" class="btn outline pequeno perigo" data-acao="desmarcar" data-pub="${p.id}">${e("cal.desmarcar")}</button>` : ""}</div>
  </div>`;
}

function conferenciaRetida(p: Publicacao): boolean {
  return p.estado === "agendada" && p.conferencia !== null && p.conferencia.estado !== "ok";
}

// ------------------------------------------------------------------ Calendário

export interface EntradaCalendario {
  visao: "mes" | "semana";
  /** Um dia (AAAA-MM-DD, Brasília) dentro do período mostrado. */
  ancora: string;
  hoje: string;
  itens: PublicacaoNoCalendario[];
  /** Vídeos aprovados com MP4: os únicos que podem entrar no calendário. */
  videos: { id: number; nome: string }[];
  contas: ContaRede[];
  espacamentoMin: number;
  videoSelecionado: number | null;
  contadores?: Contadores;
  /** Por vídeo: o que o cartão de passar o mouse mostra (nome do carro, preço, versão do arquivo para a miniatura). */
  fichas?: Record<number, FichaDoCalendario>;
}

export interface FichaDoCalendario {
  nome: string;
  preco?: number | undefined;
  moeda?: string | undefined;
  versao?: string | undefined;
}

/** Primeiro e último dia (inclusive) que a grade mostra. */
export function periodoDoCalendario(visao: "mes" | "semana", ancora: string): { inicio: string; fim: string } {
  if (visao === "semana") {
    const inicio = somarDias(ancora, -diaDaSemana(ancora));
    return { inicio, fim: somarDias(inicio, 6) };
  }
  const primeiro = `${ancora.slice(0, 7)}-01`;
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  const proxMes = somarDias(`${ancora.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";
  const ultimo = somarDias(proxMes, -1);
  return { inicio, fim: somarDias(ultimo, 6 - diaDaSemana(ultimo)) };
}

export function parametrosCalendario(visao: string | null, data: string | null, hoje: string): { visao: "mes" | "semana"; ancora: string } {
  return { visao: visao === "semana" ? "semana" : "mes", ancora: ymdValido(data) ? data : hoje };
}

function chip(p: PublicacaoNoCalendario, semana: boolean, ficha?: FichaDoCalendario): string {
  const retida = conferenciaRetida(p);
  const tom = retida ? "erro" : p.estado === "publicada" ? "ok" : p.estado === "falhou" ? "erro" : p.estado === "publicando" || p.estado === "verificar" ? "espera" : p.estado === "cancelada" ? "apagada" : "";
  const titulo = p.videoTitulo ?? t("pub.videoN", { id: p.videoId });
  const arte = ficha?.versao ? `/api/videos/${p.videoId}/miniatura.jpg?v=${encodeURIComponent(ficha.versao)}` : null;
  const mini = arte ? `<img class="chip-mini" src="${arte}" alt="" width="18" height="32" loading="lazy" decoding="async" onerror="this.hidden=true" />` : "";
  const preco = ficha?.preco !== undefined ? formatarPreco(ficha.preco, ficha.moeda) : t("cal.cartaoSemPreco");
  const info = ficha && arte
    ? `<span class="chip-info" hidden><img class="cartao-arte" src="${arte}" alt="" width="180" height="320" onerror="this.hidden=true" />
        <strong class="cartao-nome">${escaparHtml(ficha.nome)}</strong><span class="cartao-preco">${escaparHtml(preco)}</span>
        <span class="cartao-quando">${escaparHtml(t("cal.cartaoQuando", { rede: NOMES_REDE[p.rede], quando: formatarBrasilia(p.agendadaPara) }))}</span></span>`
    : "";
  return `<span class="chip-wrap"><button type="button" class="chip ${tom}"${ficha ? ` data-cartao="${p.id}"` : ""} data-acao="abrir-pub" data-pub="${p.id}" aria-expanded="false" aria-controls="pub-${p.id}" title="${escaparHtml(`${NOMES_REDE[p.rede]} · ${rotuloEstadoPub(p.estado)} · ${titulo}`)}">
    ${mini}<span class="chip-texto"><span class="chip-hora">${horaBrasilia(p.agendadaPara)}</span>
    <span class="chip-rede">${NOMES_REDE[p.rede]}</span>
    ${semana ? `<span class="chip-titulo">${escaparHtml(titulo)}</span>` : ""}
    <span class="chip-estado">${escaparHtml(retida ? t("conf.chip") : rotuloEstadoPub(p.estado))}</span></span>
  </button>${info}</span>`;
}

function celulaDia(ymd: string, itens: PublicacaoNoCalendario[], ent: EntradaCalendario, semana: boolean): string {
  const classes = ["dia", ymd === ent.hoje ? "hoje" : "", !semana && ymd.slice(0, 7) !== ent.ancora.slice(0, 7) ? "fora" : ""].filter(Boolean).join(" ");
  const passado = ymd < ent.hoje;
  const nome = diaCurto(diaDaSemana(ymd));
  return `<div class="${classes}" role="group" aria-label="${escaparHtml(`${nome}, ${diaMes(ymd)}, ${tp("cal.publicacoes", itens.length)}`)}" data-dia-celula="${ymd}">
    <div class="dia-cab"><span class="dia-n">${semana ? `${nome} ` : ""}${ymd.slice(8, 10).replace(/^0/, "")}${semana ? `/${ymd.slice(5, 7)}` : ""}</span>
      <button type="button" class="btn ghost pequeno dia-mais" data-acao="marcar-dia" data-dia="${ymd}" aria-label="${e("cal.marcarEm", { dia: diaMes(ymd) })}"${passado ? " disabled" : ""}>+</button></div>
    <div class="dia-itens">${itens.map((p) => chip(p, semana, ent.fichas?.[p.videoId])).join("")}</div>
  </div>`;
}

function detalhePub(p: PublicacaoNoCalendario): string {
  const dia = ymdDeIso(p.agendadaPara);
  const hora = horaBrasilia(p.agendadaPara);
  const podeRemarcar = p.estado !== "publicada" && p.estado !== "publicando";
  const podeDesmarcar = p.estado === "agendada" || p.estado === "falhou" || p.estado === "verificar";
  const info = [
    `<span>${NOMES_REDE[p.rede]}</span>`,
    seloPub(p.estado),
    `<span class="leg">${escaparHtml(formatarBrasilia(p.agendadaPara))}</span>`,
    p.rede === "tiktok" ? `<span class="leg">${e("cal.visibilidade", { valor: t(p.visibilidade === "publica" ? "cal.vis.publica" : "cal.vis.privada") })}</span>` : "",
    p.simulado ? `<span class="selo">${e("pub.modoSeco")}</span>` : "",
  ].join(" ");
  return `<div class="painel" id="pub-${p.id}" data-painel-pub="${p.id}" data-pub-id="${p.id}" hidden>
    <div><strong>${escaparHtml(p.videoTitulo ?? t("pub.videoN", { id: p.videoId }))}</strong></div>
    <div class="acoes">${info}</div>
    ${p.erro ? `<div class="aviso erro">${escaparHtml(p.erro)}</div>` : ""}
    ${blocoConferencia(p, { comDesmarcar: false })}
    ${
      podeRemarcar
        ? `<div class="grade-form">
        <div class="grupo"><label for="rm-dia-${p.id}">${e("cal.novoDia")}</label><input class="campo" id="rm-dia-${p.id}" type="date" value="${dia}" /></div>
        <div class="grupo"><label for="rm-hora-${p.id}">${e("cal.novaHora")}</label><input class="campo" id="rm-hora-${p.id}" type="time" value="${hora}" /></div>
      </div>
      <div class="aviso info" data-conflito hidden></div>`
        : `<p class="leg">${e("cal.jaSaiu")}</p>`
    }
    <div class="acoes">
      ${podeRemarcar ? `<button type="button" class="btn primary" data-acao="remarcar" data-pub="${p.id}">${e(p.estado === "cancelada" ? "cal.marcarDeNovo" : "cal.remarcar")}</button>` : ""}
      ${podeDesmarcar ? `<button type="button" class="btn outline perigo" data-acao="desmarcar" data-pub="${p.id}">${e("cal.desmarcar")}</button>` : ""}
      <a class="btn ghost" href="/publicacoes" data-nav>${e("cal.verEmPublicacoes")}</a>
      <button type="button" class="btn ghost" data-acao="fechar-pub">${e("acao.fechar")}</button>
    </div>
  </div>`;
}

function formularioMarcar(ent: EntradaCalendario): string {
  if (ent.videos.length === 0) {
    return `<section class="cartao vazio" id="marcar">
      <span class="grande">${e("cal.semVideo.titulo")}</span>
      <p class="leg">${e("cal.semVideo.texto")}</p>
      <div class="acoes"><a class="btn primary" href="/fila" data-nav>${e("acao.irParaFila")}</a></div>
    </section>`;
  }
  const contaDe = (r: Rede) => ent.contas.find((c) => c.rede === r);
  const redes = contextoTela().redesAtivas.map((r) => {
    const c = contaDe(r);
    const conectada = c?.conectada === true;
    return `<label class="opcao-rede"><input type="checkbox" name="rede" value="${r}"${conectada ? "" : " disabled data-sem-conta"} />
      <span><strong>${NOMES_REDE[r]}</strong>
      <span class="leg" data-valida="${r}">${conectada ? e(c!.modo === "seco" ? "cal.conectadaSeco" : "cal.conectada") : `${e("cal.naoConectada")} <a href="/contas" data-nav>${e("cal.conectarEmContas")}</a>`}</span></span></label>`;
  }).join("");
  return `<section class="cartao" id="marcar" data-card>
    <div class="cartao-cab"><div><h3>${e("cal.marcar.titulo")}</h3>
      <p class="leg">${e("cal.marcar.texto")}</p></div></div>
    <form id="form-marcar" style="display:flex;flex-direction:column;gap:16px" data-espacamento="${ent.espacamentoMin}">
      <div class="grade-form">
        <div class="grupo"><label for="m-video">${e("cal.videoAprovado")}</label>
          <select class="campo" id="m-video" name="video">${ent.videos.map((v) => `<option value="${v.id}"${v.id === ent.videoSelecionado ? " selected" : ""}>${escaparHtml(v.nome)}</option>`).join("")}</select></div>
        <div class="grupo"><label for="m-dia">${e("cal.dia")}</label><input class="campo" id="m-dia" name="dia" type="date" required value="${ent.hoje}" /></div>
        <div class="grupo"><label for="m-hora">${e("cal.hora")}</label><input class="campo" id="m-hora" name="hora" type="time" required value="12:00" /></div>
      </div>
      <fieldset class="grupo" style="border:0;padding:0;margin:0"><legend class="rotulo">${e("cal.quaisRedes")}</legend>
        <div class="redes-opcoes">${redes}</div></fieldset>
      <fieldset class="grupo" data-so-tiktok hidden style="border:0;padding:0;margin:0"><legend class="rotulo">${e("cal.tiktokQuem")}</legend>
        <div class="opcoes">
          <label class="opcao-rede"><input type="radio" name="visibilidade" value="publica" /> <span>${e("cal.vis.publicaRotulo")}</span></label>
          <label class="opcao-rede"><input type="radio" name="visibilidade" value="privada" /> <span>${e("cal.vis.privadaRotulo")}</span></label>
        </div>
        <span class="leg">${e("cal.tiktokSemAuditoria")}</span></fieldset>
      <div class="chave-linha">${chave({ ligado: false, rotulo: t("cal.iaGerado"), attrs: 'data-campo="iaGerado"' })}<span class="chave-texto">${e("cal.iaGerado")}</span></div>
      <div class="aviso info" id="cal-conflito" role="status" hidden></div>
      <div class="acoes"><button type="submit" class="btn primary">${e("cal.marcarNoCalendario")}</button>
        <span class="leg">${e("cal.espacamento", { n: ent.espacamentoMin })}</span></div>
    </form>
  </section>`;
}

export function paginaCalendario(ent: EntradaCalendario): string {
  const { inicio, fim } = periodoDoCalendario(ent.visao, ent.ancora);
  const semana = ent.visao === "semana";
  const porDia = new Map<string, PublicacaoNoCalendario[]>();
  for (const p of ent.itens) {
    const d = ymdDeIso(p.agendadaPara);
    porDia.set(d, [...(porDia.get(d) ?? []), p]);
  }
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  const titulo = semana
    ? t("cal.tituloSemana", { inicio: diaMes(inicio), fim: t("tempo.diaMesAno", { d: fim.slice(8, 10), m: fim.slice(5, 7), y: fim.slice(0, 4) }) })
    : mesPorExtenso(ent.ancora, localeDe());
  const passo = semana ? 7 : 0;
  const antes = semana ? somarDias(ent.ancora, -passo) : somarDias(`${ent.ancora.slice(0, 7)}-01`, -1).slice(0, 7) + "-01";
  const depois = semana ? somarDias(ent.ancora, passo) : somarDias(`${ent.ancora.slice(0, 7)}-28`, 4).slice(0, 7) + "-01";
  const link = (visao: string, data: string) => `/calendario?visao=${visao}&amp;data=${data}`;
  const total = ent.itens.length;
  const grade = `<div class="cal ${semana ? "cal-semana" : "cal-mes"}">
    ${semana ? "" : `<div class="cal-cab" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map((d) => `<span>${escaparHtml(diaCurto(d))}</span>`).join("")}</div>`}
    <div class="cal-grade">${dias.map((d) => celulaDia(d, porDia.get(d) ?? [], ent, semana)).join("")}</div>
  </div>`;
  const conteudo = `
  <div class="cartao-cab" style="margin:0"><div><h2>${e("aba.calendario")}</h2>
    <p class="leg">${e("cal.fusoAviso")} ${escaparHtml(total === 0 ? t("cal.nadaMarcado") : tp("cal.marcadasNoPeriodo", total))}</p></div>
    <div class="acoes"><a class="btn outline" href="#marcar" data-acao="ir-marcar">${e("cal.marcar.botao")}</a></div></div>
  <section class="cartao" aria-label="${e("cal.ariaCalendario", { titulo })}">
    <div class="cal-barra">
      <div class="acoes">
        <a class="btn ghost pequeno" data-nav href="${link(ent.visao, antes)}" aria-label="${e(semana ? "cal.semanaAnterior" : "cal.mesAnterior")}">${e("cal.anterior")}</a>
        <a class="btn ghost pequeno" data-nav href="${link(ent.visao, ent.hoje)}">${e("cal.hoje")}</a>
        <a class="btn ghost pequeno" data-nav href="${link(ent.visao, depois)}" aria-label="${e(semana ? "cal.proximaSemana" : "cal.proximoMes")}">${e("cal.proximo")}</a>
      </div>
      <h3 class="cal-titulo" aria-live="polite">${escaparHtml(titulo)}</h3>
      <nav class="abas abas-2" aria-label="${e("cal.visao")}" style="--abas-n:2;--aba-i:${semana ? 1 : 0}">
        <span class="abas-indicador" aria-hidden="true"></span>
        <a data-nav href="${link("mes", ent.ancora)}"${semana ? "" : ' aria-current="page"'}>${e("cal.mes")}</a>
        <a data-nav href="${link("semana", ent.ancora)}"${semana ? ' aria-current="page"' : ""}>${e("cal.semana")}</a>
      </nav>
    </div>
    ${grade}
    ${total === 0 ? `<p class="leg" style="margin-top:12px">${e("cal.paraMarcar")}</p>` : ""}
  </section>
  <div id="detalhes-pub" aria-live="polite">${ent.itens.map(detalhePub).join("")}</div>
  ${formularioMarcar(ent)}`;
  return casca({ aba: "calendario", titulo: nomeDaAba("calendario"), conteudo, contadores: ent.contadores ?? SEM_CONTADORES, atualizarACada: 15000 });
}

// ---------------------------------------------------------------- Publicações

export interface VideoComPublicacoes {
  id: number;
  nome: string;
  estado: string;
  publicacoes: Publicacao[];
}

function celulaPub(videoId: number, rede: Rede, p: Publicacao | undefined): string {
  const nome = NOMES_REDE[rede];
  if (!p) {
    return `<div class="rede-cel" data-rede="${rede}"><h4>${nome}</h4><span class="selo">${e("pub.naoAgendado")}</span>
      <a class="btn outline pequeno" data-nav href="/calendario?video=${videoId}#marcar">${e("pub.agendar")}</a></div>`;
  }
  const linhas: string[] = [];
  const acoes: string[] = [];
  switch (p.estado) {
    case "agendada":
      if (p.tentativas > 0 && p.proximaTentativaEm) {
        linhas.push(`<span class="selo espera">${e("pub.esperandoNova")}</span>`);
        linhas.push(`<span class="leg">${escaparHtml(t("pub.tentativa", { n: p.tentativas, max: MAXIMO_TENTATIVAS_PUBLICACAO, proxima: formatarBrasilia(p.proximaTentativaEm) }))}</span>`);
      } else if (p.proximaTentativaEm) {
        linhas.push(`<span class="selo espera">${e("pub.adiada")}</span>`);
        linhas.push(`<span class="leg">${escaparHtml(t("pub.voltaEm", { quando: formatarBrasilia(p.proximaTentativaEm) }))}</span>`);
      } else {
        linhas.push(conferenciaRetida(p) ? `<span class="selo erro">${e("conf.chip")}</span>` : seloPub("agendada"));
        linhas.push(`<span class="leg">${escaparHtml(t("pub.marcadaPara", { quando: formatarBrasilia(p.agendadaPara) }))}</span>`);
      }
      if (p.erro) linhas.push(`<span class="leg">${e("pub.motivo", { erro: p.erro })}</span>`);
      acoes.push(`<button type="button" class="btn primary pequeno" data-acao="publicar-agora" data-pub="${p.id}">${e("pub.publicarAgora")}</button>`);
      break;
    case "publicando":
      linhas.push(seloPub("publicando"));
      linhas.push(`<span class="leg">${e("pub.enviando", { rede: nome })}</span>`);
      break;
    case "verificar":
      linhas.push(seloPub("verificar"));
      linhas.push(`<span class="leg">${e("pub.verificando")}</span>`);
      break;
    case "publicada":
      linhas.push(seloPub("publicada"));
      linhas.push(`<span class="leg">${escaparHtml(formatarBrasilia(p.publicadaEm ?? p.agendadaPara))}</span>`);
      if (p.simulado) linhas.push(`<span class="selo">${e("pub.modoSeco")}</span>`);
      break;
    case "falhou":
      linhas.push(seloPub("falhou"));
      linhas.push(`<span class="leg">${escaparHtml(p.erro ?? t("pub.semMotivo"))}</span>`);
      acoes.push(`<button type="button" class="btn outline pequeno" data-acao="tentar-de-novo" data-video="${videoId}" data-rede="${rede}" data-visibilidade="${p.visibilidade}">${e("pub.tentarDeNovo")}</button>`);
      break;
    case "cancelada":
      linhas.push(seloPub("cancelada"));
      acoes.push(`<a class="btn outline pequeno" data-nav href="/calendario?video=${videoId}#marcar">${e("cal.marcarDeNovo")}</a>`);
      break;
  }
  return `<div class="rede-cel" data-rede="${rede}" data-estado="${p.estado}"><h4>${nome}</h4>${linhas.join("")}<div class="acoes">${acoes.join("")}</div></div>`;
}

export function paginaPublicacoes(videos: VideoComPublicacoes[], contadores: Contadores = SEM_CONTADORES, emAndamento = false): string {
  const todas = videos.flatMap((v) => v.publicacoes);
  const cont = (e: EstadoPublicacao) => todas.filter((p) => p.estado === e).length;
  const resumo = `<div class="motivos">
    <div class="caixa"><div class="num">${cont("agendada")}</div><div class="leg">${e("pub.resumo.agendadas")}</div></div>
    <div class="caixa"><div class="num">${cont("publicada")}</div><div class="leg">${e("pub.resumo.publicadas")}</div></div>
    <div class="caixa"><div class="num">${cont("falhou")}</div><div class="leg">${e("pub.resumo.falharam")}</div></div>
    <div class="caixa"><div class="num">${cont("publicando") + cont("verificar")}</div><div class="leg">${e("pub.resumo.andamento")}</div></div>
  </div>`;
  const lista =
    videos.length === 0
      ? `<div class="cartao vazio"><span class="grande">${e("pub.vazio.titulo")}</span>
          <p class="leg">${e("pub.vazio.texto")}</p>
          <div class="acoes"><a class="btn primary" href="/fila" data-nav>${e("acao.irParaFila")}</a></div></div>`
      : videos
          .map(
            (v) => `<article class="cartao" data-card data-id="${v.id}">
        <div class="cartao-cab"><div><h3>${escaparHtml(v.nome)}</h3><span class="leg">${e("pub.videoNumero", { id: v.id })}</span></div></div>
        <div class="redes-lado">${contextoTela().redesAtivas.map((r) => celulaPub(v.id, r, v.publicacoes.find((p) => p.rede === r))).join("")}</div>
        ${v.publicacoes.map((p) => blocoConferencia(p)).join("")}
      </article>`,
          )
          .join("");
  const conteudo = `
  <div class="cartao-cab" style="margin:0"><div><h2>${e("aba.publicacoes")}</h2>
    <p class="leg">${e("pub.subtitulo")}</p></div>
    <div class="acoes"><button type="button" class="btn ghost" data-acao="processar">${e("pub.processar")}</button></div></div>
  ${blocoAlertasEstoque(contextoTela().alertas)}
  <section class="cartao" data-viva="sempre" data-viva-id="resumo-pub">${resumo}</section>
  ${lista}`;
  return casca({ aba: "publicacoes", titulo: nomeDaAba("publicacoes"), conteudo, contadores, atualizarACada: emAndamento || cont("agendada") > 0 ? 5000 : 15000 });
}

export { paginaContas, paginaProntidao } from "./paginas-conectores.js";

export { icone };
