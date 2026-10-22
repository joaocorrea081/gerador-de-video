# P5 — Redes sociais como conector

**Dono:** `packages/core` e `packages/portao`. **Depende de:** P4 ✅.

## Item que fecha

E8

## A decisão, e o porquê

O João pediu "igual ao DeepSeek Harness, a pessoa instala e ativa". O sistema de
plugin deles é o Cordis: runtime completo com sandbox e metade no navegador,
feito para carregar código de terceiro dentro de um harness de agente. Para
três redes sociais isso é martelo para matar mosca.

Pesquisei bibliotecas prontas de postagem. Nenhuma serve:
- `upload-post` manda o vídeo e as credenciais do cliente por um serviço pago
  de terceiro.
- `instagram-publisher` e `instagrapi` usam API privada não oficial — é o que
  derruba a conta, e a conta seria a da revenda.
A parte difícil nunca foi a chamada HTTP; é App Review, auditoria e token.

**O caminho:** registro de conectores, não runtime de plugin. Cada rede é um
arquivo que se declara; a tela se monta a partir do registro; acrescentar uma
rede nova é escrever um arquivo, sem tocar no resto.

## O que é "pronto"

1. Um registro de conectores, no mesmo espírito do `PROVEDORES` da IA.
2. A tela de Contas e a de Prontidão se montam a partir do registro.
3. Ativar e desativar uma rede sem mexer em código.
4. Um conector novo entra sem alterar nenhum arquivo existente — prove com um
   conector de exemplo em modo seco.
