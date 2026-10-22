# O padrão do vídeo, medido

Para quem mexer aqui daqui a seis meses. Não invente valor: está tudo medido.
Cada regra tem um teste que quebra se ela for violada
(`src/layout.test.ts`, `src/escala.test.ts`, `src/modelos.test.ts`).
Se mudar uma medida, mude o teste junto e escreva o porquê aqui.

Código que calcula: `src/layout.ts` (texto), `src/variantes.ts` (foto),
`src/modelos.ts` (ritmo). `Sobreposicoes.tsx` e `Cena.tsx` só desenham.

Nasceu do video-21 (Astra, enérgico, cheia), reprovado em cinco pontos. Cada
seção diz qual.

## 1. O quadro e a área segura

Quadro: **1080 x 1920**, 30 fps, 28 a 32 s.

| Medida | Valor | Por quê |
|---|---|---|
| Margem lateral do texto (`MARGEM`) | **56 px** | texto nunca mais perto da borda que isto |
| Largura máxima de painel (`LARGURA_UTIL`) | **968 px** | 1080 - 2 x 56. Editorial usa 1080 (painel de véu, texto com 72 px de padding) |
| Folga entre bloco e foto (`FOLGA_FOTO`) | **44 px** | bloco nunca cola na foto |
| Respiro até a borda do quadro (`RESPIRO_BORDA`) | **20 px** | bloco nunca encosta no corte |
| Folga entre texto e borda da forma (`FOLGA_TEXTO`) | **20 px** (mínimo) | ver seção 2 |

**Onde texto pode viver:** só nas duas faixas livres, acima e abaixo da janela da
foto. Nunca sobre o carro.

| Enquadramento | Janela da foto | Faixa de cima | Faixa de baixo |
|---|---|---|---|
| `cheia` | 1080 x 840, y 540 a 1380 | y 0 a 540 | y 1380 a 1920 |
| `nitida` | 1080 x 810, y 555 a 1365 | y 0 a 555 | y 1365 a 1920 |

**Risco conhecido, decisão do João (não resolvida aqui).** Os apps cobrem parte
do quadro com a interface. Os números variam por fonte: Reels cobre uns 270 px
em cima e 670 px embaixo; TikTok uns 220 e 480; Shorts uns 288 e 672
([Revid](https://www.revid.ai/tiktok-safe-zone), [reap.video](https://reap.video/blog/short-form-video-safe-zones),
[Upload-Post](https://www.upload-post.com/tools/safe-zone-checker/)). O bloco de
baixo deste layout fica em y ~1490 a 1810, dentro dessa zona. Conferir no app
real antes de prometer ao cliente. Se for problema, a saída é subir a janela da
foto e tirar o texto de baixo, não esticar a margem.

## 2. Recuo dentro de forma inclinada (defeito 1)

Só o modelo **enérgico** inclina: paralelogramo com inclinação fixa em px
(`MEDIDAS.energico.inclinacao = 40`), **não em porcentagem** (porcentagem fazia
a inclinação mudar com a largura do painel e impedia a conta).

Para um painel de largura `L` e altura `A`, na altura `y` (0 = topo do painel):

```
borda esquerda(y) = S * (1 - y/A)      // em cima S, embaixo 0
borda direita(y)  = L - S * (y/A)      // em cima L, embaixo L - S
```

Regra, **linha a linha**: uma linha de texto ocupa de `y_topo` a `y_pe`. O pior
ponto da esquerda é o topo da linha; o pior da direita é o pé dela.

```
x_inicio_da_linha          >= borda_esq(y_topo) + 20
x_inicio + largura_do_texto <= borda_dir(y_pe)   - 20
```

Por isso a largura do painel é calculada pela linha mais exigente:
`L = max( padding_esq + largura_da_linha + padding_dir + S * y_pe/A )`.
Linhas mais baixas pagam mais recuo. O painel é tão largo quanto o texto
pede, sem vazio azul sobrando. O texto começa em `padding_esq = 64` (S 40 + 24
de ar).

Retângulos (institucional, números, editorial) usam as mesmas funções com `S = 0`.
O padding esquerdo/direito nunca é menor que o raio do canto (24, 16, 0).

Largura do texto: `larguraTexto()` estima por classe de caractere (Inter
negrito, em em): maiúscula 0,70; algarismo 0,62; minúscula 0,58; espaço 0,28;
pontuação 0,30; mais o espaçamento entre letras. É conservadora (erra para
mais) e foi calibrada no video-21. Se trocar a fonte, recalibre medindo um
quadro renderizado.

Teste: `violacoesForma()` roda em todo bloco de todo modelo, com os textos
reais. Há um teste que reproduz o defeito antigo e exige que o verificador o
pegue.

## 3. Ancoragem do bloco (defeito 2)

**O bloco é centrado na faixa livre.** Sobra igual em cima e embaixo dele:

```
topo_do_bloco = inicio_da_faixa + (altura_da_faixa - altura_do_bloco) / 2
```

Vale para os blocos de cima (centrados em y 0 a 540) e de baixo (y 1380 a 1920).
A altura vem do conteúdo (soma das linhas), não de uma altura fixa. Antes, o
bloco ancorava na foto com altura máxima de 300 e deixava ~220 px de nada no pé.

Limites (testes):
- sobra igual dos dois lados (diferença < 1 px);
- sobra >= 44 (não cola na foto) e >= 20 (não encosta na borda);
- **sobra no pé <= 200 px** (`SOBRA_MAX_PE`). Por quê 200: é ~10% da altura do
  quadro e abaixo dos 220 px reprovados; o maior valor real hoje é 196 (tag
  "ANO" do modelo números, no enquadramento nítida). Se um bloco novo passar
  de 200, ele é pequeno demais para a faixa: aumente a fonte, não o limite.
- altura real <= `alturaMax` do modelo (300, 340, 270 etc., em `modelos.ts`).

## 4. Enquadramento: o carro inteiro (defeito 3)

Não há detector de carro. A regra usa uma **zona do carro** conservadora
(`ZONA_CARRO` em `variantes.ts`): **x de 4% a 96%** da largura e **y de 15% a
90%** da altura. Medida nas fotos do estoque: Astra lateral 4,4% a 90,3%;
traseira 16,6% a 80,9%. Só duas fotos foram medidas à mão: se aparecer carro
que passe disso, aumente a zona, não o zoom.

Regra: **a janela mostra a zona inteira em todo instante do zoom e do pan.**

```
visivel_x   = largura_janela / (largura_foto * escala)          // fração da foto
escala_max  = min(alvo, teto, largura_janela / (largura_foto * 0,92),
                  altura_janela / (altura_foto * 0,75))
borda_esq   deve ficar em [ max(0, 0,96 - visivel_x),  min(1 - visivel_x, 0,04) ]
```

O pan só anda dentro desse intervalo. Na vertical a janela se centra na zona do
carro (não no meio da foto).

Consequência prática, 1024x768 em `cheia`: escala de **1,094x a 1,146x** (antes
1,302x a 1,45x, que cortava o para-choque). O teto 1,45x **continua** valendo;
o carro inteiro só limita antes. `nitida`: 1,055x a 1,08x (teto 1,08x). O pan e o
zoom ficam sutis: é o preço de mostrar o carro inteiro, decidido assim ("prefira
mostrar o carro inteiro a encher o quadro").

Foto mais larga que 4:3 (ex.: 16:9): a janela **encolhe em altura** em vez de
cortar o carro. Foto muito pequena: janela encolhe (nunca amplia além do teto).
Foto vertical (retrato) está fora do contrato: carro de estoque vem deitado.

## 5. Tempos de entrada e saída (defeito 5)

Em `modelos.ts`, por modelo (segundos):

| Modelo | Entrada | Saída | Desloca | Eixo | Fade entre fotos |
|---|---|---|---|---|---|
| institucional | 0,60 | 0,45 | 220 px | lado | 0,6 |
| enérgico | 0,22 | **0,30** | 760 px | lado | 0,3 |
| números | 0,50 | 0,40 | 70 px | vertical | 0,6 |
| editorial | 1,00 | 0,80 | 44 px | vertical | 0,9 |

**Regras:**
- **Saída nunca é corte seco.** `SAIDA_MIN_SEGUNDOS = 0,25` (7,5 quadros). Abaixo
  disso lê como falha de renderização. O enérgico tinha 0,12 s e opacidade
  liga/desliga.
- **Todo modelo faz fade na entrada e na saída** (`opacidadeBloco`). Não existe
  mais caso especial para o enérgico.
- Curva de saída `inOut(cubic)` (amortecida nas duas pontas). A de entrada é
  `bezier(0.16, 1, 0.3, 1)`: rápida no começo, assenta no fim.
- A diferença de ritmo entre modelos **fica**: enérgico entra e sai mais rápido
  que qualquer outro (teste). O que muda é a identidade, não a falha.
- Só `fade()` entre fotos (nunca `slide()`; pisca preto).
- Uma tag de cada vez; cada saída termina antes da próxima entrar (`cronograma.ts`).

Teste: simula quadro a quadro (30 fps) a opacidade durante a saída de cada
modelo: nunca cai mais que 0,5 num quadro, nunca sobe, passa por >= 5 quadros
intermediários e termina em 0.

## 6. Linhas e caracteres por bloco

| Bloco | Linhas | Regra |
|---|---|---|
| Tag (ano, km, valor) | 2 | rótulo + valor, uma linha cada. Valor encolhe até 40 px para caber (km de 321.594 cabe) |
| Revenda (abertura, cima) | 1 | fonte encolhe até 28 px |
| Modelo (abertura, baixo) | até 3 | marca (34 px) + **manchete** + **versão** (32 px) |
| Veículo (fechamento, cima) | até 2 | `MARCA MANCHETE` (40 px, encolhe até 28) + versão (28 px) |
| Preço (fechamento, baixo) | até 4 | `VALOR` + preço + **chamada em no máximo 2 linhas** |

- **Chamada:** título escrito (limite do escritor: 80 caracteres) + ` · revenda`.
  Tenta fonte 42, 38, 34, 30; depois sem a revenda; por último corta palavras do
  fim com reticências. Quebra por palavra, nunca no meio.
- **Caracteres por linha:** não há contagem fixa; vale a largura. A conta é
  `larguraTexto() <= 968 - padding - recuo`. Em referência, no enérgico a linha
  de versão em 32 px comporta ~37 caracteres maiúsculos (836 px úteis).
- **Manchete:** no máximo **3 tokens e 24 caracteres**, 1 linha, fonte base por
  modelo (enérgico 76, números 64, editorial 84, institucional 70), encolhendo
  até 44.

## 7. Nome de modelo longo (defeito 4)

O banco guarda a string técnica: `ASTRA 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL`
(até 53 caracteres: `SPIN PREMIER 7L 1.8 8V ECONOFLEX 4P C/AR - AUTOMÁTICO`). Isso não é
manchete.

`tratarModelo()` divide em **manchete + versão** e **só corta, nunca acrescenta**
(manchete + versão recompõe o dado; há teste):

- Manchete = 1º token + os seguintes enquanto **não forem técnicos**.
- Token técnico = começa com algarismo (`2.0`, `16V`, `4P`, `7L`, `4X4`), tem
  `.` ou `/`, ou é `-`. Letra primeiro e algarismo depois (`C4`, `X6`, `S10`)
  **identifica o carro** e fica.
- Máximo 3 tokens e 24 caracteres.
- Versão = o resto, numa linha secundária menor. Se não couber em uma linha,
  **perde as últimas palavras inteiras** (nunca no meio, nunca reescreve).

| Banco | Manchete | Versão |
|---|---|---|
| ASTRA 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL | ASTRA | 2.0 MPFI ADVANTAGE 8V FLEX 4P MANUAL |
| C4 CACTUS 1.6 THP FLEX SHINE PACK EAT6 | C4 CACTUS | 1.6 THP FLEX SHINE PACK EAT6 |
| C3 1.0 FIREFLY FLEX FEEL MANUAL | C3 | 1.0 FIREFLY FLEX FEEL MANUAL |
| TIGER X6 SCOOTER ELÉTRICA | TIGER X6 SCOOTER | ELÉTRICA |

Limitação assumida: a divisão é por regra de forma, não por conhecimento de
marca. Para um modelo cujo sobrenome comercial vem depois do primeiro número
(raro nesse estoque), a manchete sai mais curta; a informação não se perde, só
desce para a linha secundária.

## O que NÃO muda

Foto real do estoque, nunca gerada. Preço, ano, km e modelo vêm do dado lido.
Só `fade()` entre fotos. 1080x1920, 30 fps, 28 a 32 s, faixa de áudio. Teto de
escala (`cheia` 1,45x, `nitida` 1,08x). Tag nunca cobre o carro. Tokens de cor
de `theme.ts`/`cor.ts`.
