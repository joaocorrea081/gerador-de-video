# Etapa 5 — refazer o painel: critério de pronto

Escrito depois do João olhar o painel e reprovar. A reprovação foi de duas
coisas ao mesmo tempo, e a segunda é a maior:

1. **Identidade.** Ele quer a do DeepSeek Harness, idêntica.
2. **Funcionamento.** "Não está intuitivo." Faltam ações que o trabalho real
   exige, e o agendamento é um formulário cru que não ajuda ninguém.

## O que estava errado, item por item

| Problema | Hoje | Tem que ser |
|---|---|---|
| Refazer o vídeo | **não existe** | botão, com troca de fundo, ritmo e ordem de foto |
| Reescrever o texto | **não existe** | botão que chama o escritor de novo |
| Corrigir o texto à mão | **não existe** | edição direta, porque quem revisa o idioma é o cliente |
| Agendamento | dois campos crus | ligar/desligar, intervalo, última e próxima rodada, "rodar agora" |
| Progresso da fila | invisível | quantos faltam, qual está renderizando, tempo estimado |
| Estoque de carros | não tem tela | lista do que foi lido, com reler e gerar vídeo |
| Rejeição | só grava | tem que mostrar o que ela ensinou ao escritor |

## Identidade visual — já resolvida a dependência

O código do Harness foi atualizado para `0.2.1-rc.2` e o tema já está copiado
em `packages/portao/src/tema/`, com a licença MIT junto.

Use **os tokens deles**, não cor inventada:

- `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1..3`, `--dsw-alias-bg-overlay`
- `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`, `--dsw-alias-label-caption`
- `--dsw-alias-border-l1..l4`
- `--dsw-alias-button-primary-fill`, `--dsw-alias-button-info-fill`
- `--dsw-alias-interactive-bg-hover`, `--dsw-alias-interactive-bg-hover-danger`

Pilha de fonte: a do `dsh-base.css`. Tema claro é o padrão deles; o escuro
vem de `body[data-ds-dark-theme]`. **Os dois têm que funcionar.**

**Limite de marca, e não é negociável:** o `BRAND_GUIDELINES.md` deles proíbe
usar o nome "DeepSeek Harness" na marca de projeto de terceiro. O visual é
deles por MIT; o nome do produto é nosso.

## As telas

### 1. Fila — a tela de trabalho
Por carro: player, ficha lida, texto do anúncio, e as ações:
Aprovar · Rejeitar (5 motivos em botão) · Refazer vídeo · Reescrever texto ·
Editar texto.

Refazer vídeo abre as escolhas do cardápio — fundo, ritmo, ordem das fotos —
e **só** elas. O cardápio é fechado (REGRAS-DE-NEGOCIO.md).

### 2. Estoque
O que o leitor trouxe. Preço, km, quantas fotos, quando foi lido, se já tem
vídeo. Ações: reler do site, gerar vídeo.

### 3. Histórico
Aprovados e publicados, com o motivo quando foi rejeitado antes.

### 4. Agendamento
Ligar/desligar. Intervalo. Quais carros entram. Última rodada, próxima
rodada, e um botão "rodar agora". Sem isso ninguém confia que está rodando.

### 5. Ajustes
Provedor de IA e se a chave está presente (**nunca mostrar a chave**),
idioma do anúncio, e as rejeições agrupadas por motivo.

## Regras que continuam valendo

- Preço, ano e km vêm do dado. Editar texto **não** edita número.
- Motivo de rejeição é botão, recusado no servidor se vier vazio ou inválido.
- Nada publica sem aprovação.
- Servidor só em `127.0.0.1`.
- Refazer vídeo entra na fila como job novo. Concorrência continua 1.

## Critério de pronto

1. As 5 telas funcionando, com os tokens do Harness, claro e escuro.
2. Refazer vídeo enfileira job novo e o painel mostra o progresso.
3. Reescrever texto chama o escritor; sem chave, diz isso com clareza.
4. Editar texto à mão grava, e **não** deixa mexer em preço, ano ou km.
5. Agendamento liga, desliga, mostra última e próxima rodada, e roda agora.
6. Progresso da fila visível: quantos faltam e qual está renderizando.
7. Nenhuma cor inventada: tudo sai de token.
8. Testes cobrindo cada ação nova, inclusive as recusas.
9. typecheck e build limpos, e os 55 testes atuais continuam passando.
