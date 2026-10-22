# Publicação automática

Só leia quando chegar na etapa 3. Nada aqui bloqueia as etapas 1 e 2.

**O recado principal:** isso não é trabalho de código, é trabalho de calendário.
As horas de programação são 25 a 35. A espera por aprovação das plataformas é de
3 a 10 semanas e não depende de nós.

Se o cliente entender "20 horas" como "em uma semana está postando", perdemos ele
na semana 3 sem ter errado uma linha.

## Ordem obrigatória: Instagram, Facebook, TikTok

Não é preferência. É o único caminho que entrega alguma coisa rápido.

## Instagram

Duas APIs. A *Instagram API with Instagram Login* não exige Página do Facebook.
A *com Facebook Login* exige, e é a única que permite upload sem URL pública.

Conta precisa ser profissional, Business ou Creator. Pessoal não publica.

**O atalho que decide o prazo:** publicar nas contas **do próprio dono do app** é
Standard Access, **sem App Review**. Publicar em contas de terceiros exige
Advanced Access, com App Review e verificação de empresa.

Então o app tem que ser **do cliente**, publicando só nas contas dele. Assim o
Instagram pode entrar no ar rápido.

Reels funciona por API: 3 segundos a 15 minutos, até 300 MB, largura máxima 1920,
H264 ou HEVC com AAC, 23 a 60fps, 9:16 recomendado, `moov atom` no começo do
arquivo e sem edit lists.

Limite por dia: a documentação diz 100 num lugar e 50 em outro. A fonte de verdade
é consultar `GET /{ig-id}/content_publishing_limit` antes de postar.

## Facebook

Reels de Página vai por `POST /{page-id}/video_reels`, em três fases: START, upload
e FINISH. Desde setembro de 2025 todo vídeo no Facebook aparece como reel de
qualquer jeito.

Permissões: `pages_show_list`, `pages_read_engagement` e `pages_manage_posts`.
Todas exigem **Advanced Access**, ou seja, App Review.

Especificação mais apertada que a do Instagram: **9:16 obrigatório**, 1080x1920
recomendado, mínimo 540x960, **3 a 90 segundos**, AAC-LC 48kHz estéreo a 128kbps
ou mais.

Limite: **30 publicações por API em 24 horas.**

Não existe publicar no Instagram e no Facebook numa chamada só. São dois fluxos.

## TikTok

**Aqui está o bloqueio de verdade.** App sem auditoria só publica com visibilidade
`SELF_ONLY`, em contas privadas, e no máximo 5 usuários por 24 horas. Tentar
público sem auditoria devolve erro.

Ou seja: **sem auditoria aprovada, não existe publicação automática pública no
TikTok. Nenhuma.**

A auditoria exige:
- site público completo, com Política de Privacidade e Termos visíveis sem menu
- de 1 a 5 vídeos demonstrando todos os escopos de ponta a ponta
- domínio do vídeo igual ao do site
- primeira submissão feita no ambiente sandbox

E exige uma interface específica, que é critério de aprovação e não enfeite:
consentimento explícito antes de enviar, a frase literal *"By posting, you agree
to TikTok's Music Usage Confirmation."*, seletor de privacidade manual sem valor
padrão, e botões de conteúdo comercial.

**O painel de três telas não tem nada disso.** É trabalho extra, e é o motivo mais
comum de reprovação.

Prazo oficial: dias a duas semanas. Relatos de desenvolvedores: 2 a 6 semanas, com
pelo menos uma reprovação no caminho.

## Prazos reais

- Meta, oficial: decisão em uma semana. Relatos convergentes em 2026: cerca de 20
  dias, e cada reprovação reinicia o relógio.
- TikTok, oficial: dias a duas semanas. Relatos: 2 a 6 semanas.

## O que o cliente precisa providenciar

Diga isso cedo. Sem essas coisas, nada publica, e a culpa vai sobrar para nós.

- conta de Instagram profissional
- Página do Facebook com papel de administrador
- Business Portfolio verificado, com documento da empresa
- domínio com acesso ao DNS
- site público com Política de Privacidade e Termos, para a auditoria do TikTok
- alguém que leia romeno para aprovar o texto

**Os apps da Meta e do TikTok têm que ser do cliente, não do João.** Se forem do
João e a conta levar punição por conteúdo gerado por IA, quem morre é a conta de
desenvolvedor dele.

## Detalhes que quebram em silêncio

- **Token.** O refresh token do TikTok dura 365 dias **e pode rotacionar**: se o
  novo não for gravado, para de funcionar. O token de Página do Facebook é curto
  por padrão; para rodar sempre, o caminho é System User token.
- **Falha de publicação é normal, não exceção.** Em fevereiro de 2026 uma regressão
  da Meta derrubou publicação de vídeo por API por cerca de 20 horas. Precisa de
  máquina de estados por vídeo, idempotência e nova tentativa com espera crescente.
- **Risco de spam no TikTok.** Trinta vídeos com o mesmo template e a mesma trilha
  podem ser barrados como spam por semelhança de conteúdo. É risco direto do
  template fixo: precisa de variação e espaçamento entre publicações.
- **Rótulo de conteúdo gerado por IA.** Instagram tem `is_ai_generated`, Facebook
  também, TikTok tem `is_aigc`. Se entrar qualquer clipe generativo, declarar.
- **URL pública.** O Instagram exige mídia hospedada em servidor público. O TikTok,
  no modo PULL_FROM_URL, exige verificação de propriedade do domínio por DNS.
  Então bucket público mais domínio mais DNS entram na conta.
