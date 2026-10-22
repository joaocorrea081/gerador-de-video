# Onde roda

> Resumo: roda na máquina da pessoa, com interface no `localhost`, igual ao
> DeepSeek Harness. Mas, ao contrário dele, precisa de navegador de verdade para
> ler o site do cliente. Servidor fica como opção futura.

## Decisão: roda na máquina

O alvo é **rodar na máquina da pessoa**, não num servidor. Servidor é opção
depois, se e quando fizer sentido.

Funciona como o DeepSeek Harness: sobe um servidor local, a pessoa abre
`localhost` no navegador dela e usa a interface por ali.

Por que isso é melhor aqui:

- a máquina já tem Chrome instalado, então o Playwright roda sem configurar nada
- some o problema de dimensionar VPS para renderizar vídeo
- some a instalação de dezenas de bibliotecas de sistema do Chromium em Linux sem tela
- some o custo mensal de servidor
- o dado e as fotos ficam na máquina de quem é dono deles

Se depois o cliente quiser rodar 24 horas sem o computador ligado, aí se discute
servidor. Mas o entregável da etapa 1 não precisa disso.

## Duas coisas exigem navegador de verdade

**O leitor.** Site de revenda carrega foto por JavaScript, com rolagem preguiçosa.
`curl` traz a casca da página sem as fotos. E muito site bloqueia cliente HTTP
simples: sem User-Agent de navegador, sem cookie, sem executar script, a resposta
vem vazia, com captcha ou 403.

Playwright resolve porque **é** um navegador: executa o script, espera a imagem
carregar, guarda cookie e se comporta como visita normal.

**O montador.** Remotion renderiza rodando Chrome headless. Não existe caminho
sem navegador aqui.

## Como o DeepSeek Harness resolve isso

Vale registrar porque é fácil se confundir olhando só o repositório.

No **núcleo** deles não existe automação de navegador. As ferramentas web são
`web_search`, que consulta um provedor de busca, e `web_fetch`, que baixa a URL
por HTTP e converte o HTML em markdown. Isso é `curl` com formatação, e não
resolveria o site da revenda.

A navegação de verdade vem **por plugin**, com a extensão **BrowserSkill** mais o
CLI `bsk`. Com ela, o agente dirige o navegador real da pessoa, já logado, numa
janela separada de agente. O João já tem isso instalado e funcionando.
Detalhe em `REFERENCIAS.md`.

E quando eles dizem `dsh web`, sobem um servidor em `127.0.0.1:3080` e abrem no
navegador do usuário. Ali o navegador é a **tela**, que é coisa diferente do
navegador que o agente dirige.

Para este projeto: copie deles a interface, o chat e a fila de jobs. Para ler o site,
use Playwright, com BrowserSkill como plano B se o site bloquear ou exigir login.

## Comportar-se como gente ao ler o site

- User-Agent de navegador real, não o padrão de biblioteca
- viewport de tamanho normal
- esperar o carregamento de verdade, não rolar tudo em 200 milissegundos
- intervalo entre páginas, não 40 requisições por segundo
- respeitar o `robots.txt` do cliente e combinar o ritmo com ele

Como o site é do próprio cliente, é razoável pedir que ele libere o IP.

## O que precisa estar instalado

- Node 22 ou mais novo
- Chromium e as bibliotecas do Playwright (numa máquina de trabalho, já vem)
- ffmpeg
- banco local, em arquivo, na própria máquina. Decisão do João: nada de serviço externo.
- espaço em disco: 10 a 25 MB por vídeo, mais as fotos originais
- a chave de API do Claude **do cliente**, guardada como segredo, nunca no código

## Fila, não paralelo

Renderizar dois vídeos ao mesmo tempo numa máquina comum derruba os dois. Fila com
um worker por vez, estado por item, timeout e nova tentativa.

Quarenta carros não são quarenta renderizações simultâneas. São uma fila que leva
horas, e a interface precisa mostrar isso sem parecer travada.

## Se um dia for para servidor

Aí sim entra o custo que não existe rodando local: Chromium e todas as bibliotecas
de sistema em Linux sem tela, memória suficiente para Chrome headless mais
renderização, e disco.

A VPS atual do João, uma AWS t3.small de 2 GB, não dá conta disso junto com o que
já roda nela.
