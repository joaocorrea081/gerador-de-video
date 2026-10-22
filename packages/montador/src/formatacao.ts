// Formata só o que existe. Campo ausente vira string vazia — nunca um
// placeholder que pareça dado real (ver ETAPA-1-CRITERIO.md).

const FORMATADOR_PRECO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const FORMATADOR_KM = new Intl.NumberFormat("pt-BR");

export function formatarPreco(preco: number | undefined): string {
  if (preco === undefined || !Number.isFinite(preco)) return "";
  return FORMATADOR_PRECO.format(preco);
}

export function formatarKm(km: number | undefined): string {
  if (km === undefined || !Number.isFinite(km)) return "";
  return `${FORMATADOR_KM.format(km)} km`;
}

export function formatarAno(ano: number | undefined): string {
  if (ano === undefined || !Number.isFinite(ano)) return "";
  return String(ano);
}
