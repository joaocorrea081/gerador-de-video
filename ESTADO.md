# Estado do projeto — 21/10/2026

## Resumo

As quatro partes estão construídas, testadas e rodando de ponta a ponta:
site real -> dado -> vídeo -> fila -> painel -> aprovação.

**162 testes passando.** Build do zero limpo. Typecheck limpo.

## O que foi provado, com prova rodada

| Etapa | O que faz | Prova |
|---|---|---|
| 0 — esqueleto | monorepo, banco SQLite, servidor | build/typecheck limpos, CHECK e FK barrando dado inválido |
| 1 — montador | Remotion 1080x1920, 30fps, ~31s | 6 MP4 com ffprobe; 3 fundos, 2 ritmos, 8/3/1/0 fotos |
| 2 — escritor | Claude ou DeepSeek, saída validada | 22 testes; preço inventado pelo modelo é descartado |
| 4 — leitor | Playwright no site da revenda | 4 carros reais, 56 fotos; preço conferido à mão |
| 3 — fila e portão | fila 1 por vez, telas | aprovar/rejeitar testado no navegador |
| 5 — painel refeito | 5 telas, identidade do Harness | 105 testes; cada tela clicada no navegador |

## Números medidos nesta máquina

- Render: **47 segundos** de parede por vídeo de 31s.
- 40 carros = cerca de 31 minutos de fila.
- MP4 de 31s: 12 a 13 MB.
- Fotos da revenda: 1024x768. Não existe maior no CDN.

## Regras de negócio que o código cumpre, e onde

- **Foto real, nunca gerada por IA.** Não existe chamada a modelo de imagem
  em lugar nenhum do código.
- **Preço, ano e km vêm do dado.** `packages/escritor/src/validacao.ts` lê só
  os campos permitidos; campo inventado pelo modelo nunca é lido.
- **Cardápio fechado.** Fundo, ritmo e ordem de fotos. Validado contra o tipo.
- **Nada publica sem aprovar.** O servidor recusa rejeição sem motivo, com
  HTTP 400. Motivo é botão, e a recusa é no servidor, não só na tela.
- **Aprendizado é memória, não treinamento.** Teto fixo de 10 rejeições por
  categoria, com teste provando o teto.


## Etapa 5 — o painel refeito (21/10/2026)

O João olhou o painel e reprovou: feio e pouco intuitivo. Refeito inteiro.

**Identidade:** o DeepSeek Harness foi atualizado de `0.1.0-rc.8` para
`0.2.1-rc.2` e o sistema de design dele foi copiado para
`packages/portao/src/tema/`, com a licença MIT junto. São os tokens
`--dsw-alias-*` deles, não cor inventada: existe teste que reprova cor
escrita à mão.

**Limite de marca:** o `BRAND_GUIDELINES.md` deles proíbe usar o nome
"DeepSeek Harness" na marca de projeto de terceiro. O visual é deles por MIT;
o nome do produto é nosso.

**O que passou a existir, e não existia:**

| Ação | Onde |
|---|---|
| Refazer vídeo (fundo, ritmo, ordem das fotos) | Fila |
| Reescrever texto com a IA | Fila |
| Editar texto à mão | Fila |
| Progresso da fila, com estimativa do histórico real | Fila |
| Estoque, com reler do site e gerar vídeo | tela nova |
| Agendamento de verdade, com filtro e "rodar agora" | tela nova |
| Tema claro e escuro | topo |

**Blindagem que eu testei atacando:** a rota de editar texto recebeu
`preco: 1, ano: 1900, modelo: "Ferrari"` e respondeu 200 **sem alterar**
preço, ano nem modelo. O dado continua vindo do site.

**Erro para gente, não para programador:** sem chave, a tela diz
"Falta configurar a chave de acesso da inteligência artificial. Veja em
Ajustes", com atalho. O detalhe técnico fica na API e no log.


## Etapa 6 — produto premium (21/10/2026)

O João: "a barra tem que ser na lateral, falta a conexão com as redes sociais
para postagem e agendamento, me entrega um produto prêmio".

**Navegação lateral**, recolhível, com contador por seção, virando gaveta em
tela estreita. Nove seções em quatro grupos.

**Telas novas:** Calendário (mês e semana, hora de Brasília), Publicações
(estado por rede, lado a lado), Contas (conectar e renovar, token nunca na
tela), Prontidão (o que falta por rede, com prazo real).

**Na Fila:** validação por rede com motivo, legenda por rede com limite de
cada uma, e prévia de como fica no feed.

**Motor de publicação, provado em modo seco:**

| Risco | Como está resolvido |
|---|---|
| Publicar duas vezes | chave de idempotência por (vídeo, rede) |
| Plataforma fora do ar | espera crescente de 5min a 4h, teto de 10 |
| Processo cair no meio | publicação órfã vira "verificar", nunca republica |
| Estourar limite | Facebook 30/24h; Instagram consultado antes de postar |
| Barrado como spam | espaçamento mínimo entre publicações |
| Vídeo fora de especificação | barrado antes de sair, com motivo |
| Token que rotaciona | o novo é gravado antes de publicar |
| Vazar segredo | redigido em toda resposta e todo log |

**Conserto de vídeo:** o corpo do anúncio aparecia como cartão preto opaco nos
últimos 7 segundos, deixando o Reel terminar sem carro nenhum. Agora é véu
translúcido sobre a foto.

**O que NÃO dá para provar, e está dito na tela:** publicar de verdade exige
app do cliente aprovado. TikTok sem auditoria não publica em público, de jeito
nenhum. Facebook exige App Review. A tela de Prontidão diz "Nenhuma rede está
pronta para publicar de verdade" enquanto for verdade.

## O que falta, e de quem depende

### Depende do João

1. ~~Chave de API~~ **FEITO em 21/10/2026.** A chave do DeepSeek veio do
   projeto CarameloVet. Chamada real conferida: JSON válido na primeira
   tentativa, 435 tokens de entrada e 114 de saída. O texto escrito aparece
   no painel E dentro do vídeo.

2. ~~Identidade do Harness~~ **FEITO em 21/10/2026.** Harness atualizado para
   `0.2.1-rc.2` e o sistema de design copiado para `packages/portao/src/tema/`,
   com a licença MIT junto.

3. **Canal de aviso de aprovação.** E-mail, Telegram ou WhatsApp. Painel que
   alguém precisa lembrar de abrir não funciona. Decisão comercial.

4. **Trilha de áudio.** Hoje o MP4 tem faixa silenciosa, para não quebrar nas
   plataformas. Música licenciada é decisão de quem paga a licença.

### Depende do cliente

5. **O link do site da revenda.** O leitor tem adaptador: o motor está pronto
   e provado contra site real. Falta escrever o adaptador do site dele, que é
   trabalho pequeno DEPOIS de ver a página. Antes disso é chute.

6. **Idioma.** Romeno ou russo. O idioma já é parâmetro, não constante. Mas a
   revisão do texto é papel do cliente — ninguém aqui lê romeno.

### Fora de escopo, por escrito

- Publicação automática em Instagram, Facebook e TikTok. A estrutura existe,
  as credenciais e a auditoria das plataformas não.
- Treinar ou ajustar modelo. Nunca foi prometido e não existe aqui.

## Pendência comercial registrada

Licença do Remotion: grátis até 3 pessoas; de 4 em diante exige Company
License. O João decidiu seguir sem perguntar o número de funcionários ao
cliente. Sugestão registrada: uma linha no contrato passando a
responsabilidade das licenças de software para o cliente.
