# P2 — Cardápio de vídeo ligado de ponta a ponta

**Dono:** `packages/core` (migração v6, repositorio, acoes, tipos) e
`packages/montador` (fila.ts). **NÃO toca em portao.**
**Depende de:** nada. **Em andamento agora, em paralelo com P1.**

## Itens que fecha

D3 D4 D5 D6

## O que é "pronto"

O modelo escolhido chega de verdade no MP4. Hoje não chega: o montador sabe
fazer os 4 modelos, o banco não guarda a escolha, e a fila manda sempre o
padrão antigo. Foi o bug que o João viu.

1. Migração v6: `video` ganha modelo, enquadramento e cor, com CHECK.
2. `criarVideoComJob` grava. `montarProps` lê e manda no cardápio.
3. Refazer aceita e valida contra a lista fechada.
4. `@gerador/core` exporta o cardápio completo com nome legível, para a tela
   montar os botões sem nada cravado.
5. `sugerirVariacoes` exposta para o painel.

## Prova exigida

Renderizar DOIS vídeos do mesmo carro, modelos diferentes, **pelo caminho real**
(banco + fila, não chamando o montador direto), e comparar quadros.
Se saírem iguais, não está pronto.
