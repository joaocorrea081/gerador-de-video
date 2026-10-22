# Etapa 6 — produto premium: critério de pronto

O João olhou o painel e disse: "ainda vejo muita falha, não é bom, a barra tem
que ser na lateral, falta a conexão com as redes sociais para postagem e
agendamento, me entrega um produto prêmio".

Três frentes, e a terceira é a que falta de verdade.

## 1. A casca — navegação lateral

Hoje a navegação é uma barra no topo. Tem que ser **lateral**.

- Barra lateral fixa, com as seções e o estado de cada uma (quantos esperam
  aprovação, quantos agendados, quantos renderizando).
- Recolhível, e a escolha fica guardada.
- Continua com os tokens do Harness. Nenhuma cor escrita à mão.
- Em tela estreita, vira gaveta.

## 2. O que falta para parecer produto, e não ferramenta

- **Prévia por rede.** Ver como o vídeo fica no feed do Instagram, do Facebook
  e do TikTok, com a legenda, antes de publicar.
- **Legenda e hashtag por rede.** Cada rede tem limite diferente. A IA escreve,
  respeitando o limite de cada uma, e dá para editar à mão.
- **Validação antes de publicar**, com os números reais do `PUBLICACAO.md`:
  Instagram de 3s a 15min, até 300MB, largura até 1920, H264/AAC;
  Facebook 9:16 obrigatório, de 3 a 90 segundos, AAC-LC;
  TikTok bloqueado em público sem auditoria.
  O vídeo que não passa é barrado **antes** de ir, com o motivo em português.
- **Painel de prontidão.** Uma tela que diz, item por item, o que ainda falta
  para cada rede poder publicar. É o que impede o cliente de achar que está
  tudo pronto quando não está.

## 3. Publicação e agendamento — o que ele pediu

### A regra que manda
**Nada publica sem aprovação humana.** Agendar é só marcar hora; o vídeo
precisa estar aprovado antes de entrar no calendário.

### Calendário
- Marcar dia e hora por vídeo e por rede. Hora em Brasília na tela, UTC no banco.
- Ver o mês e a semana, com o que está marcado.
- Desmarcar e remarcar.
- **Espaçamento mínimo entre publicações**, configurável. Trinta vídeos com o
  mesmo template podem ser barrados como spam (`PUBLICACAO.md`).

### Fila de publicação
- Máquina de estados por vídeo e por rede, separadas: o mesmo vídeo pode estar
  publicado no Instagram e falhado no Facebook.
- **Idempotência**: a mesma publicação nunca pode sair duas vezes, mesmo se o
  processo cair no meio. Chave de idempotência por vídeo e rede.
- **Nova tentativa com espera crescente.** Falha é normal, não exceção: em
  fevereiro de 2026 a Meta ficou cerca de 20 horas fora.
- **Limite diário por rede**: Facebook 30 por 24h; Instagram consulta
  `GET /{ig-id}/content_publishing_limit` antes de postar, porque a
  documentação deles se contradiz.

### Contas
- Tela de conexão por rede, mostrando: conectada ou não, qual conta, quando o
  token expira, e o que falta.
- **Token que rotaciona.** O refresh do TikTok dura 365 dias e pode rotacionar;
  se o novo não for gravado, para de funcionar calado. Gravar sempre o novo.
- Segredo nunca aparece na tela nem em log.

### Rótulo de conteúdo gerado por IA
Instagram `is_ai_generated`, Facebook equivalente, TikTok `is_aigc`.
Se entrar qualquer clipe generativo, declarar. Hoje a foto é real, mas o campo
existe e fica explícito.

## O que NÃO dá para provar agora, e tem que estar dito

Publicar de verdade exige app **do cliente**, aprovado:

- Instagram: só nas contas do dono do app é Standard Access, sem App Review.
- Facebook: exige App Review e verificação de empresa.
- TikTok: **sem auditoria não existe publicação pública. Nenhuma.**

Então: tudo se constrói e se prova em **modo seco**, com um provedor falso que
devolve as mesmas respostas e os mesmos erros das APIs reais. Trocar o falso
pelo verdadeiro é configuração, não reescrita.

**Proibido** inventar que publicou. Sem credencial, o painel diz que não está
conectado, e o botão de publicar fica desligado com o motivo.

## Critério de pronto

1. Navegação lateral, recolhível, com contadores, nos dois temas.
2. Calendário funcionando: marcar, ver, desmarcar, com hora de Brasília.
3. Fila de publicação com estado por rede, idempotência provada e nova
   tentativa com espera crescente provada.
4. Validação por rede barrando vídeo fora de especificação, com motivo claro.
5. Limite diário respeitado, provado em teste.
6. Espaçamento mínimo entre publicações, provado em teste.
7. Legenda por rede, com limite de cada uma, escrita pela IA e editável.
8. Prévia por rede.
9. Tela de prontidão listando o que falta por rede.
10. Modo seco provando o ciclo inteiro sem tocar em rede nenhuma.
11. Segredo nunca na tela nem em log, provado em teste.
12. Os 105 testes atuais continuam passando, e o total sobe.
