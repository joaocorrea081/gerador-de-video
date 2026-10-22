// Telas de publicação: Calendário, Publicações, Contas e Prontidão.
// Hora em Brasília na tela (tempo.ts); o servidor continua em UTC. Segredo nunca entra aqui:
// as funções recebem só a visão pública da conta (ContaRede), que não tem token.
import {
  ESCOPOS_EXIGIDOS,
  LIMITE_LEGENDA,
  MAXIMO_TENTATIVAS_PUBLICACAO,
  NOMES_REDE,
  REDES,
  type ContaRede,
  type EstadoPublicacao,
  type Publicacao,
  type PublicacaoNoCalendario,
  type Rede,
} from "@gerador/core";
import { casca, e, icone, nomeDaAba, SEM_CONTADORES, type Contadores } from "./paginas.js";
import { escaparHtml } from "./html.js";
import { grupo, linha } from "./linhas.js";
import { localeDe, t, tp, type Chave } from "./idioma/index.js";
import type { ProntidaoRede } from "./publicacao/prontidao.js";
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

function chip(p: PublicacaoNoCalendario, semana: boolean): string {
  const tom = p.estado === "publicada" ? "ok" : p.estado === "falhou" ? "erro" : p.estado === "publicando" || p.estado === "verificar" ? "espera" : p.estado === "cancelada" ? "apagada" : "";
  const titulo = p.videoTitulo ?? t("pub.videoN", { id: p.videoId });
  return `<button type="button" class="chip ${tom}" data-acao="abrir-pub" data-pub="${p.id}" aria-expanded="false" aria-controls="pub-${p.id}" title="${escaparHtml(`${NOMES_REDE[p.rede]} · ${rotuloEstadoPub(p.estado)} · ${titulo}`)}">
    <span class="chip-hora">${horaBrasilia(p.agendadaPara)}</span>
    <span class="chip-rede">${NOMES_REDE[p.rede]}</span>
    ${semana ? `<span class="chip-titulo">${escaparHtml(titulo)}</span>` : ""}
    <span class="chip-estado">${escaparHtml(rotuloEstadoPub(p.estado))}</span>
  </button>`;
}

function celulaDia(ymd: string, itens: PublicacaoNoCalendario[], ent: EntradaCalendario, semana: boolean): string {
  const classes = ["dia", ymd === ent.hoje ? "hoje" : "", !semana && ymd.slice(0, 7) !== ent.ancora.slice(0, 7) ? "fora" : ""].filter(Boolean).join(" ");
  const passado = ymd < ent.hoje;
  const nome = diaCurto(diaDaSemana(ymd));
  return `<div class="${classes}" role="group" aria-label="${escaparHtml(`${nome}, ${diaMes(ymd)}, ${tp("cal.publicacoes", itens.length)}`)}" data-dia-celula="${ymd}">
    <div class="dia-cab"><span class="dia-n">${semana ? `${nome} ` : ""}${ymd.slice(8, 10).replace(/^0/, "")}${semana ? `/${ymd.slice(5, 7)}` : ""}</span>
      <button type="button" class="btn ghost pequeno dia-mais" data-acao="marcar-dia" data-dia="${ymd}" aria-label="${e("cal.marcarEm", { dia: diaMes(ymd) })}"${passado ? " disabled" : ""}>+</button></div>
    <div class="dia-itens">${itens.map((p) => chip(p, semana)).join("")}</div>
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
  const redes = REDES.map((r) => {
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
      <label class="opcao-rede"><input type="checkbox" name="iaGerado" /> <span>${e("cal.iaGerado")}</span></label>
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
    <div class="acoes"><a class="btn primary" href="#marcar" data-acao="ir-marcar">${e("cal.marcar.botao")}</a></div></div>
  <section class="cartao" aria-label="${e("cal.ariaCalendario", { titulo })}">
    <div class="cal-barra">
      <div class="acoes">
        <a class="btn outline pequeno" data-nav href="${link(ent.visao, antes)}" aria-label="${e(semana ? "cal.semanaAnterior" : "cal.mesAnterior")}">${e("cal.anterior")}</a>
        <a class="btn outline pequeno" data-nav href="${link(ent.visao, ent.hoje)}">${e("cal.hoje")}</a>
        <a class="btn outline pequeno" data-nav href="${link(ent.visao, depois)}" aria-label="${e(semana ? "cal.proximaSemana" : "cal.proximoMes")}">${e("cal.proximo")}</a>
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
        linhas.push(seloPub("agendada"));
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
        <div class="redes-lado">${REDES.map((r) => celulaPub(v.id, r, v.publicacoes.find((p) => p.rede === r))).join("")}</div>
      </article>`,
          )
          .join("");
  const conteudo = `
  <div class="cartao-cab" style="margin:0"><div><h2>${e("aba.publicacoes")}</h2>
    <p class="leg">${e("pub.subtitulo")}</p></div>
    <div class="acoes"><button type="button" class="btn outline" data-acao="processar">${e("pub.processar")}</button></div></div>
  <section class="cartao" data-viva="sempre" data-viva-id="resumo-pub">${resumo}</section>
  ${lista}`;
  return casca({ aba: "publicacoes", titulo: nomeDaAba("publicacoes"), conteudo, contadores, atualizarACada: emAndamento || cont("agendada") > 0 ? 5000 : 15000 });
}

// --------------------------------------------------------------------- Contas

function linhaConta(c: ContaRede, agora: Date): string {
  const nome = NOMES_REDE[c.rede];
  const faltam = ESCOPOS_EXIGIDOS[c.rede].filter((x) => !c.escopos.includes(x));
  let token = `<span class="linha-valor fraco">${e("contas.semToken")}</span>`;
  if (c.conectada && c.tokenExpiraEm) {
    const ms = Date.parse(c.tokenExpiraEm) - agora.getTime();
    const selo = ms <= 0 ? `<span class="selo erro">${e("contas.expirado")}</span>` : ms < 24 * 3_600_000 ? `<span class="selo espera">${e("contas.expiraEmBreve")}</span>` : "";
    token = `<span class="linha-valor">${escaparHtml(formatarBrasilia(c.tokenExpiraEm))}</span> ${selo}`;
  }
  const real = c.modo === "real";
  const campoSegredo = (id: string, rotulo: string, ajuda: string, obrig: boolean) =>
    linha({ rotulo, para: id, ajuda, campo: `<input class="campo" id="${id}" name="${id.split("-")[1]}" type="password" autocomplete="off" spellcheck="false"${obrig ? " required" : ""} />` });
  const botoes = `<button type="button" class="btn ${c.conectada ? "outline" : "primary"} pequeno" data-abre="conectar" aria-pressed="false" aria-expanded="false">${e(c.conectada ? "contas.reconectar" : "contas.conectar")}</button>${
    c.conectada ? `<button type="button" class="btn outline pequeno" data-acao="renovar" data-rede="${c.rede}">${e("contas.renovar")}</button>` : ""}`;
  const linhas = [
    linha({
      rotulo: t("contas.conta"),
      ajuda: c.conectada && !real ? t("contas.seco.texto", { rede: nome }) : undefined,
      cab: botoes,
      campo: `<span class="linha-valor">${c.conectada ? escaparHtml(c.contaNome ?? c.contaId ?? "—") : "—"}</span>`,
    }),
    linha({ rotulo: t("contas.tokenExpira"), ajuda: t("contas.tokenAjuda"), campo: token }),
    ...(c.rede === "tiktok"
      ? [linha({ rotulo: t("contas.refreshExpira"), campo: `<span class="linha-valor">${c.refreshExpiraEm ? escaparHtml(formatarBrasilia(c.refreshExpiraEm)) : "—"}</span>` })]
      : []),
    linha({ rotulo: t(`contas.aprovacao.${c.rede}` as Chave), campo: `<span class="linha-valor">${e(c.aprovacaoPlataforma ? "contas.sim" : "contas.aindaNao")}</span>` }),
    ...(c.conectada && faltam.length > 0
      ? [`<div class="linha"><div class="aviso erro">${e("contas.faltamPermissoes", { lista: faltam.join(", ") })}</div></div>`]
      : []),
  ];
  const painel = `<div class="painel" data-painel="conectar" hidden style="margin-top:12px">
      <form class="form-conta" data-rede="${c.rede}" autocomplete="off" style="display:flex;flex-direction:column;gap:4px">
        <fieldset class="grupo" style="border:0;padding:0;margin:0"><legend class="rotulo">${e("contas.comoConectar")}</legend>
          <div class="opcoes">
            <label class="opcao-rede"><input type="radio" name="modo" value="real" checked /> <span>${e("contas.modoReal")}</span></label>
            <label class="opcao-rede"><input type="radio" name="modo" value="seco" /> <span>${e("contas.modoSeco")}</span></label>
          </div><span class="linha-ajuda">${e("contas.modoSecoAjuda")}</span></fieldset>
        <div data-so-real style="display:flex;flex-direction:column">
          ${linha({ rotulo: t(`contas.idConta.${c.rede}` as Chave), para: `${c.rede}-contaId`, campo: `<input class="campo" id="${c.rede}-contaId" name="contaId" type="text" autocomplete="off" />` })}
          ${linha({ rotulo: t("contas.nomeMostrar"), para: `${c.rede}-contaNome`, campo: `<input class="campo" id="${c.rede}-contaNome" name="contaNome" type="text" autocomplete="off" />` })}
          ${campoSegredo(`${c.rede}-accessToken`, t("contas.tokenAcesso"), t("contas.tokenAcessoAjuda"), true)}
          ${campoSegredo(`${c.rede}-refreshToken`, t(c.rede === "tiktok" ? "contas.refreshTiktok" : "contas.refreshSeHouver"), t("contas.refreshAjuda"), false)}
          ${linha({ rotulo: t("contas.tokenExpiraBr"), para: `${c.rede}-expiraEm`, campo: `<input class="campo" id="${c.rede}-expiraEm" name="expiraEm" type="datetime-local" />` })}
          ${linha({ rotulo: t("contas.refreshExpiraOpc"), para: `${c.rede}-refreshExpiraEm`, campo: `<input class="campo" id="${c.rede}-refreshExpiraEm" name="refreshExpiraEm" type="datetime-local" />` })}
          ${linha({ rotulo: t("contas.escopos"), para: `${c.rede}-escopos`, ajuda: t("contas.escoposAjuda"), campo: `<input class="campo" id="${c.rede}-escopos" name="escopos" type="text" value="${escaparHtml(ESCOPOS_EXIGIDOS[c.rede].join(", "))}" />` })}
        </div>
        <p class="linha-ajuda">${e("contas.tokensGuardados")}</p>
        <div class="acoes"><button type="submit" class="btn primary">${e("contas.salvarConexao")}</button><button type="button" class="btn ghost" data-acao="fechar">${e("acao.cancelar")}</button></div>
      </form>
    </div>`;
  const titulo = `${nome} ${c.conectada ? `<span class="selo ${real ? "ok" : "espera"}">${e(real ? "contas.conectada" : "contas.conectadaSeco")}</span>` : `<span class="selo erro">${e("contas.naoConectada")}</span>`}`;
  return grupo(titulo, linhas, { id: `conta-${c.rede}`, attrs: `data-card data-rede="${c.rede}"`, extra: painel });
}

export function paginaContas(contas: ContaRede[], agora: Date, contadores: Contadores = SEM_CONTADORES): string {
  const nenhuma = contas.every((c) => !c.conectada);
  const conteudo = `
  <div><h2>${e("aba.contas")}</h2><p class="leg">${e("contas.subtitulo")}</p></div>
  ${nenhuma ? `<div class="aviso info">${e("contas.nenhuma")}</div>` : ""}
  ${contas.map((c) => linhaConta(c, agora)).join("")}
  <p class="leg">${t("contas.rodape", { link: `<a href="/prontidao" data-nav>${e("aba.prontidao")}</a>` })}</p>`;
  return casca({ aba: "contas", titulo: nomeDaAba("contas"), conteudo, contadores, atualizarACada: 0 });
}

// ------------------------------------------------------------------ Prontidão

/** Prazos reais, do PUBLICACAO.md. Escritos sem enfeite (catálogo, chaves pront.prazo.*): o cliente não pode achar que está pronto. */
const PROVIDENCIAR = [1, 2, 3, 4, 5, 6];

export function paginaProntidao(
  redes: ProntidaoRede[],
  ia: { ok: boolean; falta?: string | undefined },
  contadores: Contadores = SEM_CONTADORES,
): string {
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
      <div><h3>${escaparHtml(r.nome)} ${estado}</h3>
        <p class="linha-ajuda">${faltam === 0 ? e("pront.todosCumpridos") : escaparHtml(tp("pront.itensFaltam", faltam))}</p></div></div>
      <ul class="checklist">${r.itens
        .map(
          (i) => `<li class="${i.ok ? "ok" : "falta"}"><span class="marca-item" aria-hidden="true">${i.ok ? "✓" : "✗"}</span>
          <div><span>${escaparHtml(i.descricao)}</span><span class="sr-only"> ${e(i.ok ? "pront.srOk" : "pront.srFalta")}</span>${i.ok || !i.falta ? "" : `<div class="leg">${escaparHtml(i.falta)}</div>`}</div></li>`,
        )
        .join("")}</ul>
      <div class="aviso info"><strong>${e("pront.prazoReal")}</strong> ${e(`pront.prazo.${r.rede}` as Chave)}</div>
      <p class="linha-ajuda" style="margin-top:8px">${escaparHtml(uso)}</p>
    </section>`;
  };
  const conteudo = `
  <div><h2>${e("aba.prontidao")}</h2><p class="leg">${e("pront.subtitulo")}</p></div>
  ${faixa}
  ${redes.map(cartao).join("")}
  <section class="cartao">
    <h3 style="margin-bottom:8px">${e("pront.legendaIa")}</h3>
    <p>${ia.ok ? `<span class="selo ok">${e("ajustes.ia.presente")}</span>` : `<span class="selo erro">${e("ajustes.ia.ausente")}</span>`}</p>
    ${ia.ok ? "" : `<p class="leg" style="margin-top:8px">${e("pront.semChave")} <a href="/configuracoes" data-nav>${e("redes.abrirAjustes")}</a></p>`}
    <p class="leg" style="margin-top:8px">${e("pront.limiteLegenda", { lista: REDES.map((r) => `${NOMES_REDE[r]} ${LIMITE_LEGENDA[r]}`).join(", ") })}</p>
  </section>
  <section class="cartao">
    <h3 style="margin-bottom:8px">${e("pront.providenciar.titulo")}</h3>
    <p class="leg" style="margin-bottom:8px">${e("pront.providenciar.texto")}</p>
    <ul class="lista-simples">${PROVIDENCIAR.map((n) => `<li>${e(`pront.prov.${n}` as Chave)}</li>`).join("")}</ul>
  </section>`;
  return casca({ aba: "prontidao", titulo: nomeDaAba("prontidao"), conteudo, contadores, atualizarACada: 0 });
}

export { icone };
