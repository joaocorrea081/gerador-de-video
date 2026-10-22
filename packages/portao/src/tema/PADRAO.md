# O idioma visual do Harness, medido no código deles

Não invente valor. Está tudo aqui, lido de
`packages/client/ui-primitives/src/*.module.css` e
`packages/client/ui-theme/src/styles/*.css` na versão `0.2.1-rc.2`.

## Raio de canto

| Token | Valor | Onde eles usam |
|---|---|---|
| `--dsw-radius-xs` | 4px | detalhe miúdo |
| `--dsw-radius-sm` | 8px | botão pequeno |
| `--dsw-radius-md` | 12px | botão padrão, aba |
| `--dsw-radius-lg` | 16px | grupo de abas, cartão |
| `--dsw-radius-xl` | 20px | cartão grande |
| `--dsw-radius-panel` | 28px | painel inteiro |

## Botão

- Padrão: altura **36px**, `radius-md`, fonte **14px/22px**, padding `0 14px`.
- Pequeno: altura **28px**, `radius-sm`, fonte **12px/18px**, padding `0 10px`.
- `gap: 4px` entre ícone e texto. `border: none` por padrão.
- Desabilitado: `opacity: .4` e `cursor: not-allowed`.

Variantes:
- **primary** — fundo `--dsw-alias-button-primary-fill`, texto
  `--dsw-alias-label-primary-foreground`, hover `--dsw-alias-button-primary-hover`.
- **ghost** — transparente; hover `--dsw-alias-interactive-bg-hover`,
  ativo `--dsw-alias-interactive-bg-active`.
- **outline** — borda **0.5px** `--dsw-alias-border-l3`, fundo transparente,
  hover `--dsw-alias-interactive-bg-hover`.

Repare: a borda deles é **0.5px**, não 1px. É o que dá o ar fino.

## Abas (SegmentedTabs)

- Trilho: `display: grid`, `padding: 4px`, `radius-lg`,
  fundo `--dsw-alias-bg-module-platform`.
- Indicador que desliza: `position: absolute`, `inset: 4px auto 4px 4px`,
  borda 0.5px `--dsw-alias-border-l3`, fundo `--dsw-alias-bg-layer-3`,
  `transition: transform 180ms ease`.
- Aba: altura **34px**, fonte 14/20, cor `--dsw-alias-label-secondary`;
  selecionada vira `--dsw-alias-label-primary` com `font-weight: 600`.
- Foco: sem outline, sublinhado de 1px com `text-underline-offset: 4px`.

## Elevação

Não é sombra pesada. É traço fino mais sombra quase invisível:

```
--dsw-elevation-stroke: 0 0 0 0.5px var(--dsw-elevation-stroke-color);
nivel 1: stroke, 0 3px 8px rgba(0,0,0,.03), 0 0 16px rgba(0,0,0,.02)
```

## Movimento

- `180ms ease` é o tempo padrão deles.
- Respeitar `@media (prefers-reduced-motion: reduce)` zerando a transição.
  Eles fazem isso em todo componente animado. Nós também.

## Tema

Claro é o padrão. Escuro entra por `body[data-ds-dark-theme]`.
Os dois têm que funcionar — os tokens já cobrem os dois.

---

# A ESTRUTURA deles, não só as cores

Medido em `packages/client/ui-sidebar/src/client/SidebarRoot.module.css` e
`packages/client/ui-primitives/src/ConfigField.module.css`, versão `0.2.1-rc.2`.

Copiar token de cor não é copiar o design. Isto aqui é o layout.

## Barra lateral

```
padding: 6px 12px        flex column, height 100%
background: var(--dsw-specific-sidebar-fill)
borda de 1px só do lado direito
font-size: 14px
```

**Linha da marca:** altura **60px**, padding `8px 0 8px 4px`, margem de 4px
embaixo. O nome: **18px, peso 600, entrelinha 24px, letter-spacing 0.04em**.

**Botão de ação principal** (o "New Session" deles): altura **38px**,
padding `8px 12px`, margem `0 2px 12px`, borda **0.5px** `--dsw-alias-border-l3`,
raio `md`, fundo `--dsw-alias-button-elevated-fill`, texto **14px/22px peso 500**.

**Lista de seções:** `gap: 4px`, margem de 8px embaixo.

**Cada linha de seção:** altura mínima **36px**, padding `7px 8px`,
margem `0 2px`, raio `md`, `gap: 8px` entre ícone e texto, entrelinha 22px,
texto alinhado à esquerda.
Hover e selecionado usam o MESMO fundo: `--dsw-alias-interactive-bg-hover`.
Repare: o selecionado deles não usa cor de destaque. É o mesmo cinza do hover.

**Botão de ícone:** **28×28**, raio `sm`. Recolhido vira **36×36**, raio `md`.

**Recolhido** é uma régua de **56px**: padding `18px 10px 6px`, controles de
36×36, `gap: 12px`.

**Rodapé:** as Configurações ficam **ancoradas embaixo**, num bloco próprio.

## Linha de configuração — o padrão deles

```
.field  { display:flex; flex-direction:column; gap:6px; padding:12px 0 }
.field + .field { border-top: 0.5px solid var(--dsw-alias-border-l2) }
.head   { display:flex; align-items:center; justify-content:space-between; gap:8px }
rótulo  { 13px, peso 500, cor label-primary }
campo   { padding:6px 12px; borda 0.5px border-l4; raio md;
          fundo bg-layer-3 }
erro    { 12px, cor state-error-primary }
```

O que isso significa na prática, e é o oposto do que fizemos:

- Configuração deles **não é cartão dentro de cartão**. É uma **lista de
  linhas**, separadas por um fio de **0.5px**, com 12px de respiro em cima e
  embaixo.
- O rótulo é **pequeno (13px)** e discreto. O valor é que tem peso.
- Cada linha tem um **texto de ajuda** curto abaixo do rótulo.
- A ação de desfazer ("reset") fica **à direita do rótulo**, na mesma linha,
  como botão sem moldura em cor secundária.
- Formulário com mudança pendente mostra **Salvar e Descartar** juntos, no pé
  do grupo — não um botão solto por campo.

## A regra geral que dá o ar deles

Fio fino no lugar de caixa. `0.5px` em vez de `1px`. Cinza no lugar de cor.
Respiro vertical constante. Nada de sombra pesada, nada de borda grossa,
nada de cor de destaque para marcar o que está selecionado.
