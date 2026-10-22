# Auditoria clique a clique — 22/10/2026

Feita por mim, em servidor isolado na porta 3090, cópia do banco, 1440x900.
O João pediu depois de dizer: "você nunca anota, nunca percebe os erros".
Ele tem razão: até aqui eu só achei o que ele apontou. Isto é o que eu achei sozinho.

Severidade: **ALTA** = mente ou causa prejuízo · **MÉDIA** = atrapalha o trabalho ·
**BAIXA** = incomoda.

---

## A-1 (ALTA) · O painel mente que está renderizando

**Medido:** a tela diz "Renderizando o vídeo #10 há 5 min 32 s". A API confirma
`emExecucao: {jobId:10, haSegundos:588}`. Mas NÃO existe worker rodando neste
servidor, e o banco mostra o job 10 preso em `em_execucao` desde as 11:07.

**Por que é grave:** o tempo limite do job é de 180 segundos. Já passou TRÊS
VEZES e nada percebeu. A pessoa fica esperando um vídeo que nunca vem, achando
que o sistema está trabalhando.

**Causa:** `recuperarJobsOrfaos()` só roda no `criarFila()`, ou seja, quando o
processo sobe. Se o worker morre depois, ou se a fila está desligada, o job
fica preso para sempre e a tela apresenta trabalho morto como trabalho vivo.

**Correção:** job em `em_execucao` há mais tempo que o seu próprio limite é
job travado. A tela tem que dizer "travado" e oferecer destravar, e a fila tem
que recuperar sozinha, não só ao subir.

## A-2 (ALTA) · "0 s para terminar tudo" enquanto diz que está renderizando

**Medido:** no mesmo quadro, o painel mostra "Renderizando o vídeo #10" e
"0 s para terminar tudo". As duas informações se contradizem na mesma tela.

**Causa:** a estimativa soma só os pendentes e ignora o que está em execução.

**Correção:** a estimativa precisa incluir o que está rodando. E duas
informações que se contradizem nunca podem aparecer juntas.

## A-3 (ALTA) · Rejeitar não tem desfazer

**Medido:** cliquei Rejeitar, escolhi "Fundo", e o vídeo saiu da fila na hora.
Apareceu o aviso "Vídeo rejeitado (Fundo). O escritor vai aprender disso."

**Por que é grave:** um clique errado tira o vídeo da fila E grava a rejeição
na memória que ensina o escritor. Ou seja, o erro contamina os próximos textos.
O aviso é exatamente o lugar onde um "Desfazer" deveria estar, e não está.

**Correção:** botão Desfazer dentro do aviso, com uns 10 segundos de janela.
Desfazer apaga a rejeição também, não só devolve o vídeo.

## A-4 (MÉDIA) · Ligar/desligar diz a ação, não o estado

**Medido:** no Agendamento há um botão escrito "Ligar" e, ao lado, uma etiqueta
escrita "Desligada". A pessoa precisa ler as duas coisas para entender.

**Correção:** uma chave que desliza, mostrando o estado pela posição.

## A-5 (ALTA) · O site aparece mas não dá para trocar

**Medido:** o Agendamento mostra "Site lido: https://rota66bh.com.br" como
texto morto. Não existe campo, nem botão, nem tela para mudar.

**Por que é grave:** é o endereço de onde TODO o dado vem. O cliente da Moldávia
nunca vai conseguir usar o sistema sem isso. O próprio João disse: "nem eu sei
de onde está vindo essa pesquisa".

## A-6 (MÉDIA) · Calendário vazio ocupa a tela inteira sem informar nada

**Medido:** o mês inteiro em branco, com um "+" em cada dia, e a tela toda
gasta nisso. Sem marcação nenhuma, a tela não diz o que fazer primeiro.

**Correção:** com nada marcado, o calendário não deveria ser o protagonista.
Mostre primeiro o que está pronto para agendar, e o calendário ao lado.

## A-7 (ALTA) · Aprovar não leva a lugar nenhum

**Medido:** aprovei um vídeo. Ele sumiu da fila e acabou. Para agendar, tenho
que lembrar de ir ao Calendário, achar o vídeo de novo, escolher rede e horário.

**Por que é grave:** aprovar e publicar é UM trabalho, não dois. Quebrar no meio
faz a pessoa esquecer, e vídeo aprovado fica parado sem ir para lugar nenhum.

**Correção:** aprovar emenda no agendamento, oferecendo rede e horário ali
mesmo, com a opção de deixar para depois.

## A-8 (ALTA) · Não existe grade de publicação

**Medido:** só dá para marcar um vídeo por vez, escolhendo dia e hora na mão.

**Por que é grave:** com 40 carros, isso é 40 marcações manuais. Ninguém faz.

**Correção:** uma grade que a pessoa monta uma vez ("segunda, quarta e sexta,
às 10h e às 18h") e o sistema encaixa os aprovados nas próximas vagas livres,
respeitando o espaçamento mínimo e o limite diário de cada rede.

## A-9 (MÉDIA) · Histórico continua sem propósito

**Medido:** "Nada aprovado ainda". Ele só espelha o que a Fila já mostra.

## A-10 (BAIXA) · Estoque desperdiça a largura

**Medido:** em 1440px a tabela ocupa metade da tela e as colunas ficam
apertadas, com texto quebrando em três linhas.

## A-11 (BAIXA) · "Processar vencidas agora" é jargão

**Medido:** botão no topo de Publicações. Ninguém da revenda sabe o que é
"vencida" aqui.

## Já apontados pelo João e em conserto

- Preço ambíguo: `R$22,500.00` em inglês lê como vinte e dois reais.
- Cânion entre os grupos de botão da Fila, e vazios nas telas largas.
- Cinco provedores de IA existem no escritor e não aparecem na tela.
- Estrutura do Harness: barra e linhas de configuração.
- Dois seletores de idioma com comportamentos diferentes.
- Rótulos de tema em português com a tela em inglês.
