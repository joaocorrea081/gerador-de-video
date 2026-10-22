// Contrato que qualquer site de revenda implementa. Hoje só existe o
// adaptador AutoCerto (adaptadores/autocerto.ts). Quando chegar o link do
// cliente, se a plataforma dele for outra, escreve-se outro adaptador aqui —
// o leitor (listagem.ts, ficha.ts) não muda.

/**
 * Ficha do veículo, só com o que foi de fato lido. Campo ausente fica
 * `undefined` — nunca 0, nunca "consulte", nunca estimado (ETAPA-4-CRITERIO.md).
 */
export interface FichaLida {
  marca?: string;
  modelo?: string;
  ano?: number;
  km?: number;
  preco?: number;
  moeda?: string;
  cor?: string;
  combustivel?: string;
  cambio?: string;
  portas?: number;
  /**
   * Texto livre que a revenda escreveu sobre o carro, como veio. É FONTE para
   * o escritor, nunca saída: pode ter texto genérico da loja (financiamento,
   * endereço). Ausente quando a página não traz.
   */
  descricaoRevenda?: string;
  /** Opcionais listados na página, um por item. Os adaptadores devolvem [] quando não há lista. */
  opcionais?: string[];
  /** URLs completas das fotos do carro, na ordem em que aparecem na página. */
  fotos: string[];
}

export interface Adaptador {
  nome: string;

  /** URL da página de listagem do estoque (ex: "https://site/Veiculos"). */
  urlListagem(baseUrl: string): string;

  /**
   * Extrai, do HTML já renderizado da listagem, as URLs completas de detalhe
   * de cada veículo.
   */
  extrairUrlsDetalhe(html: string, baseUrl: string): string[];

  /**
   * Extrai a ficha do veículo a partir do HTML já renderizado da página de
   * detalhe (depois de rolar e esperar o lazy load). Ordem obrigatória:
   * JSON-LD primeiro, seletor de CSS só como plano B. `url` (opcional) é o
   * endereço da página, usado para completar links relativos de foto.
   */
  extrairFicha(html: string, url?: string): FichaLida;
}
