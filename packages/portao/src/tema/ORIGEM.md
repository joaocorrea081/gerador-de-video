# De onde veio este tema

Copiado do **DeepSeek Harness**, versão `0.2.1-rc.2` (commit `687f282e86`),
de `packages/client/ui-theme/src/styles/`.

Licença **MIT**, Copyright (c) 2026 DeepSeek. O texto da licença está em
`LICENSE-deepseek-harness`, nesta mesma pasta, e precisa continuar aqui.

Decisão do João: copiar para dentro e mexer à vontade, nunca depender do
pacote deles (ver `REFERENCIAS.md`).

## Atenção de marca, não de licença

O `BRAND_GUIDELINES.md` deles pede que projetos de terceiros **não usem o nome
"DeepSeek Harness"** no próprio nome nem na marca, porque é marca registrada.
Copiar o código é permitido pela MIT; usar o nome deles no nosso produto, não.

Então: o visual é o deles, o nome do produto é nosso.

## Arquivos

| Arquivo | O que traz |
|---|---|
| `design-platform.css` | a paleta inteira e os tokens semânticos (`--dsw-alias-*`) |
| `dsh-base.css` | reset, pilha de fontes, suavização de texto |
| `focus.css` | anel de foco, acessibilidade de teclado |
| `scrollbar.css` | barra de rolagem no estilo deles |
| `corner-shape.css` | raio e formato de canto |
