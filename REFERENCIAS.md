# Referências para extrair

## DeepSeek Harness

Local: `/mnt/Dados/01-ideias/deepseek-harness`
Também em `/home/joao/Documentos/deepseek-harness`, e tem atalho `dsh-harness` no sistema.

Harness de agente de código aberto da DeepSeek. Monorepo em pnpm, TypeScript,
Node 22+. Arquitetura em que tudo é plugin, sobre o Cordis.

**Licença MIT.** Pode reaproveitar código à vontade, mantendo o aviso de licença.

### Por que o João apontou isso

Ele quer a parte de **chat** como modelo para a interface deste projeto. O harness já
tem interface web pronta com conversa, sessão e histórico.

### O que vale olhar, por pacote

| Pacote | Para que serve neste projeto |
|---|---|
| `apps/web` e `packages/web/web` | a interface web e o chat. É o motivo principal de olhar. |
| `packages/jobs` | fila de trabalho. A renderização precisa exatamente disso: estado por item, concorrência, nova tentativa. |
| `packages/schedule` | agendamento. Serve para "procurar carro novo de hora em hora". |
| `packages/session` e `packages/storage` | persistência e histórico. Base para a fila de aprovação e o histórico de publicação. |
| `packages/llm` | abstração de modelo. Pode evitar escrever o cliente do Claude do zero. |
| `packages/host/webserver` | servidor web. |
| `packages/settings` | tela de ajustes, que é uma das três telas do painel. |

### Como usar: copiar, não depender

Decisão do João: **copiar o código para dentro do projeto e mexer nele à vontade.**
Nada de instalar o harness como dependência.

Com isso, o aviso de *developer preview* do README não importa. Se eles mudarem o
programa deles amanhã, a nossa cópia continua igual. O que estiver bom fica, o que
der para melhorar a gente melhora.

Só mantenha o aviso de licença MIT junto do que for copiado.

A ordem prática: ler `packages/jobs` e `packages/web/web` primeiro, porque são os
dois que resolvem mais problema nosso (fila de render e chat). Pegar o que serve,
adaptar, seguir.

## BrowserSkill: a outra forma de navegar

O João já usa e funciona bem. Vale conhecer antes de decidir como o leitor lê o site.

- Extensão do Chrome, id `hhcmgoofomhgciiibhipgmgkgnoenaoi`, versão 0.3.3
- CLI `bsk`, já instalado em `~/.local/bin/bsk`, com daemon e estado em `~/.bsk/`
- Em `~/.bsk/dsh-starts/` fica a integração com o DeepSeek Harness

A descrição da própria extensão: *"Let AI agents use your logged-in browser in a
separate Agent Window, without interrupting your work. Powered by the bsk CLI."*

Permissões que ela pede: `debugger` (o protocolo de depuração do Chrome),
`scripting`, `tabs`, `windows`, `webNavigation` e `<all_urls>`.

**Por isso o repositório do DeepSeek Harness não tem Playwright no agente.** A
navegação por navegador não vem no núcleo deles: vem por plugin, usando esta
extensão de fora. Quem instala, navega com o navegador de verdade.

### Playwright ou BrowserSkill para o leitor deste projeto

| | Playwright | BrowserSkill |
|---|---|---|
| Navegador | abre um próprio, limpo | usa o do João, já logado |
| Sessão e cookie | nenhum, perfil novo | sessão real de quem está logado |
| Roda sozinho | sim, agendado, sem ninguém na frente | não, precisa do navegador aberto |
| Instalação no servidor | Chromium e bibliotecas | nada, mas depende da máquina com navegador |
| Parece humano | precisa configurar | já é |

**Para este projeto, o leitor deve usar Playwright.** O catálogo da revenda é público,
não precisa de login, e a leitura tem que rodar sozinha de hora em hora. Depender
do navegador do João estar aberto quebra isso.

**Quando o BrowserSkill vale:** se o site exigir login, ou se bloquear o Playwright
mesmo com User-Agent e ritmo ajustados. Aí é a saída, e já está instalado.
