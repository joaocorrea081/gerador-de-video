// Conversão de texto lido do site em número. Compartilhado pelos adaptadores.
// Devolve undefined quando não dá para ler — nunca chuta (ETAPA-4-CRITERIO.md).

/**
 * Converte número em formato brasileiro ("82.700,00", "47.606") ou já
 * numérico/americano ("82700.00") para `number`. Ponto é separador de
 * milhar só quando há vírgula decimal depois dele; senão é separador
 * decimal (formato do JSON-LD, que vem em inglês: "82700.00").
 */
export function paraNumero(valor: unknown): number | undefined {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor !== "string") return undefined;

  const texto = valor.trim();
  if (texto === "") return undefined;

  let normalizado: string;
  if (texto.includes(",")) {
    // Formato brasileiro: ponto é milhar, vírgula é decimal. "82.700,00" -> "82700.00"
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else {
    // Sem vírgula: ou é inteiro com ponto de milhar ("47.606"), ou já é
    // decimal em formato americano do JSON-LD ("82700.00"). Distingue pelo
    // tamanho do que vem depois do último ponto: 3 dígitos = milhar.
    const partes = texto.split(".");
    if (partes.length > 1 && partes[partes.length - 1]!.length === 3) {
      normalizado = partes.join("");
    } else {
      normalizado = texto;
    }
  }

  const numero = Number.parseFloat(normalizado.replace(/[^\d.-]/g, ""));
  return Number.isFinite(numero) ? numero : undefined;
}

export function paraAno(valor: string | undefined): number | undefined {
  if (!valor) return undefined;
  // "2022/2023" (fabricação/modelo) ou "2023": usa o último ano, que é o ano-modelo.
  const anos = valor.match(/\d{4}/g);
  if (!anos || anos.length === 0) return undefined;
  const numero = Number.parseInt(anos[anos.length - 1]!, 10);
  return Number.isFinite(numero) ? numero : undefined;
}

