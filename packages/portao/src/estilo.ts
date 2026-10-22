// CSS do painel. Idioma visual medido em tema/PADRAO.md.
// Regra: nenhuma cor escrita aqui. Tudo vem dos tokens --dsw-alias-* (tema/).
// Os valores de tamanho (36px, 0.5px, 180ms) são os medidos no código do Harness.

export const ESTILO = `
* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
  font-size: 14px;
  line-height: 22px;
}

[hidden] { display: none !important; }
a:not(.btn) { color: var(--dsw-alias-link); }
h1, h2, h3, h4, p { margin: 0; }
h2 { font-size: 18px; line-height: 26px; font-weight: 600; }
h3 { font-size: 14px; line-height: 22px; font-weight: 600; }
.leg { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.fraco { color: var(--dsw-alias-label-caption); }

/* ---------- topo e abas (SegmentedTabs) ---------- */
.marca { font-size: 18px; line-height: 24px; font-weight: 600; letter-spacing: 0.04em; white-space: nowrap; }

.abas {
  position: relative;
  display: grid; grid-template-columns: repeat(var(--abas-n, 2), 1fr);
  padding: 4px;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-module-platform);
  width: min(240px, 100%);
}
.abas-indicador {
  position: absolute; inset: 4px auto 4px 4px;
  width: calc((100% - 8px) / var(--abas-n, 2));
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3);
  transform: translateX(calc(var(--aba-i, 0) * 100%));
  transition: transform 180ms ease;
}
.abas a {
  position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  height: 34px; font-size: 14px; line-height: 20px;
  color: var(--dsw-alias-label-secondary);
  text-decoration: none; outline: none;
  border-radius: var(--dsw-radius-md);
  transition: color 180ms ease;
}
.abas a[aria-current="page"] { color: var(--dsw-alias-label-primary); font-weight: 600; }
.abas a:hover { color: var(--dsw-alias-label-primary); }
.abas a:focus-visible { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; }
.contagem {
  min-width: 18px; padding: 0 5px; border-radius: 999px;
  font-size: 12px; line-height: 18px; font-weight: 600; text-align: center;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l3);
}
.contagem.forte { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); box-shadow: none; }
.contagem.erro { background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary-foreground); box-shadow: none; }
.contagem[hidden] { display: none; }

/* ---------- casca: barra lateral fixa + coluna de conteúdo ---------- */
.app { display: flex; min-height: 100vh; }
.coluna { flex: 1; min-width: 0; display: flex; flex-direction: column; }
main { width: 100%; max-width: 1840px; margin: 0 auto; padding: 8px clamp(20px, 3vw, 56px) 40px; display: flex; flex-direction: column; gap: 24px; outline: none; }

/* telas feitas de cartões aproveitam a largura: os cartões formam colunas, o resto (títulos, avisos) ocupa a linha toda */
main[data-aba="contas"], main[data-aba="prontidao"],
main[data-aba="publicacoes"] {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 560px), 1fr)); gap: 24px; align-items: start;
}
main[data-aba="contas"] > :not(.cartao):not(.config-grupo), main[data-aba="prontidao"] > :not(.cartao):not(.config-grupo),
main[data-aba="publicacoes"] > :not(.cartao) { grid-column: 1 / -1; }
main[data-aba="publicacoes"] > .cartao[data-viva] { grid-column: 1 / -1; }
.pular {
  position: absolute; left: 8px; top: -120px; z-index: 40;
  padding: 8px 12px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3); box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary); transition: top 180ms ease;
}
.pular:focus { top: 8px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.lateral {
  position: sticky; top: 0; align-self: flex-start;
  width: 248px; flex: none; height: 100vh;
  display: flex; flex-direction: column; gap: 0;
  padding: 6px 12px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0.5px 0 0 0 var(--dsw-alias-border-l3);
  transition: width 180ms ease, transform 180ms ease;
  overflow-y: auto; overflow-x: hidden;
}
.lateral-topo { display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 60px; padding: 8px 0 8px 4px; margin-bottom: 4px; flex: none; }
.icone-btn { padding: 0; width: 36px; flex: none; }
.lateral .icone-btn { width: 28px; height: 28px; border-radius: var(--dsw-radius-sm); }
.icone { flex: none; }
.nav { display: flex; flex-direction: column; gap: 4px; flex: 1; margin-bottom: 8px; }
.nav-grupo { display: flex; flex-direction: column; gap: 4px; }
.nav-grupo + .nav-grupo { margin-top: 8px; }
.nav-titulo { padding: 0 10px; font-size: 11px; line-height: 18px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dsw-alias-label-caption); }
.nav a, .lateral-pe a {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  min-height: 36px; padding: 7px 8px; margin: 0 2px; line-height: 22px;
  border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-secondary); text-decoration: none; justify-content: flex-start;
  transition: background-color 180ms ease, color 180ms ease;
}
/* hover e selecionado têm o MESMO fundo (como no Harness): o selecionado não usa cor de destaque */
.nav a:hover, .lateral-pe a:hover, .nav a[aria-current="page"], .lateral-pe a[aria-current="page"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.nav a[aria-current="page"], .lateral-pe a[aria-current="page"] { font-weight: 600; }
.nav a:focus-visible, .lateral-pe a:focus-visible { outline-offset: -2px; }
.lateral-pe { flex: none; padding: 8px 0 6px; box-shadow: 0 -0.5px 0 0 var(--dsw-alias-border-l2); }
.nav-rotulo { flex: 1; text-align: left; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-contagens { display: flex; gap: 4px; }
.barra-topo { display: flex; align-items: center; gap: 8px; padding: 10px clamp(20px, 3vw, 56px) 0; }
.barra-topo #alternar-tema { margin-left: auto; color: var(--dsw-alias-label-secondary); }
.barra-topo #alternar-tema:hover { color: var(--dsw-alias-label-primary); }
.so-estreita { display: none; }
.icone-sol { display: none; }
body[data-ds-dark-theme] .icone-sol { display: block; }
body[data-ds-dark-theme] .icone-lua { display: none; }
.lateral-veu { position: fixed; inset: 0; z-index: 14; background: color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 45%, transparent); }
.lateral-veu[hidden] { display: none; }

/* recolhida (só em tela larga): ícones e bolinha */
@media (min-width: 900px) {
  body[data-lateral="recolhida"] .lateral { width: 56px; padding: 18px 10px 6px; gap: 12px; }
  body[data-lateral="recolhida"] .lateral .marca,
  body[data-lateral="recolhida"] .lateral .nav-rotulo,
  body[data-lateral="recolhida"] .lateral .nav-titulo { display: none; }
  body[data-lateral="recolhida"] .lateral-topo { justify-content: center; padding: 0; height: auto; margin: 0; }
  body[data-lateral="recolhida"] .lateral .icone-btn { width: 36px; height: 36px; border-radius: var(--dsw-radius-md); }
  body[data-lateral="recolhida"] #recolher svg { transform: rotate(180deg); }
  body[data-lateral="recolhida"] .nav a, body[data-lateral="recolhida"] .lateral-pe a { justify-content: center; padding: 0; margin: 0; width: 36px; min-height: 36px; }
  body[data-lateral="recolhida"] .lateral-pe .nav-rotulo { display: none; }
  body[data-lateral="recolhida"] .nav-contagens { position: absolute; top: 2px; right: 2px; }
  body[data-lateral="recolhida"] .nav-contagens .contagem:not(:first-child) { display: none; }
  body[data-lateral="recolhida"] .contagem { min-width: 16px; font-size: 11px; line-height: 16px; padding: 0 4px; }
}

/* estreita: vira gaveta */
@media (max-width: 899px) {
  .so-estreita { display: inline-flex; }
  .barra-topo { position: sticky; top: 0; z-index: 12; padding: 8px 12px; background: var(--dsw-alias-bg-base); box-shadow: 0 0.5px 0 0 var(--dsw-alias-border-l3); }
  .lateral {
    position: fixed; left: 0; top: 0; z-index: 15; width: min(300px, 86vw);
    transform: translateX(-100%); box-shadow: var(--dsw-elevation-prominent);
  }
  body[data-gaveta="aberta"] .lateral { transform: translateX(0); }
  #recolher { display: none; }
}

/* ---------- botões: 36px / 28px, borda 0.5px ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  height: 36px; padding: 0 14px;
  border: none; border-radius: var(--dsw-radius-md);
  font-family: inherit; font-size: 14px; line-height: 22px; font-weight: 500;
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: background-color 180ms ease, opacity 180ms ease;
}
.btn.pequeno { height: 28px; padding: 0 10px; border-radius: var(--dsw-radius-sm); font-size: 12px; line-height: 18px; }
.btn.primary { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); }
.btn.primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.btn.ghost:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.btn.ghost:active:not(:disabled) { background: var(--dsw-alias-interactive-bg-active); }
.btn.outline { border: 0.5px solid var(--dsw-alias-border-l3); }
.btn.outline:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.btn.perigo { color: var(--dsw-alias-state-error-primary); }
.btn.perigo:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger); }
.btn[aria-pressed="true"] { background: var(--dsw-alias-interactive-bg-active); border-color: var(--dsw-alias-border-l4); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.ocupado::before {
  content: ""; width: 12px; height: 12px; border-radius: 50%;
  border: 1.5px solid currentColor; border-right-color: transparent;
  animation: girar 800ms linear infinite;
}
@keyframes girar { to { transform: rotate(360deg); } }
.btn:focus-visible, .campo:focus-visible { outline-offset: 2px; }

/* ---------- cartão (elevação de traço fino) ---------- */
.cartao {
  background: var(--dsw-alias-bg-layer-1);
  border-radius: var(--dsw-radius-lg);
  box-shadow: var(--dsw-elevation-panel);
  padding: 24px;
}
.cartao-cab { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }

/* ---------- progresso da fila ---------- */
.progresso { display: flex; flex-direction: column; gap: 10px; }
.progresso-linha { display: flex; gap: 24px; flex-wrap: wrap; align-items: baseline; }
.num { font-size: 22px; line-height: 28px; font-weight: 600; }
.progresso-linha .item { display: flex; flex-direction: column; }
.barra { height: 6px; border-radius: 999px; background: var(--dsw-alias-bg-module-platform); overflow: hidden; }
.barra > span {
  display: block; height: 100%; border-radius: 999px;
  background: var(--dsw-alias-button-primary-fill);
  transition: width 180ms ease;
}

/* ---------- vídeo da fila ---------- */
.video { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 24px; }
.video-player video, .semvideo {
  width: 100%; aspect-ratio: 9 / 16; max-height: 560px; object-fit: contain; display: block;
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-module-platform);
}
.semvideo { display: flex; align-items: center; justify-content: center; text-align: center; padding: 12px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.video-info { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ficha { display: flex; gap: 6px; flex-wrap: wrap; }
.ficha span {
  padding: 0 10px; border-radius: 999px; font-size: 13px; line-height: 24px;
  border: 0.5px solid var(--dsw-alias-border-l3);
}
.ficha .preco { font-weight: 600; }
.anuncio { padding: 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); }
.anuncio .titulo { font-weight: 600; }
.anuncio .corpo { margin-top: 4px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; }
.escolhas { font-size: 13px; color: var(--dsw-alias-label-secondary); }

/* ---------- Fila: vídeo grande à esquerda, tudo o mais empilhado na ordem em que se decide ---------- */
.lista-fila { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 600px), 1fr)); gap: 24px; align-items: start; }
.fila-cartao { display: grid; grid-template-columns: 208px minmax(0, 1fr); grid-template-areas: "id id" "midia corpo"; gap: 20px 24px; padding: 24px; border-radius: var(--dsw-radius-xl); }
.fila-cartao > .fila-id { grid-area: id; }
.fila-cartao > .fila-midia { grid-area: midia; }
.fila-cartao > .fila-corpo { grid-area: corpo; }
.fila-midia { position: sticky; top: 16px; align-self: start; display: flex; flex-direction: column; gap: 8px; }
.fila-midia video, .fila-midia .semvideo {
  width: 100%; height: 370px; aspect-ratio: 9 / 16; object-fit: contain; display: block;
  border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform);
  box-shadow: var(--dsw-elevation-stroke);
}
.fila-corpo { display: flex; flex-direction: column; gap: 18px; min-width: 0; max-width: 760px; }
.fila-corpo .anuncio .corpo, .fila-corpo .escolhas { max-width: 75ch; }
.fila-id { display: flex; flex-direction: column; gap: 8px; }
.fila-id-topo { display: flex; align-items: center; gap: 10px; }
.fila-nome { font-size: 22px; line-height: 32px; font-weight: 600; overflow-wrap: anywhere; }
.fila-preco { font-size: 20px; line-height: 28px; font-weight: 600; }
.fila-secao { display: flex; flex-direction: column; gap: 12px; padding-top: 16px; box-shadow: 0 -0.5px 0 0 var(--dsw-alias-border-l3); }
.fila-secao-texto { padding-top: 0; box-shadow: none; }
.fila-secao-acoes { gap: 16px; }
.fila-acoes { display: flex; flex-wrap: wrap; gap: 14px 28px; align-items: flex-end; justify-content: flex-start; }
.acoes-grupo { display: flex; flex-direction: column; gap: 6px; }
.acoes-rotulo { font-size: 11px; line-height: 18px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--dsw-alias-label-caption); }
.acoes-decisao { padding: 10px 12px 12px; border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-bg-module-platform); }
.trabalho-estado { gap: 8px; }
.trabalho-estado p { margin: 0; }
.barra.indeterminada > span { width: 35%; animation: deslizar 1400ms ease-in-out infinite alternate; }
@keyframes deslizar { from { transform: translateX(0); } to { transform: translateX(185%); } }
.fila-cartao.trabalhando .video-player { opacity: 0.85; }
.trabalho-acao { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.trabalho-acao::before { content: ""; width: 12px; height: 12px; flex: none; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: girar 800ms linear infinite; }
tr.trabalhando { opacity: 0.7; }
.redes-compacto { gap: 8px; }
.detalhes summary {
  display: inline-flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; user-select: none;
  padding: 0 10px; border-radius: 999px; font-size: 12px; line-height: 22px; font-weight: 500; white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
  box-shadow: 0 0 0 0.5px var(--dsw-alias-border-l3);
  transition: background-color 180ms ease;
}
.detalhes summary::-webkit-details-marker { display: none; }
.detalhes summary::after { content: ""; width: 5px; height: 5px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: translateY(-1px) rotate(45deg); transition: transform 180ms ease; }
.detalhes[open] summary::after { transform: translateY(1px) rotate(-135deg); }
.detalhes summary:hover { background: var(--dsw-alias-interactive-bg-hover); }
.detalhes.com-erro summary { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); color: var(--dsw-alias-state-error-primary); box-shadow: none; }
.detalhes summary:focus-visible { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 1px; outline: none; }
.detalhes-corpo { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }

.acoes { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.acoes .sep { width: 0.5px; align-self: stretch; background: var(--dsw-alias-border-l3); margin: 4px 2px; }
.painel {
  padding: 12px; border-radius: var(--dsw-radius-md);
  box-shadow: var(--dsw-elevation-stroke);
  display: flex; flex-direction: column; gap: 12px;
}
.painel[hidden] { display: none; }
.painel .acoes { margin-top: 2px; }
.grupo { display: flex; flex-direction: column; gap: 6px; }
.grupo > label, .rotulo { font-size: 13px; font-weight: 600; }
.opcoes { display: flex; gap: 6px; flex-wrap: wrap; }

.campo {
  width: 100%; min-height: 36px; padding: 6px 12px;
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 14px; line-height: 22px;
}
textarea.campo { resize: vertical; min-height: 96px; }
.contador { font-size: 12px; color: var(--dsw-alias-label-caption); text-align: right; }
.contador.estouro { color: var(--dsw-alias-state-error-primary); }

.ordem { display: flex; flex-direction: column; gap: 4px; }
.ordem-item { display: flex; align-items: center; gap: 8px; }
.ordem-item .n { min-width: 70px; }

/* ---------- selos ---------- */
.selo {
  display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 999px;
  font-size: 12px; line-height: 22px; font-weight: 500; white-space: nowrap;
  background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary);
}
.selo.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color: var(--dsw-alias-state-success-primary); }
.selo.espera { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); color: var(--dsw-alias-state-warn-label, var(--dsw-alias-state-warn-primary)); }
.selo.erro { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); color: var(--dsw-alias-state-error-primary); }

/* ---------- aviso (erro em português, perto da ação) ---------- */
.aviso { padding: 10px 12px; border-radius: var(--dsw-radius-md); font-size: 13px; line-height: 20px; }
.aviso[hidden] { display: none; }
.aviso.erro { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent); color: var(--dsw-alias-state-error-primary); }
.aviso.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); color: var(--dsw-alias-state-success-primary); }
.aviso.info { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }

/* ---------- avisos flutuantes ---------- */
.avisos { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 20; display: flex; flex-direction: column; gap: 8px; width: min(560px, calc(100% - 32px)); }
.avisos .aviso { display: flex; justify-content: space-between; align-items: center; gap: 12px; background-color: var(--dsw-alias-bg-layer-3); box-shadow: var(--dsw-elevation-prominent); }
.avisos .aviso.erro { background-image: linear-gradient(color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent), color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)); }
.avisos .aviso.ok { background-image: linear-gradient(color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent)); }

/* ---------- vazio ---------- */
.cartao.vazio { grid-column: 1 / -1; }
.vazio { padding: 40px 16px; text-align: center; display: flex; flex-direction: column; gap: 6px; align-items: center; }
.vazio .grande { font-size: 16px; font-weight: 600; }

/* ---------- tabela do estoque ---------- */
.tabela { width: 100%; border-collapse: collapse; }
.tabela th { text-align: left; font-size: 12px; font-weight: 500; color: var(--dsw-alias-label-caption); padding: 12px 16px; }
.tabela td { padding: 16px; vertical-align: middle; box-shadow: 0 -0.5px 0 0 var(--dsw-alias-border-l3); }
.tabela .acoes { justify-content: flex-end; }
.rolagem { overflow-x: auto; }

/* ---------- formulários (agendamento, ajustes) ---------- */
.grade-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.interruptor { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.horarios { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.horarios .caixa { padding: 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); display: flex; flex-direction: column; gap: 2px; }
.horarios .valor { font-weight: 600; }
.motivos { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.motivos .caixa { padding: 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); text-align: center; }
.lista-simples { display: flex; flex-direction: column; gap: 4px; margin: 0; padding-left: 18px; }

/* ---------- calendário ---------- */
.cal-barra { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.cal-titulo { text-transform: capitalize; }
.cal { overflow-x: auto; }
.cal-cab, .cal-mes .cal-grade { display: grid; grid-template-columns: repeat(7, minmax(110px, 1fr)); min-width: 780px; }
.cal-cab span { padding: 4px 8px; font-size: 12px; color: var(--dsw-alias-label-caption); font-weight: 500; }
.cal-semana .cal-grade { display: grid; grid-template-columns: repeat(7, minmax(120px, 1fr)); min-width: 860px; }
.dia { min-height: 120px; padding: 6px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 0 0 0.25px var(--dsw-alias-border-l3); }
.cal-semana .dia { min-height: 280px; }
.dia.fora { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-caption); }
.dia.hoje .dia-n { background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); border-radius: 999px; padding: 0 8px; }
.dia-cab { display: flex; justify-content: space-between; align-items: center; min-height: 28px; }
.dia-n { font-size: 13px; font-weight: 600; line-height: 22px; }
.dia-mais { width: 28px; padding: 0; }
.dia-itens { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.chip-wrap { display: block; min-width: 0; }
.chip-texto { display: flex; align-items: baseline; gap: 2px 6px; flex-wrap: wrap; min-width: 0; flex: 1; }
.chip-mini { flex: none; width: 18px; height: 32px; object-fit: cover; border-radius: var(--dsw-radius-xs); background: var(--dsw-alias-bg-module-platform); }
.chip {
  display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
  padding: 3px 8px; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-family: inherit; font-size: 12px; line-height: 18px; cursor: pointer;
  transition: background-color 180ms ease;
}
.chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
.chip[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-active); border-color: var(--dsw-alias-border-l4); }
.chip.ok { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.chip.erro { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.chip.espera { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent); }
.chip.apagada { opacity: 0.55; text-decoration: line-through; }
.chip-hora { font-weight: 600; }
.chip-titulo { flex-basis: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }
.chip-estado { display: none; }
.cal-semana .chip-estado { display: inline; flex-basis: 100%; color: var(--dsw-alias-label-secondary); }
.opcao-rede { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.opcao-rede input { margin-top: 4px; width: 16px; height: 16px; flex: none; accent-color: var(--dsw-alias-button-primary-fill); }
.redes-opcoes { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.redes-opcoes .opcao-rede { padding: 10px 12px; border-radius: var(--dsw-radius-md); box-shadow: var(--dsw-elevation-stroke); }
.redes-opcoes .opcao-rede > span { display: flex; flex-direction: column; }
.redes-opcoes input:disabled + span { opacity: 0.6; }

/* ---------- por rede (validação, legenda, prévia) ---------- */
.redes { display: flex; flex-direction: column; gap: 8px; }
.redes-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.selos-rede { display: flex; gap: 6px; flex-wrap: wrap; }
.redes-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px; }
.rede-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.previa { margin: 0; display: flex; flex-direction: column; gap: 8px; }
.previa-tela {
  position: relative; width: 100%; max-width: 240px; aspect-ratio: 9 / 16; overflow: hidden;
  border-radius: var(--dsw-radius-xl); background: var(--dsw-alias-bg-module-platform);
  box-shadow: var(--dsw-elevation-stroke);
  color: var(--dsw-static-neutral-bluish-00);
}
.previa-tela video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.previa-vazio { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-caption); font-size: 12px; }
.previa-topo, .previa-rodape, .previa-lateral { position: absolute; z-index: 1; }
.previa-topo {
  left: 0; right: 0; top: 0; padding: 10px 12px 18px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600;
  background: linear-gradient(color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 65%, transparent), transparent);
}
.previa-ico { display: inline-flex; gap: 10px; }
.previa-ico svg { width: 18px; height: 18px; }
.previa-abas { display: flex; gap: 12px; margin: 0 auto; font-weight: 500; opacity: 0.9; }
.previa-abas b { font-weight: 700; box-shadow: 0 1.5px 0 0 currentColor; }
.previa-lateral { right: 8px; bottom: 96px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.previa-lateral svg { width: 22px; height: 22px; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 60%, transparent)); }
.previa-rodape {
  left: 0; right: 40px; bottom: 0; padding: 40px 12px 12px; font-size: 12px; line-height: 16px;
  background: linear-gradient(transparent, color-mix(in srgb, var(--dsw-static-neutral-bluish-1000) 80%, transparent));
}
.previa-linha-conta { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
.previa-avatar { width: 22px; height: 22px; border-radius: 999px; flex: none; background: color-mix(in srgb, var(--dsw-static-neutral-bluish-00) 70%, transparent); }
.previa-conta { font-weight: 600; overflow-wrap: anywhere; }
.previa-seguir { padding: 0 8px; border-radius: var(--dsw-radius-xs); font-size: 11px; line-height: 18px; box-shadow: 0 0 0 0.5px currentColor; }
.previa-exemplo { padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 16px; text-transform: uppercase; letter-spacing: 0.04em; background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); }
.previa-texto { margin: 0; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.previa-trilha { margin-top: 6px; display: flex; align-items: center; gap: 4px; opacity: 0.9; }
.previa-trilha svg { width: 12px; height: 12px; flex: none; }
.motivos-validacao { color: var(--dsw-alias-state-error-primary); }

/* ---------- publicações por rede, lado a lado ---------- */
.redes-lado { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.rede-cel { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 12px; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); min-width: 0; }
.rede-cel h4 { margin: 0; font-size: 13px; line-height: 20px; }
.rede-cel .leg { overflow-wrap: anywhere; }

/* ---------- prontidão ---------- */
.checklist { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; }
.checklist li { display: flex; gap: 10px; align-items: flex-start; padding: 12px 0; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.checklist li:first-child { border-top: none; }
.marca-item { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-size: 12px; font-weight: 700; }
.checklist .ok .marca-item { background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent); color: var(--dsw-alias-state-success-primary); }
.checklist .falta .marca-item { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 14%, transparent); color: var(--dsw-alias-state-error-primary); }

@media (max-width: 720px) {
  .redes-lado { grid-template-columns: 1fr; }
  .cal-semana .cal-grade { grid-template-columns: 1fr; min-width: 0; }
  .cal-semana .dia { min-height: 0; }
}

/* ---------- linhas de configuração (padrão do Harness): fio de 0.5px no lugar de caixa ---------- */
.config-grupo { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.config-grupo > h3 { font-size: 15px; line-height: 24px; font-weight: 600; }
.config-linhas { display: flex; flex-direction: column; }
.linha { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; min-width: 0; }
.linha { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.config-linhas > .linha:first-child, .config-linhas > [data-viva]:first-child > .linha:first-child { border-top: none; }
.config-linhas > [data-viva] { display: contents; }
.linha-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.linha-cab-dir { display: inline-flex; align-items: center; gap: 8px; }
.linha-rotulo { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.linha-ajuda { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); max-width: 75ch; }
.linha .campo { max-width: 420px; }
.linha .acoes { margin-top: 2px; }
.linha-valor { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.btn-desfazer { border: none; background: transparent; padding: 0 4px; border-radius: var(--dsw-radius-xs); font: inherit; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.btn-desfazer:hover { color: var(--dsw-alias-label-primary); text-decoration: underline; }
.btn-desfazer[hidden] { display: none; }
.config-pe { display: flex; gap: 8px; padding-top: 12px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.config-pe[hidden] { display: none; }
.cartao.pagina-config { padding: 0; background: transparent; box-shadow: none; }
main[data-aba="agendamento"], main[data-aba="configuracoes"], main[data-aba="sites"], main[data-aba="historico"] { max-width: 1000px; }
.config-pagina { display: flex; flex-direction: column; gap: 32px; }

/* ---------- chave (switch): o ESTADO aparece na posição e na cor ---------- */
.chave { flex: none; display: inline-flex; align-items: center; padding: 0; border: none; background: transparent; cursor: pointer; border-radius: 999px; }
.chave-trilho { position: relative; width: 40px; height: 22px; border-radius: 999px; background: var(--dsw-alias-bg-module-platform); box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l4); transition: background-color 180ms ease; }
.chave-bola { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-label-secondary); box-shadow: var(--dsw-elevation-stroke); transition: transform 180ms ease; }
.chave[aria-checked="true"] .chave-trilho { background: var(--dsw-alias-button-primary-fill); box-shadow: none; }
.chave[aria-checked="true"] .chave-bola { transform: translateX(18px); background: var(--dsw-alias-label-primary-foreground); }
.chave:focus-visible { outline-offset: 3px; }
.chave:disabled { opacity: 0.4; cursor: not-allowed; }
.chave-linha { display: flex; align-items: center; gap: 12px; }
.chave-texto { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }

/* ---------- cartão da arte do vídeo (calendário, ao passar o mouse ou focar) ---------- */
.cartao-flutuante {
  position: fixed; z-index: 30; width: 220px; padding: 12px; display: flex; flex-direction: column; gap: 6px;
  border-radius: var(--dsw-radius-lg); background-color: var(--dsw-alias-bg-layer-3); box-shadow: var(--dsw-elevation-prominent);
  pointer-events: none; font-size: 13px; line-height: 20px;
}
.cartao-flutuante[hidden] { display: none; }
.cartao-flutuante .cartao-arte { width: 100%; height: auto; aspect-ratio: 9 / 16; max-height: 300px; object-fit: cover; border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-module-platform); }
.cartao-flutuante .cartao-nome { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.cartao-flutuante .cartao-preco { font-weight: 600; }
.cartao-flutuante .cartao-quando { color: var(--dsw-alias-label-secondary); }

/* ---------- Histórico: o que já saiu ---------- */
.hist-linha { flex-direction: row; align-items: center; gap: 16px; }
.hist-mini { flex: none; width: 40px; height: 71px; object-fit: cover; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-module-platform); box-shadow: var(--dsw-elevation-stroke); }
.hist-mini.vazio { display: inline-block; }
.hist-corpo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hist-detalhe { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }

/* ---------- Sites ---------- */
.site-linha { gap: 10px; }
.tabela.amostra td, .tabela.amostra th { padding: 8px 12px; }

/* ---------- IA do escritor (Configurações) ---------- */
.ia-grade { display: flex; flex-direction: column; }
.ia-provedor { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; min-width: 0; }
.ia-provedor { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.ia-cab { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap; }
.ia-cab h4 { font-size: 13px; line-height: 20px; font-weight: 500; }
.ia-provedor label { font-size: 13px; font-weight: 600; }
.ia-provedor .campo { max-width: 420px; }
.ia-resultado:empty { display: none; }
.ia-resultado.ok { color: var(--dsw-alias-state-success-primary); }
.ia-resultado.erro { color: var(--dsw-alias-state-error-primary); }

@media (max-width: 720px) {
  main { padding: 16px; }
  .video { grid-template-columns: 1fr; }
  .video-player video, .semvideo { width: 100%; max-height: 360px; }
  .fila-cartao { grid-template-columns: 1fr; grid-template-areas: "id" "midia" "corpo"; padding: 16px; gap: 20px; }
  .fila-midia video, .fila-midia .semvideo { width: auto; max-width: 100%; margin: 0 auto; }
  .fila-midia { position: static; }
  
  .cartao { padding: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
`;
