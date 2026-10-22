// Catálogo de provedores: o painel lê isto para montar a tela de
// Configurações sozinho. Nada de provedor ou modelo cravado no painel.
//
// Origem dos ids de modelo (consultados em 2026-10-22):
//  - Anthropic: skill claude-api (tabela "Current Models").
//  - OpenAI: https://developers.openai.com/api/docs/models
//  - Google: https://ai.google.dev/gemini-api/docs/models (só os rotulados "Stable")
//  - OpenRouter: https://openrouter.ai/docs/api-reference/overview e a lista pública
//    https://openrouter.ai/api/v1/models (ids conferidos em 2026-10-22).
//  - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
// Lista fechada: modelo fora dela é recusado na configuração.

import {
  ProvedorClaude,
  ProvedorDeepSeek,
  ProvedorGemini,
  ProvedorOpenAI,
  ProvedorOpenRouter,
  type Provedor,
} from "./provedor.js";

export interface ModeloProvedor {
  id: string;
  nome: string;
}

export interface InfoProvedor {
  /** Id estável. É o valor de PROVEDOR_IA e de `ia.provedor`. */
  id: string;
  nome: string;
  /** Variável de ambiente que guarda a chave. A chave nunca fica no banco. */
  variavelChave: string;
  /** Variável de ambiente opcional que escolhe o modelo. */
  variavelModelo: string;
  modelos: readonly ModeloProvedor[];
  modeloPadrao: string;
}

interface Definicao extends InfoProvedor {
  criar(chave: string, modelo: string): Provedor;
}

const DEFINICOES: readonly Definicao[] = [
  {
    id: "claude",
    nome: "Anthropic (Claude)",
    variavelChave: "ANTHROPIC_API_KEY",
    variavelModelo: "ANTHROPIC_MODEL",
    // Haiku resolve este trabalho (três frases e escolha numa lista fechada).
    modeloPadrao: "claude-haiku-5-5",
    modelos: [
      { id: "claude-haiku-5-5", nome: "Claude Haiku 5.5 (mais barato)" },
      { id: "claude-sonnet-5-5", nome: "Claude Sonnet 5.5" },
      { id: "claude-opus-5-5", nome: "Claude Opus 5.5 (mais capaz)" },
    ],
    criar: (chave, modelo) => new ProvedorClaude(chave, modelo),
  },
  {
    id: "deepseek",
    nome: "DeepSeek",
    variavelChave: "DEEPSEEK_API_KEY",
    variavelModelo: "DEEPSEEK_MODEL",
    modeloPadrao: "deepseek-flash",
    modelos: [
      { id: "deepseek-flash", nome: "DeepSeek Flash (mais barato)" },
      { id: "deepseek-v4-pro", nome: "DeepSeek V4 Pro" },
    ],
    criar: (chave, modelo) => new ProvedorDeepSeek(chave, modelo),
  },
  {
    id: "openai",
    nome: "OpenAI",
    variavelChave: "OPENAI_API_KEY",
    variavelModelo: "OPENAI_MODEL",
    modeloPadrao: "gpt-6-luna",
    modelos: [
      { id: "gpt-6-luna", nome: "GPT-6 Luna (mais barato)" },
      { id: "gpt-6.1-sol", nome: "GPT-6.1 Sol" },
      { id: "gpt-6-astra", nome: "GPT-6 Astra (mais capaz)" },
    ],
    criar: (chave, modelo) => new ProvedorOpenAI(chave, modelo),
  },
  {
    id: "gemini",
    nome: "Google (Gemini)",
    variavelChave: "GEMINI_API_KEY",
    variavelModelo: "GEMINI_MODEL",
    modeloPadrao: "gemini-3.5-flash-lite",
    modelos: [
      { id: "gemini-3.5-flash-lite", nome: "Gemini 3.5 Flash-Lite (mais barato)" },
      { id: "gemini-3.6-flash", nome: "Gemini 3.6 Flash" },
      { id: "gemini-3.8-flash", nome: "Gemini 3.8 Flash" },
    ],
    criar: (chave, modelo) => new ProvedorGemini(chave, modelo),
  },
  {
    id: "openrouter",
    nome: "OpenRouter (uma chave, vários fabricantes)",
    variavelChave: "OPENROUTER_API_KEY",
    variavelModelo: "OPENROUTER_MODEL",
    modeloPadrao: "anthropic/claude-haiku-5.5",
    modelos: [
      { id: "anthropic/claude-haiku-5.5", nome: "Claude Haiku 5.5 (mais barato)" },
      { id: "openai/gpt-6-luna", nome: "GPT-6 Luna" },
      { id: "google/gemini-3.5-flash-lite", nome: "Gemini 3.5 Flash-Lite" },
      { id: "deepseek/deepseek-v4.1-flash", nome: "DeepSeek V4.1 Flash" },
    ],
    criar: (chave, modelo) => new ProvedorOpenRouter(chave, modelo),
  },
];

/** Lista para o painel. Só dados: sem fábrica, sem chave. */
export const PROVEDORES: readonly InfoProvedor[] = DEFINICOES.map(
  ({ id, nome, variavelChave, variavelModelo, modelos, modeloPadrao }) => ({
    id,
    nome,
    variavelChave,
    variavelModelo,
    modelos,
    modeloPadrao,
  }),
);

export const PROVEDOR_PADRAO = "claude";

export function acharDefinicao(id: string): Definicao | undefined {
  return DEFINICOES.find((d) => d.id === id);
}
