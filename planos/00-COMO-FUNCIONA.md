# Planos de ação — como isto funciona

Ideia do João: "cria plano de ação para cada função, divide em pedaços, põe
cada agente no que pode fazer. Quando termina um, vai para o outro. Aí nunca
perde."

## A regra que evita colisão

Cada plano declara os **ARQUIVOS QUE ELE É DONO**. Dois planos com dono em
comum NUNCA rodam ao mesmo tempo. É por isso que já colidimos uma vez.

`packages/portao` é o gargalo: quase toda tela mora lá, e `estilo.ts`,
`cliente.ts`, `servidor.ts` e `idioma/` são compartilhados por todas elas.
Então planos de tela rodam **em sequência**, um agente de cada vez.
Os de motor (core, leitor, escritor, montador) rodam em paralelo com eles.

## Ordem

Um plano só começa quando as suas dependências estiverem ✅ conferidas por mim.
Nada é dado como pronto por relatório de subagente.

| Plano | Dono dos arquivos | Depende de | Paralelo? |
|---|---|---|---|
| P1 estrutura e correções do painel | portao (tudo) | — | não |
| P2 cardápio de vídeo ligado | core, montador | — | sim |
| P3 telas do cardápio e do refazer | portao (tudo) | P1, P2 | não |
| P4 telas de motor já pronto | portao (tudo) | P3 | não |
| P5 redes como conector | core + portao | P4 | não |
| P6 conferência ligada no publicador | portao | P4 | não |

## Estado

Ver `PENDENCIAS.md` na raiz: 54 itens, com o que é ⬜ 🔧 ✅.
