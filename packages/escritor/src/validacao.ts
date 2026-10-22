// Valida e sanitiza o JSON cru devolvido pelo modelo.
//
// A REGRA QUE MATA O RESTO (ver REGRAS-DE-NEGOCIO.md e ETAPA-2-CRITERIO.md):
// preço, ano, quilometragem e modelo NUNCA vêm do modelo de linguagem. Este
// arquivo nunca faz spread do objeto bruto — cada campo da saída é lido
// explicitamente de `objeto.texto`, `objeto.cardapio` e `objeto.ordemFotos`.
// Qualquer outro campo que o modelo devolva (preco, ano, km, modelo, marca,
// ou o que for) é lido zero vezes e portanto nunca atravessa para a saída,
// mesmo que esteja presente no JSON — não é "aproveitado", não é "corrigido".

import { FUNDOS_ESCOLHA, RITMOS_ESCOLHA, type CardapioVideo } from "@gerador/core";
import { LIMITE_CORPO, LIMITE_TITULO, type EscolhaEscritor, type TextoAnuncio } from "./tipos.js";

/** Erro de validação: dispara nova tentativa (ver ETAPA-2-CRITERIO.md). */
export class ErroValidacao extends Error {}

function textoDeCampo(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || valor.trim().length === 0) {
    throw new ErroValidacao(`campo "${campo}" ausente ou vazio`);
  }
  return valor;
}

function validarTexto(bruto: unknown): TextoAnuncio {
  if (typeof bruto !== "object" || bruto === null) {
    throw new ErroValidacao('campo "texto" ausente ou não é objeto');
  }
  const objeto = bruto as Record<string, unknown>;
  const titulo = textoDeCampo(objeto.titulo, "texto.titulo");
  const corpo = textoDeCampo(objeto.corpo, "texto.corpo");

  if (titulo.length > LIMITE_TITULO) {
    throw new ErroValidacao(
      `texto.titulo tem ${titulo.length} caracteres, limite é ${LIMITE_TITULO}`,
    );
  }
  if (corpo.length > LIMITE_CORPO) {
    throw new ErroValidacao(`texto.corpo tem ${corpo.length} caracteres, limite é ${LIMITE_CORPO}`);
  }

  return { titulo, corpo };
}

function validarCardapio(bruto: unknown): CardapioVideo {
  if (typeof bruto !== "object" || bruto === null) {
    throw new ErroValidacao('campo "cardapio" ausente ou não é objeto');
  }
  const objeto = bruto as Record<string, unknown>;
  const fundo = objeto.fundo;
  const ritmo = objeto.ritmo;
  const fundosValidos: readonly string[] = FUNDOS_ESCOLHA;
  const ritmosValidos: readonly string[] = RITMOS_ESCOLHA;

  if (typeof fundo !== "string" || !fundosValidos.includes(fundo)) {
    throw new ErroValidacao(
      `cardapio.fundo "${String(fundo)}" fora do cardápio (opções: ${FUNDOS_ESCOLHA.join(", ")})`,
    );
  }
  if (typeof ritmo !== "string" || !ritmosValidos.includes(ritmo)) {
    throw new ErroValidacao(
      `cardapio.ritmo "${String(ritmo)}" fora do cardápio (opções: ${RITMOS_ESCOLHA.join(", ")})`,
    );
  }

  return { fundo: fundo as CardapioVideo["fundo"], ritmo: ritmo as CardapioVideo["ritmo"] };
}

/**
 * Sanitiza a ordem de fotos: índice que não existe na lista de fotos
 * disponíveis é descartado, mantendo o resto, sem quebrar (item 5 do
 * critério); índice repetido tem a duplicata removida, mantendo a primeira
 * ocorrência (item 6). Isso não é erro de validação — não dispara retentativa.
 */
function sanitizarOrdemFotos(bruto: unknown, quantidadeFotos: number): number[] {
  if (!Array.isArray(bruto)) {
    throw new ErroValidacao('campo "ordemFotos" ausente ou não é array');
  }

  const vistos = new Set<number>();
  const resultado: number[] = [];
  for (const item of bruto) {
    if (typeof item !== "number" || !Number.isInteger(item)) continue;
    if (item < 0 || item >= quantidadeFotos) continue; // índice inexistente: descarta
    if (vistos.has(item)) continue; // duplicata: descarta
    vistos.add(item);
    resultado.push(item);
  }
  return resultado;
}

/**
 * Valida e sanitiza a resposta cru do modelo. Lança ErroValidacao em JSON
 * inválido, campo fora do cardápio, ou texto acima do limite — essas três
 * disparam nova tentativa no chamador (ver escritor.ts). Índice de foto
 * inválido/duplicado é sanitizado aqui mesmo, sem erro.
 */
export function validarResposta(textoCru: string, quantidadeFotos: number): EscolhaEscritor {
  let bruto: unknown;
  try {
    bruto = JSON.parse(textoCru);
  } catch {
    throw new ErroValidacao("resposta não é um JSON válido");
  }

  if (typeof bruto !== "object" || bruto === null) {
    throw new ErroValidacao("resposta não é um objeto JSON");
  }
  const objeto = bruto as Record<string, unknown>;

  return {
    texto: validarTexto(objeto.texto),
    cardapio: validarCardapio(objeto.cardapio),
    ordemFotos: sanitizarOrdemFotos(objeto.ordemFotos, quantidadeFotos),
  };
}
