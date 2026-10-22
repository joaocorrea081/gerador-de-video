# P4 — Telas do que já existe e ninguém vê

**Dono:** `packages/portao`. **Depende de:** P3 ✅.

Este é o plano com mais trabalho parado: muita coisa está pronta, testada, e
não aparece em tela nenhuma.

## Itens que fecha

E6 E7 · F1 F3 · G1 G2 G3 G4 · H1 H2 H3 · C5

## O que é "pronto"

1. **Cinco provedores de IA** (G1-G4): lista vinda de `PROVEDORES`, escolha de
   provedor e modelo, botão "Testar conexão" dizendo modelo e tokens, lista de
   modelos REAIS da conta, dizendo quando é lista sugerida e não consultada,
   e preço por token quando o provedor informa. Chave nunca na tela.
2. **Tela de sites** (F1, F3): cadastrar com `testarSite` ANTES, mostrando a
   amostra de carros lidos; modo por site; aviso de que o modo "navegador da
   pessoa" não roda sozinho.
3. **Grade de publicação** (E6): dias e horários, por rede, com PREVISÃO de
   quando cada vídeo sairia antes de confirmar.
4. **Aprovar emenda no agendar** (E7): ao aprovar, oferecer as redes em que o
   vídeo passa e o horário sugerido.
5. **Parar tudo** (H3): botão visível, com quem pausou e quando.
6. **Carro vendido** (H1): alerta de "tirar do ar" e bloqueio de novo agendamento.
7. **Miniatura no calendário** (C5): quadro extraído do MP4, servido com cache.

## Funções já exportadas, prontas para chamar

Estão nos relatórios: `lerPlano`, `salvarPlano`, `preverEncaixe`,
`encaixarAprovados`, `aprovarComSugestao`, `obterPausa`, `pausarTudo`,
`retomarTudo`, `listarAlertasEstoque`, `conferirAntesDePublicar`,
`testarSite`, `cadastrarSiteDetectando`, `listarSites`, `definirSiteModo`,
`verificarNavegadorDaPessoa`, `PROVEDORES`, `testarConexao`, `listarModelos`.
