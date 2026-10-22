# Restrições e armadilhas já descobertas

Cada item aqui custou tempo de alguém em 20/10/2026. Leia antes de codar.

## O código não pode ficar em /mnt/Dados

`/mnt/Dados` é NTFS. O Remotion quebra nele com:

```
EXDEV: cross-device link not permitted
```

Ele cria arquivos temporários em `/home` e tenta mover para o projeto. Entre
sistemas de arquivos diferentes isso falha.

**O projeto tem que viver em `/home/joao/gerador-de-video/`.** Esta pasta de documentação pode
ficar onde está, porque é só texto.

## Vídeo gravado em 25fps renderizado a 30fps treme

Gravar a tela com Playwright sai em 25 quadros por segundo. Renderizar a 30 cria
um tremor visível, que o João descreveu como "embolando".

**Solução que funcionou:** não gravar vídeo. Capturar a imagem parada e mover a
imagem dentro do Remotion. O movimento vira cálculo, fica liso e em nitidez cheia.

É a mesma técnica que serve para a foto do carro.

## Assinatura do Claude não serve para o robô

Os termos de consumo da Anthropic proíbem, na lista do que não se pode fazer:

> acessar os Serviços por meios automatizados ou não humanos, seja por bot, script
> ou qualquer outro meio, exceto quando você está acessando via Chave de API

Vale para qualquer conta, a do João ou a do cliente. O robô rodando sozinho é
exatamente bot e script.

E não há economia: assinatura Pro custa US$ 20 por mês, enquanto mil vídeos na API
custam entre US$ 0,50 (Haiku 5.5) e US$ 10 (Sonnet 5).

**A régua:** assinatura é para gente, API é para robô. Assinatura ganha quando um
humano queima contexto grande o dia todo. API ganha quando um script faz muitas
chamadas pequenas.

## Licença do Remotion

Gratuito para pessoa física, empresa com até 3 funcionários e ONG.

Com 4 funcionários ou mais, exige Company License paga. Uso em automação cai no
plano Automators: US$ 0,01 por render, mínimo US$ 100 por mês. Uso interno também
conta como uso comercial.

**Tem que ser dito ao cliente antes de assinar.**

## CSS que esconde aviso de cookie pode apagar o site inteiro

Regra do tipo `[class*="cookie"] { display: none }` destrói páginas em que o
WordPress coloca uma classe de cookie no próprio `<body>`. Aconteceu com o site
do Fragoso: a altura da página foi a zero.

**Solução:** remoção cirúrgica por JavaScript, olhando posição e tamanho do
elemento, não por seletor de classe. O código está em
`referencia/captura-portfolio.js`, na constante `KILL`.

## Captura de página inteira

A opção `clip` do Playwright falhou. O que funcionou foi redimensionar a janela
para a altura total da página e então capturar:

```js
await page.setViewportSize({ width, height: alturaTotal });
await page.screenshot(...);
```

## Transição entre cenas

`slide()` do Remotion causou uma piscada preta visível entre cenas. Trocado por
`fade()` em todas as transições e o problema sumiu.

## Limite de tamanho ao enviar arquivo

O envio de arquivo pela automação do navegador trava em 10 MB. Vídeo de 30
segundos em 1080x1920 dá entre 10 e 25 MB.

Se precisar enviar, comprimir antes. Duas passagens para 1280x720 a 1650k deixou
em torno de 8 MB sem estragar.

## Armazenamento

MP4 de 30 segundos em 1080x1920 ocupa de 10 a 25 MB. Quinhentos vídeos passam de
10 GB, mais as fotos originais. Precisa de bucket e CDN, e alguém paga essa conta
todo mês.

## Proporção da foto contra proporção do Reel

Foto de carro é deitada, perto de 3:2. Reel é 9:16 em pé.

Isso não é detalhe de layout, é **o trabalho de design do projeto**. É o que o
cliente vê primeiro e é onde ele aprova ou rejeita tudo. Reserve tempo real para
isso e conte com pelo menos uma rodada de ajuste.

## Estimativa honesta de horas

A etapa 1 completa, com painel e tudo, não são 35 horas. São **61 a 92**:

| Item | Real |
|---|---|
| Leitor de site desconhecido | 12 a 18h |
| Template vertical que não pareça amador | 14 a 22h |
| Fila de render, worker, timeout, storage | 10 a 16h |
| Painel de aprovação com login e deploy | 12 a 16h |
| Claude e iteração de prompt até a copy ficar boa | 8 a 12h |
| Infra, deploy, segredos, ambiente | 5 a 8h |

**O piloto prometido ao cliente é muito menor:** um carro, um vídeo entregue como
arquivo, sem painel e sem publicação. Isso é 10 a 18 horas. Não confunda os dois.
