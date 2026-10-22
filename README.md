# Gerador de vídeo

Pega os produtos do site de uma empresa e transforma cada um num vídeo curto
para redes sociais, com aprovação humana antes de publicar.

Feito primeiro para uma revenda de carros, mas a máquina é genérica: troca o
template e serve para imobiliária, e-commerce, qualquer catálogo.

> Em desenvolvimento. Este README é provisório.

## As quatro partes

| Parte | O que faz | Com o quê |
|---|---|---|
| Leitor | lê o site e baixa foto e ficha | Playwright |
| Escritor | escreve o anúncio e escolhe do cardápio | Claude, OpenAI, Gemini, DeepSeek ou OpenRouter |
| Montador | monta o vídeo vertical de ~30s | Remotion |
| Portão | painel de aprovação, calendário e publicação | Node + SQLite |

## Regras que não se negociam

- A foto do produto é a real, do estoque. **Nunca gerada por IA.**
- Preço, ano e ficha vêm do dado lido no site, **nunca do modelo de linguagem**.
- **Nada publica sem uma pessoa aprovar.**
- A IA escolhe de um cardápio fechado. Ela não desenha.

O porquê de cada uma está em `REGRAS-DE-NEGOCIO.md`.

## Rodar

Precisa de Node 22+, pnpm e ffmpeg.

```bash
pnpm install
cp .env.example .env     # e coloque a sua chave de API
pnpm rodar 3             # lê 3 carros do site e monta os vídeos
pnpm dev:portao          # painel em http://127.0.0.1:3080
```

O painel sobe só em `127.0.0.1`. Nada é exposto para fora da máquina.

## Chaves de API

Ficam **só** em variável de ambiente, nunca no código e nunca no banco.
Veja `.env.example`.

## Licença de terceiros

O tema visual do painel vem do [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
sob licença MIT. O texto da licença está em
`packages/portao/src/tema/LICENSE-deepseek-harness` e precisa continuar lá.

O **Remotion** tem licença própria: grátis para pessoa física e empresa de até
3 pessoas; acima disso exige licença paga. Veja `RESTRICOES.md`.
