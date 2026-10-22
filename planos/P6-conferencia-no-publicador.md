# P6 — Conferência de preço ligada no publicador

**Dono:** `packages/portao` (`publicacao/publicador.ts`). **Depende de:** P4 ✅.

## Item que fecha

H2 (a metade que falta)

## Por que é separado

O motor está pronto e testado, mas DESLIGADO por padrão: o ajuste
`conferencia.exigir` vem falso para não quebrar o publicador que já roda.
Ligar sem a tela deixaria publicação parada sem ninguém saber por quê.

## O que é "pronto"

1. O publicador chama `conferirAntesDePublicar` antes de `reivindicarPublicacao`
   e só segue com `liberada === true`.
2. Não liberada NUNCA vira falha permanente: nada de `registrarFalhaPublicacao`.
3. A tela mostra o que mudou ("de R$ 69.900 para R$ 66.900") e oferece
   desmarcar ou tentar de novo depois de X minutos.
4. Só então `definirExigirConferencia(db, true)`.
5. Vídeo antigo sem referência de dado pede "refaça o vídeo", com texto claro.
