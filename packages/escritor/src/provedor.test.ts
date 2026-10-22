import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  criarProvedorPorConfig,
  criarProvedorPorEnv,
  lerAjustesIA,
  listarModelos,
  testarConexao,
  testarConexaoPorEnv,
} from "./configuracao.js";
import {
  ErroConfiguracaoProvedor,
  ProvedorClaude,
  ProvedorDeepSeek,
  ProvedorGemini,
  ProvedorOpenAI,
  ProvedorOpenRouter,
  type Provedor,
} from "./provedor.js";
import { PROVEDORES } from "./registro.js";

const CHAVE = "SENTINELA-segredo-que-nao-pode-aparecer-9f3a";

interface Chamada {
  url: string;
  metodo: string;
  headers: Record<string, string>;
  corpo: Record<string, unknown> | undefined;
}

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

/** fetch simulado: devolve as respostas em ordem (a última se repete) e registra as chamadas. */
function simular(...respostas: Response[]): Chamada[] {
  const chamadas: Chamada[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      url: String(url),
      metodo: init?.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      corpo: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
    });
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return r?.clone() ?? new Response("", { status: 500 });
  }) as typeof fetch;
  return chamadas;
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

interface Caso {
  id: string;
  fabrica: () => Provedor;
  nome: string;
  urlGerar: string;
  urlModelos: RegExp;
  respostaGerar: unknown;
  respostaModelos: unknown;
  statusChaveRecusada: number;
  corpoChaveRecusada?: string;
  tokens: [number, number];
  modeloResposta: string;
}

const CASOS: Caso[] = [
  {
    id: "claude",
    fabrica: () => new ProvedorClaude(CHAVE, "claude-haiku-5-5"),
    nome: "Anthropic",
    urlGerar: "https://api.anthropic.com/v1/messages",
    urlModelos: /^https:\/\/api\.anthropic\.com\/v1\/models\?limit=100$/,
    respostaGerar: {
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: "{\"a\":1}" }],
      usage: { input_tokens: 11, output_tokens: 7 },
    },
    respostaModelos: {
      data: [
        { id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-09-01T00:00:00Z", max_input_tokens: 1000000, max_tokens: 128000 },
        { id: "claude-haiku-5-5", display_name: "Claude Haiku 5.5" },
      ],
      has_more: false,
    },
    statusChaveRecusada: 401,
    tokens: [11, 7],
    modeloResposta: "claude-haiku-5-5",
  },
  {
    id: "deepseek",
    fabrica: () => new ProvedorDeepSeek(CHAVE, "deepseek-flash"),
    nome: "DeepSeek",
    urlGerar: "https://api.deepseek.com/chat/completions",
    urlModelos: /^https:\/\/api\.deepseek\.com\/models$/,
    respostaGerar: {
      model: "deepseek-flash",
      choices: [{ message: { content: "{\"a\":1}" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    },
    respostaModelos: {
      data: [
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", context_window: 1000000, max_output_tokens: 384000 },
        { id: "deepseek-flash" },
      ],
    },
    statusChaveRecusada: 401,
    tokens: [11, 7],
    modeloResposta: "deepseek-flash",
  },
  {
    id: "openai",
    fabrica: () => new ProvedorOpenAI(CHAVE, "gpt-6-luna"),
    nome: "OpenAI",
    urlGerar: "https://api.openai.com/v1/chat/completions",
    urlModelos: /^https:\/\/api\.openai\.com\/v1\/models$/,
    respostaGerar: {
      model: "gpt-6-luna",
      choices: [{ message: { content: "{\"a\":1}" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    },
    respostaModelos: {
      data: [
        { id: "gpt-6-astra", created: 1790000000 },
        { id: "text-embedding-9" },
        { id: "gpt-6-luna" },
      ],
    },
    statusChaveRecusada: 401,
    tokens: [11, 7],
    modeloResposta: "gpt-6-luna",
  },
  {
    id: "gemini",
    fabrica: () => new ProvedorGemini(CHAVE, "gemini-3.5-flash-lite"),
    nome: "Google Gemini",
    urlGerar: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
    urlModelos: /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\?pageSize=1000$/,
    respostaGerar: {
      modelVersion: "gemini-3.5-flash-lite",
      candidates: [{ content: { parts: [{ text: "{\"a\":" }, { text: "1}" }] } }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 5, thoughtsTokenCount: 2 },
    },
    respostaModelos: {
      models: [
        { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent"] },
        { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-3.5-flash-lite", supportedGenerationMethods: ["generateContent"] },
      ],
    },
    // O Google responde 400 com API_KEY_INVALID, não 401.
    statusChaveRecusada: 400,
    corpoChaveRecusada: JSON.stringify({ error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }),
    tokens: [11, 7],
    modeloResposta: "gemini-3.5-flash-lite",
  },
  {
    id: "openrouter",
    fabrica: () => new ProvedorOpenRouter(CHAVE, "anthropic/claude-haiku-5.5"),
    nome: "OpenRouter",
    urlGerar: "https://openrouter.ai/api/v1/chat/completions",
    urlModelos: /^https:\/\/openrouter\.ai\/api\/v1\/models$/,
    respostaGerar: {
      model: "anthropic/claude-haiku-5.5",
      choices: [{ message: { content: "{\"a\":1}" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    },
    respostaModelos: {
      data: [
        { id: "openai/gpt-6-luna", name: "OpenAI: GPT-6 Luna", created: 1790000000, context_length: 1050000, pricing: { prompt: "0.0000001", completion: "0.0000005" }, top_provider: { max_completion_tokens: null }, architecture: { output_modalities: ["text"] } },
        { id: "anthropic/claude-haiku-5.5", name: "Anthropic: Claude Haiku 5.5", pricing: { prompt: "0.0000001", completion: "0.0000005" }, architecture: { output_modalities: ["text"] } },
        { id: "google/gemini-nano-banana-2.1", architecture: { output_modalities: ["image", "text"] } },
        { id: "vendor/so-imagem", architecture: { output_modalities: ["image"] } },
      ],
    },
    statusChaveRecusada: 401,
    tokens: [11, 7],
    modeloResposta: "anthropic/claude-haiku-5.5",
  },
];

for (const c of CASOS) {
  test(`${c.id}: monta a requisição certa (endpoint, cabeçalho, corpo)`, async () => {
    const chamadas = simular(json(c.respostaGerar));
    await c.fabrica().gerar({ sistema: "SIS", usuario: "USU" });
    const ch = chamadas[0]!;
    assert.equal(ch.url, c.urlGerar);
    assert.equal(ch.metodo, "POST");
    assert.ok(!ch.url.includes(CHAVE), "chave nunca na URL");
    const corpo = JSON.stringify(ch.corpo);
    assert.ok(corpo.includes("SIS") && corpo.includes("USU"));
    assert.ok(!corpo.includes(CHAVE), "chave nunca no corpo");
    if (c.id === "claude") {
      assert.equal(ch.headers["x-api-key"], CHAVE);
      assert.equal(ch.headers["anthropic-version"], "2023-06-01");
      assert.equal(ch.corpo?.model, "claude-haiku-5-5");
      assert.equal(ch.corpo?.system, "SIS");
      assert.ok(Number(ch.corpo?.max_tokens) > 0);
    } else if (c.id === "gemini") {
      assert.equal(ch.headers["x-goog-api-key"], CHAVE);
      const cfg = ch.corpo?.generationConfig as Record<string, unknown>;
      assert.equal(cfg.responseMimeType, "application/json");
      assert.ok(Number(cfg.maxOutputTokens) > 0);
      assert.deepEqual(ch.corpo?.systemInstruction, { parts: [{ text: "SIS" }] });
    } else {
      assert.equal(ch.headers.authorization, `Bearer ${CHAVE}`);
      if (c.id === "openrouter") assert.equal(ch.headers["x-openrouter-title"], "Gerador de video");
      assert.deepEqual(ch.corpo?.response_format, { type: "json_object" });
      assert.equal(ch.corpo?.model, c.modeloResposta);
      assert.ok(c.id === "openai" ? "max_completion_tokens" in ch.corpo! : "max_tokens" in ch.corpo!);
    }
  });

  test(`${c.id}: interpreta a resposta e extrai tokens e modelo`, async () => {
    simular(json(c.respostaGerar));
    const r = await c.fabrica().gerar({ sistema: "s", usuario: "u" });
    assert.equal(r.textoCru, "{\"a\":1}");
    // Gemini soma tokens de raciocínio à saída: 5 + 2.
    assert.deepEqual([r.tokensEntrada, r.tokensSaida], c.tokens);
    assert.equal(r.modelo, c.modeloResposta);
  });

  test(`${c.id}: chave inválida vira mensagem clara e não vaza`, async () => {
    simular(new Response(c.corpoChaveRecusada ?? `eco: ${CHAVE}`, { status: c.statusChaveRecusada }));
    await assert.rejects(
      () => c.fabrica().gerar({ sistema: "s", usuario: "u" }),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /a chave foi recusada pelo provedor/);
        assert.ok(erro.message.includes(c.nome));
        assert.ok(!erro.message.includes(CHAVE));
        assert.ok(!String(erro.stack).includes(CHAVE));
        return true;
      },
    );
  });

  test(`${c.id}: a chave não vaza em erro 500, rede caída, nem em log`, async () => {
    const logado: string[] = [];
    const salvos = (["log", "info", "warn", "error", "debug"] as const).map((k) => [k, console[k]] as const);
    for (const [k] of salvos) console[k] = (...a: unknown[]) => void logado.push(a.join(" "));
    try {
      simular(new Response(`corpo com ${CHAVE}`, { status: 500 }));
      const e1 = await c.fabrica().gerar({ sistema: "s", usuario: "u" }).catch((e: unknown) => e as Error);
      assert.ok(e1 instanceof Error && !e1.message.includes(CHAVE) && /500/.test(e1.message));

      globalThis.fetch = (async () => {
        throw new Error(`falha com ${CHAVE}`);
      }) as typeof fetch;
      const e2 = await c.fabrica().gerar({ sistema: "s", usuario: "u" }).catch((e: unknown) => e as Error);
      assert.ok(e2 instanceof Error && !e2.message.includes(CHAVE) && /rede/.test(e2.message));

      const t = await testarConexao(c.fabrica());
      assert.ok(!JSON.stringify(t).includes(CHAVE));
    } finally {
      for (const [k, f] of salvos) console[k] = f;
    }
    assert.equal(logado.filter((l) => l.includes(CHAVE)).length, 0);
    assert.equal(logado.length, 0, "o pacote não loga nada");
  });

  test(`${c.id}: resposta em formato inesperado vira erro claro`, async () => {
    simular(json({ qualquer: "coisa" }));
    await assert.rejects(() => c.fabrica().gerar({ sistema: "s", usuario: "u" }), /formato inesperado/);
  });

  test(`${c.id}: listarModelos monta a requisição certa e interpreta a lista`, async () => {
    const chamadas = simular(json(c.respostaModelos));
    const p = c.fabrica();
    const lista = await p.listarModelos!();
    const ch = chamadas[0]!;
    assert.match(ch.url, c.urlModelos);
    assert.equal(ch.metodo, "GET");
    assert.equal(ch.corpo, undefined);
    assert.ok(!ch.url.includes(CHAVE));
    assert.ok(lista.length >= 2);
    assert.ok(lista.some((m) => m.id === c.modeloResposta));
    assert.ok(!JSON.stringify(lista).includes(CHAVE));
  });

  test(`${c.id}: listagem consultada traz o recomendado primeiro`, async () => {
    simular(json(c.respostaModelos));
    const r = await listarModelos(c.fabrica());
    assert.equal(r.origem, "consultada");
    assert.equal(r.modelos[0]?.id, c.modeloResposta);
    assert.equal(r.modelos[0]?.recomendado, true);
    assert.equal(r.aviso, undefined);
  });

  test(`${c.id}: endpoint de modelos falhando devolve a lista sugerida, marcada`, async () => {
    simular(new Response(`eco ${CHAVE}`, { status: 500 }));
    const r = await listarModelos(c.fabrica());
    assert.equal(r.origem, "sugerida");
    assert.ok(r.aviso && !r.aviso.includes(CHAVE));
    const info = PROVEDORES.find((p) => p.id === c.id)!;
    assert.deepEqual(r.modelos.map((m) => m.id).sort(), info.modelos.map((m) => m.id).sort());
    assert.equal(r.modelos[0]?.id, info.modeloPadrao);
    assert.ok(!JSON.stringify(r).includes(CHAVE));
  });

  test(`${c.id}: testarConexao com sucesso devolve modelo, tokens e lista`, async () => {
    simular(json(c.respostaGerar), json(c.respostaModelos));
    const r = await testarConexao(c.fabrica());
    assert.equal(r.ok, true);
    assert.equal(r.modelo, c.modeloResposta);
    assert.deepEqual([r.tokensEntrada, r.tokensSaida], c.tokens);
    assert.equal(r.listagem.origem, "consultada");
  });

  test(`${c.id}: testarConexao com chave recusada devolve ok=false e mensagem clara`, async () => {
    simular(new Response(c.corpoChaveRecusada ?? "x", { status: c.statusChaveRecusada }));
    const r = await testarConexao(c.fabrica());
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /a chave foi recusada pelo provedor/);
    assert.equal(r.listagem.origem, "sugerida");
    assert.equal(r.tokensEntrada, 0);
  });

  test(`${c.id}: testarConexao sem chave no ambiente diz qual variável falta`, async () => {
    const info = PROVEDORES.find((p) => p.id === c.id)!;
    const r = await testarConexaoPorEnv({ PROVEDOR_IA: c.id });
    assert.equal(r.ok, false);
    assert.ok(r.mensagem.includes(info.variavelChave));
    assert.ok(!/\bat \w/.test(r.mensagem), "sem stack trace");
    assert.equal(r.listagem.origem, "sugerida");
    assert.equal(r.listagem.modelos[0]?.id, info.modeloPadrao);
  });
}

test("OpenAI: modelos que não são de texto saem da listagem", async () => {
  simular(json(CASOS[2]!.respostaModelos));
  const r = await listarModelos(CASOS[2]!.fabrica());
  assert.ok(!r.modelos.some((m) => m.id === "text-embedding-9"));
});

test("OpenRouter: preço por milhão, fabricante e filtro de texto na listagem", async () => {
  simular(json(CASOS[4]!.respostaModelos));
  const r = await listarModelos(CASOS[4]!.fabrica());
  assert.equal(r.origem, "consultada");
  assert.deepEqual(r.modelos.map((m) => m.id), ["anthropic/claude-haiku-5.5", "openai/gpt-6-luna"]);
  const luna = r.modelos[1]!;
  assert.equal(luna.fabricante, "openai");
  assert.equal(luna.precoEntradaPorMilhao, 0.1);
  assert.equal(luna.precoSaidaPorMilhao, 0.5);
  assert.equal(luna.contexto, 1050000);
  assert.equal(luna.saidaMaxima, undefined, "null da API vira ausente");
  assert.equal(luna.criadoEm, new Date(1790000000 * 1000).toISOString());
});

test("OpenRouter: modelo sem preço na API fica sem preço (nada inventado)", async () => {
  simular(json({ data: [{ id: "a/b" }] }));
  const r = await new ProvedorOpenRouter(CHAVE, "a/b").listarModelos();
  assert.deepEqual(r, [{ id: "a/b", fabricante: "a" }]);
});

test("OpenRouter: 402 vira 'sem crédito' e erro dentro de HTTP 200 não vaza o texto", async () => {
  simular(new Response("{}", { status: 402 }));
  await assert.rejects(() => CASOS[4]!.fabrica().gerar({ sistema: "s", usuario: "u" }), /sem crédito/);
  simular(json({ error: { code: 502, message: `eco ${CHAVE}` } }));
  await assert.rejects(
    () => CASOS[4]!.fabrica().gerar({ sistema: "s", usuario: "u" }),
    (e: unknown) => e instanceof Error && /durante a geração/.test(e.message) && !e.message.includes(CHAVE),
  );
});

test("listagem: campos que a API não informa ficam ausentes", async () => {
  simular(json({ data: [{ id: "deepseek-flash" }] }));
  const r = await new ProvedorDeepSeek(CHAVE, "deepseek-flash").listarModelos();
  assert.deepEqual(r, [{ id: "deepseek-flash" }]);
});

test("listagem: Anthropic e Gemini seguem a paginação", async () => {
  const c1 = simular(
    json({ data: [{ id: "a" }], has_more: true, last_id: "a" }),
    json({ data: [{ id: "b" }], has_more: false }),
  );
  const l1 = await new ProvedorClaude(CHAVE, "m").listarModelos();
  assert.deepEqual(l1.map((m) => m.id), ["a", "b"]);
  assert.match(c1[1]!.url, /after_id=a/);

  const gen = ["generateContent"];
  const c2 = simular(
    json({ models: [{ name: "models/x", supportedGenerationMethods: gen }], nextPageToken: "T" }),
    json({ models: [{ name: "models/y", supportedGenerationMethods: gen }] }),
  );
  const l2 = await new ProvedorGemini(CHAVE, "m").listarModelos();
  assert.deepEqual(l2.map((m) => m.id), ["x", "y"]);
  assert.match(c2[1]!.url, /pageToken=T/);
});

test("listagem: provedor sem consulta (falso) cai na lista sugerida, marcada", async () => {
  const falso: Provedor = { async gerar() { return { textoCru: "", tokensEntrada: 0, tokensSaida: 0 }; } };
  const r = await listarModelos(falso, "openai");
  assert.equal(r.origem, "sugerida");
  assert.equal(r.modelos[0]?.id, "gpt-6-luna");
});

test("testarConexao com provedor falso", async () => {
  const falso: Provedor = { async gerar() { return { textoCru: "ok", tokensEntrada: 3, tokensSaida: 1, modelo: "m" }; } };
  const r = await testarConexao(falso);
  assert.equal(r.ok, true);
  assert.equal(r.modelo, "m");
  const quebrado: Provedor = { async gerar() { throw new Error(`interno ${CHAVE}`); } };
  const q = await testarConexao(quebrado);
  assert.equal(q.ok, false);
  assert.ok(!JSON.stringify(q).includes(CHAVE), "erro desconhecido não é repetido");
});

test("registro: cada provedor tem id, nome, variável, modelos e padrão dentro da lista", () => {
  assert.deepEqual(PROVEDORES.map((p) => p.id), ["claude", "deepseek", "openai", "gemini", "openrouter"]);
  for (const p of PROVEDORES) {
    assert.ok(p.nome && p.variavelChave.endsWith("_API_KEY"));
    assert.ok(p.modelos.some((m) => m.id === p.modeloPadrao));
    assert.equal(p.modelos[0]?.id, p.modeloPadrao, "o barato vem primeiro");
  }
  assert.ok(!JSON.stringify(PROVEDORES).includes("criar"), "registro é só dado");
});

// ---- escolha por configuração

async function modeloUsado(caso: number, env: Record<string, string>, ajustes: Record<string, string> = {}) {
  const chamadas = simular(json(CASOS[caso]!.respostaGerar));
  await criarProvedorPorEnv(env, ajustes).gerar({ sistema: "s", usuario: "u" });
  return chamadas[0]!;
}

test("escolha: ajuste do banco vence a variável de ambiente; chave vem só do ambiente", async () => {
  const banco = new Database(":memory:");
  banco.exec("CREATE TABLE ajuste (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
  banco.prepare("INSERT INTO ajuste VALUES (?, ?), (?, ?)").run("ia.provedor", "openai", "ia.modelo", "gpt-6-astra");
  const env = { PROVEDOR_IA: "claude", ANTHROPIC_API_KEY: "outra", OPENAI_API_KEY: CHAVE };
  assert.deepEqual(lerAjustesIA(banco), { "ia.provedor": "openai", "ia.modelo": "gpt-6-astra" });

  const chamadas = simular(json(CASOS[2]!.respostaGerar));
  await criarProvedorPorConfig(banco, env).gerar({ sistema: "s", usuario: "u" });
  assert.equal(chamadas[0]!.url, CASOS[2]!.urlGerar);
  assert.equal(chamadas[0]!.corpo?.model, "gpt-6-astra");
  assert.equal(chamadas[0]!.headers.authorization, `Bearer ${CHAVE}`);

  // Chave no banco é ignorada: sem a variável de ambiente, dá erro claro.
  banco.prepare("INSERT INTO ajuste VALUES (?, ?)").run("ia.chave", CHAVE);
  assert.throws(() => criarProvedorPorConfig(banco, { PROVEDOR_IA: "claude" }), /OPENAI_API_KEY/);
});

test("escolha: sem ajuste cai na variável de ambiente, depois no padrão", async () => {
  const a = await modeloUsado(1, { PROVEDOR_IA: "deepseek", DEEPSEEK_API_KEY: CHAVE, DEEPSEEK_MODEL: "deepseek-v4-pro" });
  assert.equal(a.corpo?.model, "deepseek-v4-pro");
  const b = await modeloUsado(1, { PROVEDOR_IA: "deepseek", DEEPSEEK_API_KEY: CHAVE });
  assert.equal(b.corpo?.model, "deepseek-flash");
  const c = await modeloUsado(0, { ANTHROPIC_API_KEY: CHAVE });
  assert.equal(c.url, CASOS[0]!.urlGerar);
  assert.equal(c.corpo?.model, "claude-haiku-5-5");
});

test("escolha: modelo fora da lista do provedor e provedor desconhecido dão erro claro", () => {
  assert.throws(() => criarProvedorPorEnv({ ANTHROPIC_API_KEY: CHAVE }, { "ia.modelo": "gpt-6-luna" }), (e: unknown) => {
    assert.ok(e instanceof ErroConfiguracaoProvedor);
    assert.match(e.message, /claude-haiku-5-5/);
    assert.ok(!e.message.includes(CHAVE));
    return true;
  });
  assert.throws(() => criarProvedorPorEnv({ PROVEDOR_IA: "gpt" }), ErroConfiguracaoProvedor);
});

test("escolha: sem chave, erro nomeia a variável de cada provedor", () => {
  for (const p of PROVEDORES) {
    assert.throws(() => criarProvedorPorEnv({ PROVEDOR_IA: p.id }), (e: unknown) => {
      assert.ok(e instanceof ErroConfiguracaoProvedor && e.message.includes(p.variavelChave));
      return true;
    });
  }
});

test("testarConexao: pedido mínimo menciona JSON (exigido por OpenAI/DeepSeek com json_object) e limita tokens", async () => {
  const chamadas = simular(json(CASOS[1]!.respostaGerar), json(CASOS[1]!.respostaModelos));
  await testarConexao(CASOS[1]!.fabrica());
  assert.match(JSON.stringify(chamadas[0]!.corpo?.messages), /JSON/);
  assert.equal(chamadas[0]!.corpo?.max_tokens, 256);
});
