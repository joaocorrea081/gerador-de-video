// Interface de provedor de IA — não acoplamento (ver ETAPA-2-CRITERIO.md).
// Quatro implementações (Anthropic, DeepSeek, OpenAI, Google Gemini), todas
// por `fetch` nativo, sem SDK. O catálogo (id, nome, modelos) está em
// registro.ts; a escolha por configuração está em configuracao.ts.
//
// A chave é lida SÓ de variável de ambiente, nunca de código, nunca de banco,
// nunca logada. Nada aqui chama console.*. As mensagens de erro nunca incluem
// a chave nem o corpo/cabeçalho da resposta HTTP (que poderiam ecoar dado
// sensível): só texto fixo escrito aqui, mais o código de status.

export interface PedidoProvedor {
  sistema: string;
  usuario: string;
  /** Teto de tokens de saída. Padrão: TOKENS_SAIDA_PADRAO. */
  maxTokens?: number;
}

export interface RespostaProvedor {
  textoCru: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** Modelo que respondeu, quando o provedor informa. */
  modelo?: string;
}

/** Modelo devolvido pelo endpoint de modelos. Campo que a API não informa fica ausente. */
export interface ModeloConsultado {
  id: string;
  nome?: string;
  /** Janela de contexto (tokens de entrada), quando informada. */
  contexto?: number;
  /** Máximo de tokens de saída, quando informado. */
  saidaMaxima?: number;
  /** Data de criação (ISO), quando informada. */
  criadoEm?: string;
  /** Fabricante (ex.: "anthropic"), quando o id o traz (OpenRouter: "fabricante/modelo"). */
  fabricante?: string;
  /** Preço em USD por 1 milhão de tokens de entrada, quando a API informa. */
  precoEntradaPorMilhao?: number;
  /** Preço em USD por 1 milhão de tokens de saída, quando a API informa. */
  precoSaidaPorMilhao?: number;
}

export interface Provedor {
  /** Id do provedor no registro (ex.: "claude"). Ausente em provedor falso. */
  readonly idProvedor?: string;
  gerar(pedido: PedidoProvedor): Promise<RespostaProvedor>;
  /** Consulta o endpoint de modelos com a chave da pessoa. Ausente = não suporta. */
  listarModelos?(): Promise<ModeloConsultado[]>;
}

/** Erro na chamada ao provedor. A mensagem nunca inclui a chave. */
export class ErroProvedor extends Error {}

/** Erro de configuração do provedor. A mensagem diz qual variável falta, nunca um valor de chave. */
export class ErroConfiguracaoProvedor extends Error {}

/** Folga para modelos que gastam tokens pensando antes de responder. */
export const TOKENS_SAIDA_PADRAO = 4096;

export const MENSAGEM_CHAVE_RECUSADA = "a chave foi recusada pelo provedor";

interface Requisicao {
  url: string;
  headers: Record<string, string>;
  /** Sem corpo = GET. */
  corpo?: unknown;
}

/**
 * Faz a chamada (POST com corpo, GET sem) e devolve o JSON. Converte falhas em ErroProvedor com texto
 * fixo. Nunca lê nem repete o corpo de erro, exceto para reconhecer o código
 * `API_KEY_INVALID` do Google (que responde 400, não 401, a chave inválida) —
 * e mesmo aí o texto lido só é comparado, nunca repetido.
 */
async function postarJson(nome: string, req: Requisicao): Promise<unknown> {
  let resposta: Response;
  try {
    resposta = await fetch(req.url, {
      method: req.corpo === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...req.headers },
      ...(req.corpo === undefined ? {} : { body: JSON.stringify(req.corpo) }),
    });
  } catch {
    // A mensagem do erro de rede pode carregar detalhes do pedido: não repete.
    throw new ErroProvedor(`não foi possível conectar a ${nome} (falha de rede)`);
  }

  if (!resposta.ok) {
    const status = resposta.status;
    if (status === 401 || status === 403) {
      throw new ErroProvedor(`${nome}: ${MENSAGEM_CHAVE_RECUSADA} (HTTP ${status})`);
    }
    if (status === 400) {
      const corpo = await resposta.text().catch(() => "");
      if (corpo.includes("API_KEY_INVALID")) {
        throw new ErroProvedor(`${nome}: ${MENSAGEM_CHAVE_RECUSADA} (HTTP 400)`);
      }
      throw new ErroProvedor(`${nome} recusou o pedido (HTTP 400): verifique o modelo escolhido`);
    }
    if (status === 404) {
      throw new ErroProvedor(`${nome}: modelo não encontrado (HTTP 404)`);
    }
    if (status === 402) {
      throw new ErroProvedor(`${nome}: sem crédito ou saldo insuficiente (HTTP 402)`);
    }
    if (status === 429) {
      throw new ErroProvedor(`${nome}: limite de uso ou saldo esgotado (HTTP 429)`);
    }
    throw new ErroProvedor(`${nome} respondeu HTTP ${status}`);
  }

  try {
    return await resposta.json();
  } catch {
    throw new ErroProvedor(`${nome} devolveu uma resposta que não é JSON`);
  }
}

function formatoInesperado(nome: string): ErroProvedor {
  return new ErroProvedor(`${nome} devolveu uma resposta em formato inesperado`);
}

function objeto(valor: unknown): Record<string, unknown> | undefined {
  return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : undefined;
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function textoOuUndefined(valor: unknown): string | undefined {
  return typeof valor === "string" ? valor : undefined;
}

function dataIso(valor: unknown, segundos: boolean): string | undefined {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const d = new Date(segundos ? valor * 1000 : valor);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof valor === "string") {
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function positivo(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

/** Monta o modelo só com o que veio; nada de valor inventado. */
function modelo(
  id: string,
  extra: { [K in keyof Omit<ModeloConsultado, "id">]?: ModeloConsultado[K] | undefined },
): ModeloConsultado {
  const m: ModeloConsultado = { id };
  if (extra.fabricante) m.fabricante = extra.fabricante;
  if (extra.precoEntradaPorMilhao !== undefined) m.precoEntradaPorMilhao = extra.precoEntradaPorMilhao;
  if (extra.precoSaidaPorMilhao !== undefined) m.precoSaidaPorMilhao = extra.precoSaidaPorMilhao;
  if (extra.nome) m.nome = extra.nome;
  if (extra.contexto !== undefined) m.contexto = extra.contexto;
  if (extra.saidaMaxima !== undefined) m.saidaMaxima = extra.saidaMaxima;
  if (extra.criadoEm) m.criadoEm = extra.criadoEm;
  return m;
}

const MAXIMO_PAGINAS = 5;

export class ProvedorClaude implements Provedor {
  readonly idProvedor = "claude";

  constructor(
    private readonly chave: string,
    private readonly modelo: string,
  ) {}

  async gerar(pedido: PedidoProvedor): Promise<RespostaProvedor> {
    const bruto = await postarJson("Anthropic", {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": this.chave, "anthropic-version": "2023-06-01" },
      corpo: {
        model: this.modelo,
        max_tokens: pedido.maxTokens ?? TOKENS_SAIDA_PADRAO,
        system: pedido.sistema,
        messages: [{ role: "user", content: pedido.usuario }],
      },
    });
    const json = objeto(bruto);
    const usage = objeto(json?.usage);
    if (!json || !Array.isArray(json.content) || !usage) throw formatoInesperado("Anthropic");

    const bloco = (json.content as unknown[])
      .map(objeto)
      .find((b) => b?.type === "text");
    return {
      textoCru: textoOuUndefined(bloco?.text) ?? "",
      tokensEntrada: numero(usage.input_tokens),
      tokensSaida: numero(usage.output_tokens),
      modelo: textoOuUndefined(json.model) ?? this.modelo,
    };
  }

  /** GET /v1/models, paginado por after_id (skill claude-api, shared/models.md). */
  async listarModelos(): Promise<ModeloConsultado[]> {
    const saida: ModeloConsultado[] = [];
    let depois: string | undefined;
    for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
      const url = `https://api.anthropic.com/v1/models?limit=100${depois ? `&after_id=${encodeURIComponent(depois)}` : ""}`;
      const json = objeto(
        await postarJson("Anthropic", {
          url,
          headers: { "x-api-key": this.chave, "anthropic-version": "2023-06-01" },
        }),
      );
      if (!json || !Array.isArray(json.data)) throw formatoInesperado("Anthropic");
      for (const item of json.data as unknown[]) {
        const o = objeto(item);
        const id = textoOuUndefined(o?.id);
        if (!o || !id) continue;
        saida.push(
          modelo(id, {
            nome: textoOuUndefined(o.display_name),
            contexto: positivo(o.max_input_tokens),
            saidaMaxima: positivo(o.max_tokens),
            criadoEm: dataIso(o.created_at, false),
          }),
        );
      }
      depois = textoOuUndefined(json.last_id);
      if (json.has_more !== true || !depois) break;
    }
    return saida;
  }
}

/** Formato chat completions, comum a DeepSeek e OpenAI. */
class ProvedorChatCompletions implements Provedor {
  constructor(
    readonly idProvedor: string,
    private readonly nome: string,
    private readonly url: string,
    private readonly urlModelos: string,
    private readonly chave: string,
    private readonly modelo: string,
    private readonly campoLimite: "max_tokens" | "max_completion_tokens",
    private readonly headersExtras: Record<string, string> = {},
  ) {}

  /** Lê um item da lista de modelos. undefined = descartar. OpenRouter sobrescreve. */
  protected itemModelo(o: Record<string, unknown>, id: string): ModeloConsultado | undefined {
    return modelo(id, {
      nome: textoOuUndefined(o.name), // DeepSeek informa; OpenAI não
      contexto: positivo(o.context_window), // DeepSeek informa; OpenAI não
      saidaMaxima: positivo(o.max_output_tokens),
      criadoEm: dataIso(o.created, true), // OpenAI informa; DeepSeek não
    });
  }

  async gerar(pedido: PedidoProvedor): Promise<RespostaProvedor> {
    const bruto = await postarJson(this.nome, {
      url: this.url,
      headers: { authorization: `Bearer ${this.chave}`, ...this.headersExtras },
      corpo: {
        model: this.modelo,
        messages: [
          { role: "system", content: pedido.sistema },
          { role: "user", content: pedido.usuario },
        ],
        response_format: { type: "json_object" },
        [this.campoLimite]: pedido.maxTokens ?? TOKENS_SAIDA_PADRAO,
      },
    });
    const json = objeto(bruto);
    const usage = objeto(json?.usage);
    if (json && objeto(json.error)) {
      // OpenRouter pode devolver erro de geração com HTTP 200. Texto fixo: não repete a mensagem.
      throw new ErroProvedor(`${this.nome} informou erro durante a geração`);
    }
    if (!json || !Array.isArray(json.choices) || !usage) throw formatoInesperado(this.nome);

    const mensagem = objeto(objeto((json.choices as unknown[])[0])?.message);
    return {
      textoCru: textoOuUndefined(mensagem?.content) ?? "",
      tokensEntrada: numero(usage.prompt_tokens),
      tokensSaida: numero(usage.completion_tokens),
      modelo: textoOuUndefined(json.model) ?? this.modelo,
    };
  }

  /** GET /models (DeepSeek) ou /v1/models (OpenAI): { data: [{ id, ... }] }. */
  async listarModelos(): Promise<ModeloConsultado[]> {
    const json = objeto(
      await postarJson(this.nome, {
        url: this.urlModelos,
        headers: { authorization: `Bearer ${this.chave}`, ...this.headersExtras },
      }),
    );
    if (!json || !Array.isArray(json.data)) throw formatoInesperado(this.nome);
    const saida: ModeloConsultado[] = [];
    for (const item of json.data as unknown[]) {
      const o = objeto(item);
      const id = textoOuUndefined(o?.id);
      if (!o || !id) continue;
      const lido = this.itemModelo(o, id);
      if (lido) saida.push(lido);
    }
    return saida;
  }
}

export class ProvedorDeepSeek extends ProvedorChatCompletions {
  constructor(chave: string, modelo: string) {
    super("deepseek", "DeepSeek", "https://api.deepseek.com/chat/completions", "https://api.deepseek.com/models", chave, modelo, "max_tokens");
  }
}

export class ProvedorOpenAI extends ProvedorChatCompletions {
  constructor(chave: string, modelo: string) {
    super("openai", "OpenAI", "https://api.openai.com/v1/chat/completions", "https://api.openai.com/v1/models", chave, modelo, "max_completion_tokens");
  }
}

/** USD por token (string) → USD por 1 milhão de tokens. */
function porMilhao(valor: unknown): number | undefined {
  const n = typeof valor === "string" ? Number(valor) : typeof valor === "number" ? valor : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e6 * 1e6) / 1e6 : undefined;
}

/**
 * OpenRouter: chat completions compatível com OpenAI, uma chave para modelos
 * de vários fabricantes. Docs: https://openrouter.ai/docs/api-reference/overview
 * (base https://openrouter.ai/api/v1; cabeçalhos HTTP-Referer e X-OpenRouter-Title
 * são opcionais e só identificam o app) e
 * https://openrouter.ai/docs/api/api-reference/models/get-models (GET /models).
 */
export class ProvedorOpenRouter extends ProvedorChatCompletions {
  constructor(chave: string, modelo: string) {
    super(
      "openrouter",
      "OpenRouter",
      "https://openrouter.ai/api/v1/chat/completions",
      "https://openrouter.ai/api/v1/models",
      chave,
      modelo,
      "max_tokens",
      { "x-openrouter-title": "Gerador de video" },
    );
  }

  protected override itemModelo(o: Record<string, unknown>, id: string): ModeloConsultado | undefined {
    // A lista inclui imagem, áudio e embedding; o escritor só usa modelo que só gera texto.
    const saidas = objeto(o.architecture)?.output_modalities;
    if (Array.isArray(saidas) && !(saidas.length > 0 && saidas.every((x) => x === "text"))) return undefined;
    const preco = objeto(o.pricing);
    const barra = id.indexOf("/");
    return modelo(id, {
      nome: textoOuUndefined(o.name),
      contexto: positivo(o.context_length),
      saidaMaxima: positivo(objeto(o.top_provider)?.max_completion_tokens),
      criadoEm: dataIso(o.created, true),
      fabricante: barra > 0 ? id.slice(0, barra) : undefined,
      precoEntradaPorMilhao: porMilhao(preco?.prompt),
      precoSaidaPorMilhao: porMilhao(preco?.completion),
    });
  }
}

export class ProvedorGemini implements Provedor {
  readonly idProvedor = "gemini";

  constructor(
    private readonly chave: string,
    private readonly modelo: string,
  ) {}

  async gerar(pedido: PedidoProvedor): Promise<RespostaProvedor> {
    // A chave vai no cabeçalho, nunca na URL: URL aparece em log de proxy e erro de rede.
    const bruto = await postarJson("Google Gemini", {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelo)}:generateContent`,
      headers: { "x-goog-api-key": this.chave },
      corpo: {
        systemInstruction: { parts: [{ text: pedido.sistema }] },
        contents: [{ role: "user", parts: [{ text: pedido.usuario }] }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: pedido.maxTokens ?? TOKENS_SAIDA_PADRAO,
        },
      },
    });
    const json = objeto(bruto);
    const uso = objeto(json?.usageMetadata);
    if (!json || !uso) throw formatoInesperado("Google Gemini");

    const candidato = objeto(Array.isArray(json.candidates) ? json.candidates[0] : undefined);
    const partes = objeto(candidato?.content)?.parts;
    const texto = Array.isArray(partes)
      ? partes
          .map((p) => textoOuUndefined(objeto(p)?.text) ?? "")
          .join("")
      : "";
    return {
      textoCru: texto,
      tokensEntrada: numero(uso.promptTokenCount),
      // Tokens de raciocínio são cobrados como saída.
      tokensSaida: numero(uso.candidatesTokenCount) + numero(uso.thoughtsTokenCount),
      modelo: textoOuUndefined(json.modelVersion) ?? this.modelo,
    };
  }

  /** GET /v1beta/models, paginado por pageToken. Só modelos que fazem generateContent. */
  async listarModelos(): Promise<ModeloConsultado[]> {
    const saida: ModeloConsultado[] = [];
    let token: string | undefined;
    for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
      const json = objeto(
        await postarJson("Google Gemini", { url, headers: { "x-goog-api-key": this.chave } }),
      );
      if (!json || !Array.isArray(json.models)) throw formatoInesperado("Google Gemini");
      for (const item of json.models as unknown[]) {
        const o = objeto(item);
        const nomeRecurso = textoOuUndefined(o?.name);
        if (!o || !nomeRecurso) continue;
        const metodos = Array.isArray(o.supportedGenerationMethods) ? o.supportedGenerationMethods : [];
        if (!metodos.includes("generateContent")) continue;
        saida.push(
          modelo(nomeRecurso.replace(/^models\//, ""), {
            nome: textoOuUndefined(o.displayName),
            contexto: positivo(o.inputTokenLimit),
            saidaMaxima: positivo(o.outputTokenLimit),
          }),
        );
      }
      token = textoOuUndefined(json.nextPageToken);
      if (!token) break;
    }
    return saida;
  }
}
