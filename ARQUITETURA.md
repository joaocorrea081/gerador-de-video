# Arquitetura

Quatro partes separadas. Uma pode mudar sem encostar nas outras. Foi assim que
foi descrito ao cliente, e é assim que deve ser construído.

## 1. Leitor

Entra no site da revenda e coleta cada carro: fotos, preço, ano, quilometragem,
ficha técnica.

**Playwright.** Precisa lidar com carregamento preguiçoso, que é onde a maioria
dos raspadores perde metade das fotos sem avisar. O código em
`referencia/captura-portfolio.js` já resolve isso: ele rola a página inteira antes
de capturar, justamente para disparar o lazy load.

**Não comece esta parte sem o link do site.** Site de revenda costuma rodar algum
sistema local sem padrão, com ficha em tabela inconsistente e foto em CDN.
Estimar sem ver é chute.

Precisa também de:
- filtro de qualidade de foto: resolução mínima, proporção, descartar duplicata
- regra de fallback para carro com uma foto só, ou nenhuma
- relê o dado logo antes de publicar, para não subir preço velho

## 2. Escritor

Transforma a ficha em texto de anúncio, no tom do cliente.

**Claude via API.** Nunca via assinatura: os termos de uso proíbem acesso
automatizado por bot ou script fora de chave de API, e a assinatura ainda sairia
mais cara neste caso. Detalhe em `RESTRICOES.md`.

Modelo: Haiku ou Sonnet resolvem. O trabalho é escrever três frases e escolher de
uma lista. Não precisa de Opus.

Saída estruturada, com validação e nova tentativa quando vier JSON inválido ou
texto fora do limite de caracteres.

**Atenção ao custo real:** se o modelo for escolher quais fotos usar, ele precisa
**ver** as fotos, e cada imagem custa por volta de 1.300 tokens. Com 6 a 10 fotos
por carro isso vira 8 a 13 mil tokens só de imagem.

Decida uma das duas e seja honesto com o cliente:
- o modelo vê as fotos e escolhe de verdade, e custa mais
- o modelo escolhe por metadado e ordem, e custa quase nada

Mesmo no cenário caro, dá cerca de US$ 0,06 por vídeo no Sonnet. O custo de IA
não é o problema deste projeto.

## 3. Montador

Monta o vídeo: foto real em movimento, dado na tela, vertical, cerca de 30
segundos.

**Remotion.** React que renderiza MP4. Cada elemento é código, então um carro vira
um vídeo sem ninguém abrir editor.

O movimento é **calculado, não gerado**: pan e zoom sobre a foto parada. A técnica
está pronta em `referencia/remotion-src/Scene.tsx`, no componente `PageScroll`.
Lá é uma página de site rolando; aqui é a foto do carro se movendo. Mesma ideia.

**O trabalho de verdade desta parte é o formato.** Foto de carro é deitada, perto
de 3:2. Reel é em pé, 9:16. Encaixar um no outro sem ficar amador é onde vai a
maior parte das horas, e é o que o cliente aprova ou rejeita.

Renderização não é detalhe, é infraestrutura: Remotion roda Chrome headless e come
CPU. Precisa de fila com estado por vídeo, limite de concorrência, timeout, nova
tentativa e armazenamento. Quarenta carros viram horas de fila.

Não esquecer: **áudio**. Vídeo de carro sem som rende pouco, e o catálogo de
música do Instagram e do TikTok não é acessível por API. Ou entra trilha
licenciada livre de royalties, ou locução sintetizada, ou silêncio embutido. Quem
paga a trilha precisa estar combinado.

## 4. Portão

Nenhum vídeo sai sem alguém aprovar.

Painel web pequeno, três telas:

1. **Fila** — lista dos vídeos esperando, player, Aprovar, Rejeitar com motivo
2. **Histórico** — o que já foi publicado, com link do post
3. **Ajustes** — de quanto em quanto tempo procurar carro novo, quais entram

Sem cadastro, sem plano, sem cobrança, sem cliente do cliente se inscrevendo.
É ferramenta interna, um login para a equipe dele.

**Falta pensado:** aprovação precisa de aviso. Painel que alguém lembra de abrir
não funciona. E-mail, Telegram ou WhatsApp avisando que tem vídeo na fila.

## Stack

| Parte | Escolha | Por quê |
|---|---|---|
| Leitor | Playwright | lida com lazy load; já existe código base |
| Escritor | Claude via API | termos de uso exigem API para uso automatizado |
| Montador | Remotion | vídeo por código, resultado idêntico toda vez |
| Portão | web simples + banco local | é ferramenta interna, não produto |
| Banco | local no servidor | decisão do João, nada de serviço externo |
| Servidor | VPS pequena | renderização é CPU, não precisa de GPU |

## Onde o código mora

`/home/joao/gerador-de-video/` — nunca em `/mnt/Dados`. Motivo em `RESTRICOES.md`.
