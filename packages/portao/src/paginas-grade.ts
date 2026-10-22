// Tela da grade de publicação: dias e horários por rede, chave de ligar/desligar e a PREVISÃO de quando cada
// vídeo aprovado sairia, antes de confirmar. As regras (vagas, espaçamento, limite diário) são do núcleo
// (plano.ts / agendador-plano.ts): esta tela só pergunta e mostra. Nada aqui calcula horário.
import { NOMES_REDE, REDES, type Grade, type Plano, type Previsao, type Rede } from "@gerador/core";
import { escaparHtml } from "./html.js";
import { t, tp, type Chave } from "./idioma/index.js";
import { chave, grupo, linha } from "./linhas.js";
import { casca, e, nomeDaAba, SEM_CONTADORES, type Contadores } from "./paginas.js";
import { diaCurto, formatarBrasilia } from "./tempo.js";

/** Segunda a domingo: a ordem em que se lê a semana no Brasil. Os números são os do núcleo (0 = domingo). */
const DIAS_NA_ORDEM = [1, 2, 3, 4, 5, 6, 0] as const;
const GRADE_NOVA: Grade = { dias: [], horarios: [""], redes: [] };

function campoHora(h: string): string {
  return `<span class="hora-item"><input class="campo hora-campo" type="time" value="${escaparHtml(h)}" aria-label="${e("grade.hora")}" /><button type="button" class="btn ghost pequeno" data-acao="grade-remover-hora" aria-label="${e("grade.removerHora")}" title="${e("grade.removerHora")}">&times;</button></span>`;
}

/** Um bloco da grade. `n` só dá o título; o navegador renumera ao adicionar ou tirar. */
function blocoDaGrade(g: Grade, n: number): string {
  const dias = DIAS_NA_ORDEM.map(
    (d) => `<label class="pilula"><input type="checkbox" name="dia" value="${d}"${g.dias.includes(d) ? " checked" : ""} /><span>${escaparHtml(diaCurto(d))}</span></label>`,
  ).join("");
  const redes = REDES.map(
    (r) => `<label class="pilula"><input type="checkbox" name="rede" value="${r}"${g.redes.includes(r) ? " checked" : ""} /><span>${escaparHtml(NOMES_REDE[r])}</span></label>`,
  ).join("");
  const horas = (g.horarios.length > 0 ? g.horarios : [""]).map(campoHora).join("");
  return `<fieldset class="bloco-grade" data-bloco>
    <legend><span data-bloco-titulo>${e("grade.bloco", { n })}</span></legend>
    <div class="grupo"><span class="rotulo">${e("grade.dias")}</span><div class="opcoes" role="group" aria-label="${e("grade.dias")}">${dias}</div></div>
    <div class="grupo"><span class="rotulo">${e("grade.horarios")}</span><div class="opcoes horas" data-horas>${horas}<button type="button" class="btn outline pequeno" data-acao="grade-add-hora">${e("grade.addHora")}</button></div><span class="linha-ajuda">${e("grade.horariosAjuda")}</span></div>
    <div class="grupo"><span class="rotulo">${e("grade.redes")}</span><div class="opcoes" role="group" aria-label="${e("grade.redes")}">${redes}</div></div>
    <div class="acoes"><button type="button" class="btn ghost perigo pequeno" data-acao="grade-remover-bloco">${e("grade.removerBloco")}</button></div>
  </fieldset>`;
}

const FORA_QUE_NAO_INTERESSA = new Set(["ja_agendada", "ja_publicada", "nao_aprovado"]);

/** A lista de "quando cada vídeo sairia". Vem do `preverEncaixe` do núcleo; aqui só se escreve. */
export function blocoPrevisao(prev: Previsao, nomes: ReadonlyMap<number, string>, opcoes: { planoLigado: boolean; temBlocos: boolean }): string {
  const nome = (id: number): string => nomes.get(id) ?? t("pub.videoN", { id });
  if (!opcoes.temBlocos) return `<div class="aviso info">${e("grade.previsao.semBlocos")}</div>`;
  const porVideo = new Map<number, Previsao["itens"]>();
  for (const it of prev.itens) porVideo.set(it.videoId, [...(porVideo.get(it.videoId) ?? []), it]);
  const linhasDeVideo = [...porVideo.entries()].map(
    ([id, itens]) => `<div class="linha previsao-linha" data-previsao-video="${id}">
      <div class="linha-cab"><span class="linha-rotulo">${escaparHtml(nome(id))}</span><span class="leg">${e("pub.videoNumero", { id })}</span></div>
      <ul class="previsao-itens">${itens
        .map((it) => `<li><strong>${escaparHtml(NOMES_REDE[it.rede])}</strong> <span data-previsao-quando="${escaparHtml(it.horario.iso)}">${escaparHtml(formatarBrasilia(it.horario.iso))}</span></li>`)
        .join("")}</ul>
    </div>`,
  );
  // Agrupa por rede e motivo: com 30 vídeos a mesma frase não pode se repetir 30 vezes.
  const agrupar = (lista: { videoId: number; rede: Rede; motivo: string }[]): string[] => {
    const grupos = new Map<string, { rede: Rede; motivo: string; videos: Set<number> }>();
    for (const x of lista) {
      const k = `${x.rede}|${x.motivo}`;
      const g = grupos.get(k) ?? { rede: x.rede, motivo: x.motivo, videos: new Set<number>() };
      g.videos.add(x.videoId);
      grupos.set(k, g);
    }
    return [...grupos.values()].map(
      (g) => `<li>${escaparHtml(tp("grade.grupoMotivo", g.videos.size, { rede: NOMES_REDE[g.rede], motivo: t(`aprovar.motivo.${g.motivo}` as Chave) }))}</li>`,
    );
  };
  const semVaga = agrupar(prev.semVaga);
  const fora = agrupar(prev.fora.filter((f) => !FORA_QUE_NAO_INTERESSA.has(f.motivo)));
  const n = prev.itens.length;
  const aviso = !opcoes.planoLigado ? `<div class="aviso info">${e("grade.previsao.desligada")}</div>` : "";
  const vazio = n === 0 ? `<div class="linha"><p class="linha-valor">${e("grade.previsao.vazio")}</p></div>` : "";
  return `${aviso}
    <div class="config-linhas" data-previsao-lista>${linhasDeVideo.join("")}${vazio}</div>
    ${semVaga.length > 0 ? `<div class="aviso info"><ul class="lista-simples">${semVaga.join("")}</ul></div>` : ""}
    ${fora.length > 0 ? `<div class="aviso info"><p class="rotulo">${e("grade.foraTitulo")}</p><ul class="lista-simples">${fora.join("")}</ul></div>` : ""}
    ${n > 0 ? `<p class="linha-valor" data-previsao-total>${escaparHtml(tp("grade.previsao.total", n))}</p>
    <div class="acoes"><button type="button" class="btn primary" data-acao="plano-confirmar">${escaparHtml(tp("grade.previsao.confirmar", n))}</button></div>
    <p class="linha-ajuda">${e("grade.previsao.confirmarAjuda")}</p>` : ""}`;
}

export function paginaGrade(plano: Plano, previsaoHtml: string, contadores: Contadores = SEM_CONTADORES): string {
  const blocos = plano.grades.length > 0 ? plano.grades : [];
  const modelo = `<template id="modelo-bloco">${blocoDaGrade(GRADE_NOVA, 0)}</template><template id="modelo-hora">${campoHora("")}</template>`;
  const conteudo = `
  <div class="config-pagina grade-pagina">
  <div class="g-titulo"><h2>${e("aba.grade")}</h2><p class="leg">${e("grade.subtitulo")}</p></div>

  ${grupo(e("grade.grupoLigar"), [
    linha({
      rotulo: t("grade.usar"),
      ajuda: t(plano.ativo ? "grade.ligadaTexto" : "grade.desligadaTexto"),
      cab: chave({ ligado: plano.ativo, rotulo: t("grade.usar"), attrs: 'data-acao="plano-alternar" id="plano-chave"' }),
      campo: "",
    }),
  ], { classe: "g-ligar" })}

  <form id="form-grade" class="g-blocos" autocomplete="off">
  ${grupo(e("grade.grupoBlocos"), [
    `<div class="linha" id="grade-blocos">${blocos.map((g, i) => blocoDaGrade(g, i + 1)).join("")}<p class="linha-valor" data-sem-blocos${blocos.length > 0 ? " hidden" : ""}>${e("grade.semBlocos")}</p></div>`,
    `<div class="linha"><div class="acoes"><button type="button" class="btn outline" data-acao="grade-add-bloco">${e("grade.addBloco")}</button></div><p class="linha-ajuda">${e("grade.fusoAjuda")}</p></div>`,
  ], { id: "grade-grupo", extra: `<div class="config-pe"><button type="submit" class="btn primary">${e("grade.salvar")}</button><button type="button" class="btn outline" data-acao="plano-previsao">${e("grade.previsao.atualizar")}</button></div>` })}
  </form>

  ${grupo(e("grade.previsao.titulo"), [
    `<div class="linha"><p class="linha-ajuda">${e("grade.previsao.intro")}</p>
      <div class="grupo"><label for="grade-tiktok">${e("grade.tiktok")}</label>
      <select class="campo" id="grade-tiktok" name="tiktok"><option value="">${e("grade.tiktok.nenhuma")}</option><option value="publica">${e("grade.tiktok.publica")}</option><option value="privada">${e("grade.tiktok.privada")}</option></select>
      <span class="linha-ajuda">${e("grade.tiktokAjuda")}</span></div></div>`,
    `<div class="linha" id="grade-previsao" role="region" aria-live="polite" aria-label="${e("grade.previsao.titulo")}">${previsaoHtml}</div>`,
  ], { id: "grade-previsao-grupo", classe: "g-previsao" })}
  ${modelo}
  </div>`;
  return casca({ aba: "grade", titulo: nomeDaAba("grade"), conteudo, contadores, atualizarACada: 0 });
}

export type { Rede };
