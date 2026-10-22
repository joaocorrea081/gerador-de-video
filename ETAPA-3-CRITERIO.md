# Etapa 3 — fila e portão: critério de pronto

Escrito antes de implementar.

## As duas metades

**Fila de render.** Um worker por vez. Renderizar dois vídeos ao mesmo tempo
numa máquina comum derruba os dois (INFRA.md).

Número medido na Etapa 1: **47 segundos de parede** por vídeo de 31s, nesta
máquina. Quarenta carros = cerca de 31 minutos de fila. A interface precisa
mostrar isso sem parecer travada.

**Portão.** Nada publica sem alguém aprovar (REGRAS-DE-NEGOCIO.md).

## Fila — o que não pode faltar

- Estado por item: pendente, em_execucao, concluido, falhou. Já está no banco.
- Concorrência 1. Fixa, não configurável para cima sem aviso.
- Timeout por job. Render travado não pode segurar a fila para sempre.
- Nova tentativa com teto. Falhou 3 vezes, para e marca o erro.
- Recuperação depois de queda: job que ficou `em_execucao` quando o processo
  morreu volta para `pendente` ao subir de novo. Sem isso a fila trava sozinha.

## Painel — três telas (ARQUITETURA.md)

1. **Fila** — lista do que espera, player do vídeo, Aprovar, Rejeitar.
2. **Histórico** — o que já foi aprovado ou publicado.
3. **Ajustes** — de quanto em quanto tempo procurar carro novo, quais entram.

Rejeitar **exige motivo**, e motivo é **botão**, não texto livre. Texto livre
não ensina nada e não dá para agrupar (REGRAS-DE-NEGOCIO.md).

Motivos: foto ruim, texto errado, ritmo, dado errado, fundo. Já estão no banco
como enum fechado, com CHECK no SQLite.

O painel mostra as rejeições **agrupadas por motivo**. Isso é critério de pronto
do aprendizado, não enfeite.

## Identidade visual

Decisão do João: seguir a identidade do DeepSeek Harness — fonte, tamanho, cor,
espaçamento.

**Dependência:** o código do Harness precisa estar em `referencia/`. Enquanto não
estiver, o painel se constrói funcional e sóbrio, e a pintura entra depois.
Copiar identidade de memória seria inventar.

Licença MIT: ao copiar qualquer coisa do Harness, manter o aviso de licença junto.

## Escopo que NÃO entra

Sem cadastro, sem plano, sem cobrança, sem cliente do cliente se inscrevendo.
É ferramenta interna, um login para a equipe (ARQUITETURA.md).

Servidor escuta só em 127.0.0.1. Nunca 0.0.0.0.

## Falta pensado, do próprio documento

Aprovação precisa de aviso. Painel que alguém precisa lembrar de abrir não
funciona. Fica registrado como pendência de decisão do João: e-mail, Telegram
ou WhatsApp. Não escolher sozinho.

## Critério de pronto — cada um com prova

1. Fila roda um job por vez, com estado persistido no banco.
2. Timeout funciona: existe teste com job que trava.
3. Nova tentativa com teto de 3, provado em teste.
4. Job órfão (`em_execucao` sem processo) volta para `pendente` ao subir.
5. Três telas funcionando no navegador, servidas em 127.0.0.1.
6. Aprovar e Rejeitar gravam no banco. Rejeitar sem motivo é recusado.
7. Tela mostra rejeições agrupadas por motivo.
8. De ponta a ponta: carro lido -> texto escrito -> render na fila -> aparece
   na tela -> aprovo -> muda de estado. Sem passo manual no meio.
9. typecheck e build da raiz limpos.
