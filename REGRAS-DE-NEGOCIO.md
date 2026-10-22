# Regras de negócio

## A regra que manda em todas as outras

**A foto do carro é a foto real do estoque. Nunca gerada por IA.**

O cliente citou Seedance, Kling e Higgsfield, que geram vídeo do zero. Esses
modelos mexem na roda, trocam a grade, somem com o emblema. Num anúncio de
revenda isso é problema de negócio, não de estética: o comprador vai até a loja
esperando o carro que viu no vídeo.

Vídeo generativo também cobra por segundo. Um clipe de 30 segundos custa de
US$ 1,26 a US$ 5,10. A foto real custa zero.

Se algum dia entrar clipe generativo, é só para fundo, onde a precisão não importa.
Nunca para o carro.

## Preço, ano e ficha vêm do dado, nunca do modelo

Número na tela sai do que foi lido no site. O modelo de linguagem não escreve
preço, não escreve quilometragem, não escreve ano.

Modelo que inventa preço em anúncio de carro é propaganda enganosa, e a culpa cai
em quem fez o robô.

Corolário: antes de publicar, reler o dado no site. Preço desatualizado no ar é o
mesmo problema.

## O Claude não desenha. Ele escolhe de um cardápio.

O visual fica fixo no código, num template. O modelo nunca inventa layout.

O que ele pode escolher, e só isso:

| O que varia | Opções |
|---|---|
| Fundo | claro, escuro, gradiente |
| Ritmo | rápido, calmo |
| Quais fotos e em que ordem | das que existem |
| Texto do anúncio | ele escreve |

Esse cardápio é o que torna o aprendizado possível **e** seguro. Sem ele, "parar
de usar fundo escuro" não faz sentido, porque o modelo não escolhe o fundo.

## Nada publica sem alguém aprovar

Todo vídeo para numa fila. Uma pessoa vê e clica Aprovar ou Rejeitar.

Rejeitar **exige motivo**, e o motivo é botão, não texto livre. Texto livre não
ensina nada e não dá para agrupar.

Motivos sugeridos: foto ruim, texto errado, ritmo, dado errado, fundo.

## O aprendizado é memória, não treinamento

Não existe fine-tuning aqui. Não prometa isso ao cliente.

O que acontece: a rejeição fica guardada com o motivo, e as últimas N rejeições
por categoria entram no pedido ao Claude como exemplos do que evitar.

Vantagem real: funciona na hora, custa quase nada, e dá para ler e corrigir na
mão o que ele "aprendeu". Treinar modelo não dá nenhuma dessas três.

**Tem que haver teto.** Injetar tudo que já foi rejeitado faz o custo e a demora
subirem toda semana até estourar. Janela fixa: as últimas N por categoria.

## Critério de pronto do aprendizado

Sem isso, essa etapa nunca fecha. O combinado é:

- Toda rejeição grava motivo estruturado.
- O painel mostra as rejeições agrupadas por motivo.
- O pedido ao Claude usa as 10 mais recentes de cada categoria.

**Fora de escopo, por escrito:** treinar ou ajustar modelo, e qualquer promessa de
percentual de acerto.

## Direito sobre as fotos

Foto do site da revenda pode ter marca d'água de outra loja ou ser do fabricante.
Isso não se resolve no código.

Resolve-se numa linha de contrato: o cliente garante que tem direito de usar
comercialmente as imagens do site dele.

## Idioma

A revenda é da Moldávia. O idioma de lá é romeno, e muita gente usa russo.

Ninguém da nossa parte fala romeno. Texto comercial gerado por IA e publicado
sozinho no perfil de uma revenda, sem ninguém que leia o idioma, é risco alto.

**A revisão do idioma é papel do cliente, na fase de aprovação.** Isso precisa
estar combinado, não suposto.
