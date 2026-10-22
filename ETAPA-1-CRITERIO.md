# Etapa 1 — o montador: critério de pronto

Escrito antes de implementar. Nada de "pronto" sem prova rodada.

## Dado real medido, que manda no desenho

Fotos de revenda AutoCerto (plataforma comum no Brasil), medidas em 20/10/2026
no estoque da Rota 66 BH:

- **1024 x 768, proporção 4:3.** Não existe variante maior servida pelo CDN
  (testado: `fotosgrandes/`, `g1_`, `_g` → todos 404).
- O `RESTRICOES.md` previa 3:2. A realidade é mais quadrada e de resolução baixa.

Consequência aritmética, e é ela que decide o layout:

| Caminho | Conta | Resultado |
|---|---|---|
| Foto preenchendo 1080x1920 (cover) | 1024 → 2560 de largura | **2,5x de ampliação, borra** |
| Foto na largura do quadro (contain) | 1024 → 1080 | 1,05x, nítida, mas sobra 58% de altura vazia |

**Decisão: nunca cover na foto nítida.** Amador é exatamente o que o cliente rejeita.

## Layout obrigatório (9:16, 1080x1920, 30fps)

Três camadas:

1. **Fundo**: cópia da MESMA foto, em cover, com blur forte e escurecida.
   O blur esconde a ampliação, então aqui borrar não custa nada. Preenche o quadro,
   acaba com a tarja preta e dá cor que combina com o carro.
2. **Foto nítida**: no centro, largura máxima 984px (1080 menos 48 de margem
   de cada lado). Isso é 0,96x do nativo — **nunca** ampliar acima de 1,0x.
   O pan e zoom tem teto de escala 1,0x: começa em 1,0 e reduz, ou desloca dentro
   de uma moldura com recorte. Pixel nunca esticado.
3. **Texto**: faixa inferior com marca, modelo, ano, km e preço.

## O que vem do dado e o que vem do cardápio

- Preço, ano, km, modelo: **do dado lido**. O componente recebe como prop e
  renderiza. Se faltar, mostra vazio — nunca inventa, nunca estima.
- Cardápio (ver REGRAS-DE-NEGOCIO.md): fundo `claro | escuro | gradiente`,
  ritmo `rapido | calmo`, ordem das fotos. Nada além disso varia.

## Critério de pronto — todos obrigatórios, cada um com prova

1. Projeto Remotion dentro de `packages/montador`, sem quebrar o build do monorepo.
2. Composição vertical 1080x1920, 30fps, duração entre 28 e 32 segundos.
3. Recebe props tipadas: dados do produto + fotos + escolhas do cardápio.
   Zero dado embutido no componente.
4. Movimento calculado (pan/zoom sobre foto parada), **nunca** vídeo gravado,
   e **nunca** escala acima de 1,0x na foto nítida.
5. Transições só com `fade()`. `slide()` é proibido: pisca preto (RESTRICOES.md).
6. Funciona com 8 fotos, com 3 fotos, com 1 foto e com 0 fotos. Zero fotos
   renderiza um cartão só de dado, sem estourar.
7. Os 3 fundos e os 2 ritmos renderizam, todos.
8. Renderiza MP4 de verdade via `@remotion/renderer`, por função chamável de
   outro pacote — não só pelo Studio.
9. Nenhum erro `EXDEV` (o projeto está em btrfs, mas o temp precisa ficar no
   mesmo sistema de arquivos).
10. `pnpm typecheck` e `pnpm build` da raiz continuam limpos.

## Prova que eu vou conferir

- MP4 existindo no disco, com `ffprobe` mostrando 1080x1920, 30fps e a duração.
- Um quadro extraído de cada fundo, pra eu olhar o desenho.
- Render com 1 foto e com 0 fotos concluindo sem erro.
- Tempo de render medido, porque isso dimensiona a fila da etapa 3.
