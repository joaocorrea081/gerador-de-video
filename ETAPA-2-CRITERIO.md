# Etapa 2 — o escritor: critério de pronto

Escrito antes de implementar.

## O que esta etapa faz

Recebe a ficha do carro (dado lido) e devolve, em JSON validado:

- o texto do anúncio (ele escreve)
- as escolhas do cardápio fechado: fundo, ritmo, ordem das fotos

Nada mais. Ele não desenha, não escolhe layout, não escreve número.

## A regra que mata o resto

**Preço, ano, quilometragem e modelo NUNCA saem do modelo de linguagem.**

Esses campos vão direto do dado lido para o montador. Se o JSON de volta do
modelo contiver qualquer um deles, o validador **descarta o campo**, não
"aproveita". Modelo que inventa preço em anúncio de carro é propaganda enganosa
(REGRAS-DE-NEGOCIO.md).

## Provedor: interface, não acoplamento

O entregável prometido ao cliente é **Claude via API, com a chave DELE**
(ESCOPO-CLIENTE.md). Assinatura é proibida para robô (RESTRICOES.md).

Mas o teste de encanamento roda com crédito de DeepSeek que o João já tem.

Então: uma interface `Provedor` com duas implementações, escolhidas por variável
de ambiente. Trocar provedor é uma linha no `.env`, não uma refatoração.

**Limite honesto, registrado:** DeepSeek prova que o fluxo funciona. Ele NÃO
prova que a copy ficou boa, principalmente em romeno. Qualidade de texto entre
modelos não transfere. A validação final da copy roda no Claude.

## Validação e nova tentativa

1. JSON inválido → nova tentativa, até 3, com o erro no pedido seguinte.
2. Campo fora do cardápio (ex.: fundo "azul") → rejeita e tenta de novo.
3. Texto acima do limite de caracteres → rejeita e tenta de novo.
4. Estourou as 3 tentativas → erro explícito. **Nunca** cai num texto padrão
   fingindo que deu certo.
5. Índice de foto que não existe → descarta o índice, não quebra.

## Memória de rejeição (o "aprendizado")

Não existe fine-tuning. É memória (REGRAS-DE-NEGOCIO.md).

- Lê as rejeições do banco, agrupadas por motivo.
- Injeta no pedido as **10 mais recentes de cada categoria**. Teto fixo,
  porque sem teto o custo e a demora sobem toda semana até estourar.

## Critério de pronto — cada um com prova

1. Interface de provedor com Claude e DeepSeek, trocável por env.
2. Chave lida só de variável de ambiente. Zero chave em código ou em log.
3. Saída validada contra o cardápio tipado de packages/core.
4. Teste provando que preço/ano/km vindos do modelo são descartados.
5. Teste provando as 3 tentativas e o erro explícito ao fim.
6. Teste provando o teto de 10 rejeições por categoria.
7. Rodada real contra DeepSeek, com o JSON de volta colado na prova.
8. Custo da chamada medido e registrado (tokens de entrada e saída).
9. typecheck e build da raiz limpos.
