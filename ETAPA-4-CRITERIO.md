# Etapa 4 — o leitor: critério de pronto

Escrito antes de implementar, com recon feito no site real em 20/10/2026.

## Situação honesta

O `COMECAR.md` manda PARAR esta etapa até o cliente mandar o link do site dele.
Isso continua valendo para o site DELE: estimar raspagem de site que ninguém
abriu é chute.

O que muda: o João mandou testar em site de revenda real da internet. Então o
MOTOR do leitor se constrói e se prova agora, contra site real. O que fica para
quando o link chegar é só o mapeamento do site específico dele.

## Recon já feito (não refaça)

Alvo de teste: `rota66bh.com.br`, revenda real em Belo Horizonte.

- Plataforma: **AutoCerto** (`static.autocerto.com`), usada por muita revenda
  brasileira. `minasautomoveisbh.com.br` roda a mesma, com `robots.txt` idêntico.
- `robots.txt` do site: `User-agent: * / Allow: /`. Catálogo liberado.
  Proíbe só endpoints internos (`/Home/Obter*`) e `/Upload/`. **Respeite.**
- Listagem: `/Veiculos`. Detalhe: `/Veiculo/<slug>/<id>/detalhes`.
- **O dado vem em JSON-LD** (`application/ld+json`, schema.org Vehicle):
  `name`, `price`, `priceCurrency`, `mileageFromOdometer`, marca, ano.
- Fotos: `https://www.autocerto.com/fotos/<lojaId>/<veiculoId>/<n>_<hash>.jpg`
- **Fotos são 1024x768 (4:3). Não existe variante maior.** Testado: `fotosgrandes/`,
  `g1_`, `_g` → todos 404. A Etapa 1 já foi desenhada em cima disso.
- As fotos NÃO estão no HTML da home: vêm por `data-src`, lazy load.
  `curl` pega a casca. Confirma a necessidade de Playwright (INFRA.md).

## Ordem de leitura do dado, obrigatória

1. **JSON-LD primeiro.** É estruturado e estável. Se existir e validar, usa.
2. **Seletores de CSS como plano B**, só para o que faltar.
3. Nunca "deduzir" número que não foi lido. Campo ausente fica ausente.

Preço, ano e km vêm daqui e vão direto ao montador. O modelo de linguagem nunca
os escreve (REGRAS-DE-NEGOCIO.md).

## Comportar-se como gente (INFRA.md)

- User-Agent de navegador real, viewport normal.
- Esperar carregamento de verdade; rolar a página para disparar o lazy load,
  como faz `referencia/captura-portfolio.js`.
- Intervalo entre páginas. Nada de 40 requisições por segundo.
- Respeitar `robots.txt`, inclusive o `Disallow`.

## Filtro de qualidade de foto (ARQUITETURA.md)

- Resolução mínima: descartar abaixo de 800px de largura.
- Descartar duplicata (mesma imagem repetida no carrossel).
- Carro com 1 foto só: funciona (a Etapa 1 já prova).
- Carro com 0 foto: funciona, gera o cartão só de dado.

## Critério de pronto — cada um com prova

1. Lê a listagem e devolve a lista de carros com URL de detalhe.
2. Lê a página de detalhe e devolve ficha + fotos, preferindo JSON-LD.
3. Baixa as fotos para o disco e registra no banco (tabelas `produto` e `foto`).
4. Respeita `robots.txt`: existe teste provando que caminho proibido é recusado.
5. Ritmo controlado: intervalo configurável entre requisições, padrão >= 2s.
6. Campo ausente fica ausente. Existe teste com página sem preço.
7. Roda de ponta a ponta contra `rota66bh.com.br` e grava pelo menos 3 carros.
8. O resultado alimenta o montador da Etapa 1 e sai MP4, sem edição manual.
9. typecheck e build da raiz limpos.

## Prova que eu vou conferir

- JSON do carro lido, colado na resposta, com preço e km conferidos à mão
  contra a página aberta.
- `pnpm cli status` mostrando as contagens subindo.
- Um MP4 gerado a partir de carro lido do site, de ponta a ponta.
