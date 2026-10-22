// Seção de IA (cinco provedores), Sites, chaves (switch), miniatura no calendário, linhas de configuração e geometria da barra.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { aprovarVideo, criarVideoComJob, listarAjustes, marcarJobConcluido, migrar, type CaracteristicasMidia } from "@gerador/core";
import { ErroProvedor, MENSAGEM_CHAVE_RECUSADA, PROVEDORES, type Provedor } from "@gerador/escritor";
import { listarSites, type ResultadoTeste } from "@gerador/leitor";
import { CLIENTE_JS } from "./cliente.js";
import { ESTILO } from "./estilo.js";
import { iniciarServidor } from "./servidor.js";
import { dependenciasPadrao, rodarAgora, type Dependencias } from "./rotas-acoes.js";
import { blocoModelos } from "./ia.js";
import { comIdioma } from "./idioma/index.js";

const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};
const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };
const SENTINELA = "sk-SENTINELA-DA-CHAVE-NAO-PODE-APARECER-777";
const SENTINELA_2 = "or-SENTINELA-OPENROUTER-NAO-PODE-APARECER-888";

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let url: string;
let mp4: string;
const agora = new Date("2026-10-21T15:00:00.000Z");
const geradas: string[] = [];
let provedorFalso: Provedor | undefined;
let siteTestado: ResultadoTeste | undefined;
const chamadasRodada: { agendada: boolean | undefined }[] = [];

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}
const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => { throw new Error("sem chave"); },
  executarRodada: async (_db, _ag, agendada) => {
    chamadasRodada.push({ agendada });
    return { iniciadaEm: agora.toISOString(), terminadaEm: agora.toISOString(), itens: [] };
  },
  relerProduto: async () => { throw new Error("não usado"); },
  agora: () => agora,
  lerMidia: async () => BOA,
  envPublicacao: {},
  envIA: { ANTHROPIC_API_KEY: SENTINELA, OPENROUTER_API_KEY: SENTINELA_2 },
  provedorParaTeste: (id, modelo) => {
    if (!provedorFalso) throw new Error(`sem provedor falso para ${id}/${modelo}`);
    return provedorFalso;
  },
  testarSiteFn: async () => {
    if (!siteTestado) throw new Error("sem resultado falso");
    return siteTestado;
  },
  verificarNavegadorFn: async () => ({ disponivel: false, motivo: "navegador-fechado", mensagem: "Abra o navegador (Chrome com a extensão BrowserSkill) para ler este site." }),
  gerarMiniatura: async (_mp4, destino) => {
    geradas.push(destino);
    writeFileSync(destino, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  },
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-novas-"));
  process.env["GERADOR_PASTA_MINIATURAS"] = join(pasta, "miniaturas");
  mp4 = join(pasta, "v.mp4");
  writeFileSync(mp4, "x");
  servidor = iniciarServidor(0, { deps, agendadorAutomatico: false });
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((r) => servidor.close(() => r()));
  delete process.env["GERADOR_PASTA_MINIATURAS"];
  rmSync(pasta, { recursive: true, force: true });
});
beforeEach(() => {
  caminhoBanco = join(pasta, `t-${Math.random().toString(36).slice(2)}.db`);
  provedorFalso = undefined;
  siteTestado = undefined;
  chamadasRodada.length = 0;
  geradas.length = 0;
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, 'http://x/f', 1024, 768, '/tmp/f.jpg', 0)").run();
  db.close();
});

async function ir(metodo: string, caminho: string, corpo?: unknown, idioma = "en"): Promise<{ status: number; json: any; texto: string; headers: Headers; bytes: Buffer }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: `painel-idioma=${idioma}` } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(url + caminho, init);
  const bytes = Buffer.from(await r.arrayBuffer());
  const texto = bytes.toString("utf8");
  let json: any;
  try { json = JSON.parse(texto); } catch { json = undefined; }
  return { status: r.status, json, texto, headers: r.headers, bytes };
}
const pagina = async (caminho: string, idioma = "en"): Promise<string> => (await ir("GET", caminho, undefined, idioma)).texto;
const principal = (html: string): string => /<main[^>]*>([\s\S]*)<\/main>/.exec(html)![1]!;
function videoAprovado(): number {
  const db = abrir();
  const { video, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla 2020", corpo: "Texto", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, video.id, mp4);
  aprovarVideo(db, video.id);
  db.close();
  return video.id;
}
const ajusteDe = (chave: string): string | undefined => {
  const db = abrir();
  try { return listarAjustes(db).find((a) => a.chave === chave)?.valor; } finally { db.close(); }
};

// ------------------------------------------------------------ IA: cinco provedores

test("IA: a tela lista os cinco provedores a partir de PROVEDORES, com a variável de cada chave, sem nome cravado no painel", async () => {
  assert.equal(PROVEDORES.length, 5);
  const html = principal(await pagina("/configuracoes"));
  for (const p of PROVEDORES) {
    assert.match(html, new RegExp(`data-ia-provedor="${p.id}"`), p.id);
    assert.ok(html.includes(p.variavelChave), `${p.id}: variável ${p.variavelChave}`);
    assert.ok(html.includes(`data-provedor="${p.id}"`));
    for (const m of p.modelos) assert.ok(html.includes(`value="${m.id}"`), `${p.id}: modelo ${m.id}`);
    assert.match(html, new RegExp(`id="ia-modelo-${p.id}"`));
  }
  assert.equal((html.match(/data-ia-provedor="/g) ?? []).length, 5);
  // nada de nome de provedor escrito no código das telas: eles só existem no registro e no catálogo
  const fonte = readFileSync(new URL("./ia.ts", import.meta.url), "utf8");
  for (const nome of ["Anthropic", "OpenAI", "Gemini", "DeepSeek", "OpenRouter"]) assert.ok(!fonte.includes(nome), `${nome} cravado em ia.ts`);
  // o modelo recomendado (o mais barato) vem marcado
  for (const p of PROVEDORES) assert.match(html, new RegExp(`value="${p.modeloPadrao.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*>[^<]*\\(recommended, cheapest\\)`), p.id);
});

test("IA: a chave nunca aparece (nem na tela, nem no teste de conexão, nem em mensagem de erro); só se existe", async () => {
  const html = await pagina("/configuracoes");
  assert.ok(!html.includes(SENTINELA) && !html.includes(SENTINELA_2));
  assert.equal((principal(html).match(/Key present/g) ?? []).length, 2, "Anthropic e OpenRouter têm chave no ambiente");
  assert.equal((principal(html).match(/Key missing/g) ?? []).length, 3);
  for (const t of ["/fila", "/agendamento", "/sites", "/contas", "/prontidao", "/publicacoes", "/estoque", "/historico", "/calendario"]) {
    const h = await pagina(t);
    assert.ok(!h.includes(SENTINELA) && !h.includes(SENTINELA_2), t);
  }
  provedorFalso = { idProvedor: "claude", gerar: async () => { throw new ErroProvedor(`falha com ${SENTINELA} no meio`); } };
  const r = await ir("POST", "/api/ia/testar", { provedor: "claude" });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, false);
  assert.ok(!r.texto.includes(SENTINELA), "mensagem de erro sem a chave");
  assert.match(r.json.mensagem, /\*\*\*/);
});

test("IA: escolher provedor e modelo grava ia.provedor e ia.modelo; modelo fora da lista fechada e provedor desconhecido são recusados", async () => {
  const ok = await ir("POST", "/api/ia/escolher", { provedor: "openai", modelo: "gpt-6.1-sol" });
  assert.equal(ok.status, 200);
  assert.equal(ajusteDe("ia.provedor"), "openai");
  assert.equal(ajusteDe("ia.modelo"), "gpt-6.1-sol");
  assert.match(ok.json.mensagem, /Choice saved: OpenAI, model gpt-6\.1-sol\./);
  const tela = principal(await pagina("/configuracoes"));
  assert.match(tela, /class="ia-provedor em-uso" data-card data-ia-provedor="openai"/);
  assert.match(tela, /<option value="gpt-6\.1-sol" selected>/);
  assert.equal((await ir("POST", "/api/ia/escolher", { provedor: "openai", modelo: "modelo-inventado" })).status, 400);
  assert.equal((await ir("POST", "/api/ia/escolher", { provedor: "xyz" })).status, 400);
  assert.equal(ajusteDe("ia.provedor"), "openai", "recusa não altera a escolha");
  assert.equal((await ir("POST", "/api/ia/escolher", { provedor: "gemini" })).json.modelo, "gemini-3.5-flash-lite", "sem modelo: o padrão barato");
});

test("IA: lista consultada não leva aviso; lista sugerida diz que NÃO foi consultada na conta (e por quê)", async () => {
  provedorFalso = {
    idProvedor: "openrouter",
    gerar: async () => ({ textoCru: "{}", tokensEntrada: 12, tokensSaida: 3, modelo: "anthropic/claude-haiku-5.5" }),
    listarModelos: async () => [
      { id: "anthropic/claude-haiku-5.5", nome: "Claude Haiku 5.5", precoEntradaPorMilhao: 0.8, precoSaidaPorMilhao: 4 },
      { id: "outra/coisa", nome: "Modelo sem preço" },
    ],
  };
  const consultada = await ir("POST", "/api/ia/testar", { provedor: "openrouter", modelo: "anthropic/claude-haiku-5.5" });
  assert.equal(consultada.json.ok, true);
  assert.equal(consultada.json.origem, "consultada");
  assert.match(consultada.json.mensagem, /Model that answered: anthropic\/claude-haiku-5\.5\. Tokens used: 12 in, 3 out/);
  assert.match(consultada.json.htmlModelos, /List queried from your account\./);
  assert.doesNotMatch(consultada.json.htmlModelos, /Suggested list/);
  // preço por token aparece quando a API informa e some quando não informa
  assert.match(consultada.json.htmlModelos, /Claude Haiku 5\.5[^<]*\$0\.80 \(USD\) in \/ \$4\.00 \(USD\) out per 1M tokens/);
  const semPreco = /<option[^>]*>Modelo sem preço[^<]*<\/option>/.exec(consultada.json.htmlModelos)![0];
  assert.doesNotMatch(semPreco, /per 1M tokens|\$/);
  assert.match(semPreco, /not in the approved list/);
  assert.match(semPreco, /disabled/);

  provedorFalso = {
    idProvedor: "openrouter",
    gerar: async () => ({ textoCru: "{}", tokensEntrada: 1, tokensSaida: 1, modelo: "m" }),
    listarModelos: async () => { throw new ErroProvedor("serviço fora do ar (HTTP 503)"); },
  };
  const sugerida = await ir("POST", "/api/ia/testar", { provedor: "openrouter" });
  assert.equal(sugerida.json.origem, "sugerida");
  assert.match(sugerida.json.htmlModelos, /data-ia-origem="sugerida"/);
  assert.match(sugerida.json.htmlModelos, /Suggested list \(not queried from your account\)\. Reason: serviço fora do ar/);
  assert.doesNotMatch(sugerida.json.htmlModelos, /List queried from your account/);
  // na tela, antes de testar, a lista é a do registro e diz que é sugerida
  const tela = principal(await pagina("/configuracoes"));
  assert.equal((tela.match(/data-ia-origem="sugerida"/g) ?? []).length, 5);
  assert.match(tela, /Suggested list: it was not queried from your account\. Test the connection to load the real list\./);
  // a mesma função, direto, nos dois idiomas
  const info = PROVEDORES[0]!;
  assert.match(comIdioma("pt-BR", () => blocoModelos(info, { origem: "sugerida", modelos: [] }, info.modeloPadrao)), /Lista sugerida \(não consultada na sua conta\)|Lista sugerida: não foi consultada na sua conta/);
  assert.match(comIdioma("pt-BR", () => blocoModelos(info, { origem: "consultada", modelos: [] }, info.modeloPadrao)), /Lista consultada na sua conta\./);
});

test("IA: chave recusada ou ausente vira frase clara no idioma da pessoa, não erro genérico", async () => {
  provedorFalso = { idProvedor: "claude", gerar: async () => { throw new ErroProvedor(MENSAGEM_CHAVE_RECUSADA); } };
  const recusada = await ir("POST", "/api/ia/testar", { provedor: "claude" });
  assert.equal(recusada.json.ok, false);
  assert.equal(recusada.json.mensagem, "It did not work: The provider refused the key.");
  assert.match((await ir("POST", "/api/ia/testar", { provedor: "claude" }, "pt-BR")).json.mensagem, /Não funcionou: A chave foi recusada pelo provedor\./);
  assert.match((await ir("POST", "/api/ia/testar", { provedor: "claude" }, "ru")).json.mensagem, /Провайдер отклонил ключ/);
  // sem fábrica falsa e sem chave: a variável que falta, em inglês
  const antes = deps.provedorParaTeste;
  delete (deps as { provedorParaTeste?: unknown }).provedorParaTeste;
  const semChave = await ir("POST", "/api/ia/testar", { provedor: "deepseek" });
  deps.provedorParaTeste = antes!;
  assert.match(semChave.json.mensagem, /DEEPSEEK_API_KEY is not set\./);
});

test("IA: o escritor usa a escolha da tela (ia.provedor/ia.modelo) e o idioma do anúncio fica junto do provedor, com o mesmo comportamento do idioma do painel", async () => {
  const fonte = readFileSync(new URL("./rotas-acoes.ts", import.meta.url), "utf8");
  assert.match(fonte, /criarProvedorPorConfig\(db\)/);
  const html = principal(await pagina("/configuracoes"));
  const ia = html.slice(html.indexOf('id="ia"'));
  assert.match(ia, /data-idioma-anuncio/, "idioma do anúncio fica na seção do escritor de IA");
  assert.doesNotMatch(html.slice(0, html.indexOf('id="ia"')), /data-idioma-anuncio/);
  assert.match(html.slice(0, html.indexOf('id="ia"')), /data-idioma-painel/, "idioma do painel fica na aparência");
  assert.doesNotMatch(html, /id="form-idioma"/, "sem formulário com botão Salvar para o idioma");
  assert.match(html, /Language of the generated ads/);
  assert.doesNotMatch(html, /Ad language/);
  assert.match(CLIENTE_JS, /data-idioma-anuncio/);
  assert.match(CLIENTE_JS, /data-idioma-painel/);
});

// ------------------------------------------------------------------ chaves (switch)

test("liga/desliga é chave que desliza: role=switch, aria-checked, sem botão Ligar nem etiqueta repetida", async () => {
  const off = principal(await pagina("/agendamento"));
  assert.match(off, /<button type="button" role="switch" class="chave" aria-checked="false" aria-label="Automatic search" data-acao="agendamento-alternar">/);
  assert.doesNotMatch(off, />(Turn on|Turn off|Ligar|Desligar)</);
  assert.doesNotMatch(off, /class="selo[^"]*">(On|Off|Ligada|Desligada)</);
  await ir("POST", "/api/agendamento", { ligado: true, intervaloMinutos: 60 });
  assert.match(principal(await pagina("/agendamento")), /role="switch" class="chave" aria-checked="true"[^>]*data-acao="agendamento-alternar"/);
  // calendário: "conteúdo gerado por IA" também é chave, não caixinha
  videoAprovado();
  const cal = principal(await pagina("/calendario"));
  assert.match(cal, /role="switch" class="chave" aria-checked="false"[^>]*data-campo="iaGerado"/);
  assert.doesNotMatch(cal, /name="iaGerado"/);
  // teclado: é um <button>, então espaço e Enter funcionam; foco visível; animação respeita movimento reduzido
  assert.match(ESTILO, /\.chave:focus-visible \{ outline-offset: 3px; \}/);
  assert.match(ESTILO, /\.chave-bola \{[^}]*transition: transform 180ms ease/);
  assert.match(ESTILO, /prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ transition: none !important/);
  assert.match(CLIENTE_JS, /acao === "agendamento-alternar" \|\| acao === "site-ativo"/);
});

// ------------------------------------------------------------------------- Sites

const LIDO: ResultadoTeste = {
  legivel: true, situacao: "legivel-autocerto", mensagem: "Lido com sucesso", adaptador: "autocerto", url: "https://loja.example.com",
  carrosNaListagem: 24, avisos: ["aviso em português do leitor"],
  amostra: [{ url: "https://loja.example.com/c1", ficha: { marca: "Fiat", modelo: "Uno", ano: 2015, km: 92991, preco: 22500, moeda: "BRL", fotos: [] } }],
};

test("Sites: testa ANTES de cadastrar, mostra a amostra de carros e só então cadastra (leitor)", async () => {
  siteTestado = LIDO;
  const t = await ir("POST", "/api/sites/testar", { url: "loja.example.com", modo: "playwright" });
  assert.equal(t.json.legivel, true);
  assert.deepEqual(listarSites(abrir()).map((s) => s.id), [], "testar não cadastra");
  assert.match(t.json.html, /Read successfully: the AutoCerto platform was recognized\./);
  assert.match(t.json.html, /24 cars found in the listing\./);
  assert.match(t.json.html, /<td>Fiat Uno<\/td><td>2015<\/td><td>92 991 km<\/td><td>R\$\s22\.500,00 \(BRL\)<\/td>/);
  assert.doesNotMatch(t.json.html, /aviso em português do leitor/, "detalhes em português só aparecem em português");
  assert.match(t.json.html, /data-acao="site-confirmar" data-url="https:\/\/loja\.example\.com" data-adaptador="autocerto"/);
  assert.match((await ir("POST", "/api/sites/testar", { url: "loja.example.com" }, "pt-BR")).json.html, /aviso em português do leitor/);

  const c = await ir("POST", "/api/sites/cadastrar", { url: "https://loja.example.com", adaptador: "autocerto", nome: "Loja Exemplo", modo: "navegador-da-pessoa" });
  assert.equal(c.status, 200);
  const sites = listarSites(abrir());
  assert.equal(sites.length, 1);
  assert.deepEqual([sites[0]!.nome, sites[0]!.modo, sites[0]!.ativo], ["Loja Exemplo", "navegador-da-pessoa", true]);
  const dup = await ir("POST", "/api/sites/cadastrar", { url: "https://loja.example.com", adaptador: "autocerto" });
  assert.equal(dup.status, 400);
  assert.equal(dup.json.erro, "The site loja.example.com is already registered.");
  assert.equal((await ir("POST", "/api/sites/cadastrar", { url: "https://x.com", adaptador: "inventado" })).status, 400);
});

test("Sites: site ilegível não ganha botão de confirmar; cada situação tem frase na língua da pessoa", async () => {
  const casos: [ResultadoTeste["situacao"], RegExp][] = [
    ["recusado-robots", /robots\.txt forbids reading it[^<]*Rule: Disallow: \//],
    ["bloqueado", /The site blocked the reader \(captcha\)/],
    ["ilegivel", /Could not find any car at this address\./],
    ["erro-rede", /Could not open this address/],
    ["navegador-indisponivel", /needs your own browser open/],
    ["precisa-seletor", /needs a custom reader\. It was not added\./],
  ];
  for (const [situacao, re] of casos) {
    siteTestado = { legivel: false, situacao, mensagem: "x", url: "https://x.com", carrosNaListagem: 0, amostra: [], avisos: [], regraRobots: "Disallow: /", sinalBloqueio: "captcha" } as ResultadoTeste;
    const r = await ir("POST", "/api/sites/testar", { url: "x.com" });
    assert.match(r.json.html, re, situacao);
    assert.doesNotMatch(r.json.html, /site-confirmar/);
  }
});

test("Sites: lista com endereço, nome, modo e chave de ativo; aviso OBRIGATÓRIO do modo navegador da pessoa fica escrito na tela", async () => {
  assert.match(principal(await pagina("/sites")), /No site registered yet\. Add the dealership website below\./);
  await ir("POST", "/api/sites/cadastrar", { url: "https://a.example.com", adaptador: "autocerto", nome: "Site A", modo: "playwright" });
  await ir("POST", "/api/sites/cadastrar", { url: "https://b.example.com", adaptador: "jsonld", nome: "Site B", modo: "navegador-da-pessoa" });
  const html = principal(await pagina("/sites"));
  assert.match(html, /Site A <span class="fraco">https:\/\/a\.example\.com<\/span>/);
  assert.match(html, /Site B <span class="fraco">https:\/\/b\.example\.com<\/span>/);
  assert.equal((html.match(/role="switch" class="chave" aria-checked="true"[^>]*data-acao="site-ativo"/g) ?? []).length, 2);
  assert.match(html, /<option value="navegador-da-pessoa" selected>Your own browser<\/option>/);
  assert.match(html, /data-aviso-modo="navegador-da-pessoa">WARNING: sites in the &quot;your own browser&quot; mode do NOT run by themselves/);
  // o formulário de adicionar também avisa, antes de a pessoa escolher o modo
  assert.match(html.slice(html.indexOf('id="form-site"')), /data-aviso-modo="navegador-da-pessoa">WARNING/);
  for (const m of ["playwright", "navegador-da-pessoa", "automatico"]) assert.match(html, new RegExp(`<option value="${m}"`));
  // o agendamento também diz quais sites ele pula
  const ag = principal(await pagina("/agendamento"));
  assert.match(ag, /Site A/);
  assert.match(ag, /These sites use the &quot;your own browser&quot; mode: Site B\. They do NOT run by themselves/);
  // ativo, modo e remover
  assert.equal((await ir("POST", "/api/sites/a.example.com/ativo", { ativo: false })).json.site.ativo, false);
  assert.equal((await ir("POST", "/api/sites/a.example.com/modo", { modo: "automatico" })).json.site.modo, "automatico");
  assert.equal((await ir("POST", "/api/sites/a.example.com/modo", { modo: "voando" })).status, 400);
  assert.match(principal(await pagina("/sites")), /data-aviso-modo="automatico">In the automatic mode/);
  assert.equal((await ir("POST", "/api/sites/b.example.com/remover")).status, 200);
  assert.deepEqual(listarSites(abrir()).map((s) => s.id), ["a.example.com"]);
  assert.equal((await ir("POST", "/api/sites/nao.existe/remover")).json.erro, "Site not registered: nao.existe");
  const nav = await ir("POST", "/api/sites/navegador");
  assert.equal(nav.json.disponivel, false);
  assert.equal(nav.json.mensagem, "Open the browser (Chrome with the BrowserSkill extension) to read this site.");
});

test("Agendador: lê os sites cadastrados (sem baseUrl escondido) e distingue rodada agendada da manual", async () => {
  const fonte = readFileSync(new URL("./rotas-acoes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /baseUrl:\s*ag\.siteUrl/, "o endereço escondido do agendamento não vale mais");
  assert.match(fonte, /agendada,\n/);
  await rodarAgora(deps, true);
  await rodarAgora(deps);
  assert.deepEqual(chamadasRodada.map((c) => c.agendada), [true, false]);
  assert.equal(typeof dependenciasPadrao.executarRodada, "function");
  const semSites = principal(await pagina("/agendamento"));
  assert.match(semSites, /No site registered yet, so there is nothing to read\./);
  assert.doesNotMatch(semSites, /rota66bh/, "nenhum endereço padrão escondido");
});

// ------------------------------------------------------------- calendário: arte do vídeo

test("Calendário: miniatura (um quadro do MP4, em cache) e cartão com arte, carro, preço, rede e horário ao passar o mouse", async () => {
  const id = videoAprovado();
  await ir("POST", "/api/contas/instagram/conectar", { modo: "seco" });
  const db = abrir();
  db.prepare("UPDATE conta_rede SET conectada = 1 WHERE rede = 'instagram'").run();
  db.close();
  const ag = await ir("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T17:00:00Z" });
  assert.equal(ag.status, 201, ag.texto);
  const html = principal(await pagina("/calendario?visao=mes&data=2026-10-22", "pt-BR"));
  assert.match(html, new RegExp(`class="chip-mini" src="/api/videos/${id}/miniatura\\.jpg\\?v=\\d+-\\d+"`));
  assert.match(html, /data-cartao="\d+"/);
  assert.match(html, /<span class="chip-info" hidden>[\s\S]*class="cartao-arte"/);
  assert.match(html, /<strong class="cartao-nome">Toyota Corolla 2020<\/strong>\s*<span class="cartao-preco">R\$\s15\.500,00<\/span>/);
  assert.match(html, /<span class="cartao-quando">Instagram · 22\/10\/2026 14:00 \(Brasília\)<\/span>/);
  assert.match(CLIENTE_JS, /document\.addEventListener\("focusin"/, "aparece também ao focar pelo teclado");
  assert.match(CLIENTE_JS, /ev\.key === "Escape" && flutuante/);
  assert.match(ESTILO, /\.cartao-flutuante \{[^}]*position: fixed/);
  // a rota: um quadro, em cache; o MP4 inteiro nunca é servido por ela
  const m = await ir("GET", `/api/videos/${id}/miniatura.jpg`);
  assert.equal(m.status, 200);
  assert.equal(m.headers.get("content-type"), "image/jpeg");
  assert.match(m.headers.get("cache-control") ?? "", /immutable/);
  assert.ok(m.bytes.length < 100, "é a figura, não o vídeo");
  await ir("GET", `/api/videos/${id}/miniatura.jpg`);
  assert.equal(geradas.length, 1, "segunda vez vem do cache, sem chamar o ffmpeg");
  assert.equal((await ir("GET", "/api/videos/9999/miniatura.jpg")).status, 404);
});

// -------------------------------------------------------- linhas de configuração e barra

test("Configurações, Agendamento e Sites são listas de linhas com fio de 0.5px, não cartões dentro de cartões", async () => {
  for (const t of ["/configuracoes", "/agendamento", "/sites"]) {
    const html = principal(await pagina(t));
    assert.ok((html.match(/class="linha[ "]/g) ?? []).length >= 3, t);
    assert.doesNotMatch(html, /class="cartao[ "]/, `${t}: nada de cartão`);
  }
  const cfg = principal(await pagina("/configuracoes"));
  assert.match(cfg, /<div class="linha"><div class="linha-cab"><label class="linha-rotulo" for="aj-espacamento">Waiting time between posts \(minutes\)<\/label><span class="linha-cab-dir"><button type="button" class="btn-desfazer" data-acao="desfazer" hidden>Undo<\/button><\/span><\/div><p class="linha-ajuda">The wait between two posts on the same network, so TikTok and Instagram do not block your videos for looking repeated\.<\/p>/);
  assert.match(cfg, /<div class="config-pe" data-pe hidden><button type="submit" class="btn primary">Save<\/button><button type="button" class="btn ghost" data-acao="descartar">Discard<\/button><\/div>/);
  // um por grupo que tem formulário (Publicação e Carros vendidos), nunca um botão por campo
  assert.equal((cfg.match(/data-pe/g) ?? []).length, 2, "um Salvar/Descartar no pé de cada grupo, não um botão por campo");
  assert.match(cfg, /Instagram does not accept the file directly: it fetches the video from a web page\./);
  assert.match(cfg, /127\.0\.0\.1 does not work/);
  assert.match(ESTILO, /\.linha \{ display: flex; flex-direction: column; gap: 6px; padding: 12px 0;/);
  assert.match(ESTILO, /\.linha \{ border-top: 0\.5px solid var\(--dsw-alias-border-l2\); \}/);
  assert.match(ESTILO, /\.linha-rotulo \{ font-size: 13px; line-height: 20px; font-weight: 500;/);
  assert.match(ESTILO, /\.campo \{\s*width: 100%; min-height: 36px; padding: 6px 12px;\s*border: 0\.5px solid var\(--dsw-alias-border-l4\); border-radius: var\(--dsw-radius-md\);\s*background: var\(--dsw-alias-bg-layer-3\)/);
  assert.match(ESTILO, /\.config-pe \{[^}]*border-top: 0\.5px solid var\(--dsw-alias-border-l2\)/);
  assert.match(CLIENTE_JS, /function sujo\(f\)/);
});

test("barra lateral com a geometria do Harness; selecionado = hover; Configurações ancoradas no rodapé", () => {
  assert.match(ESTILO, /\.lateral-topo \{[^}]*height: 60px; padding: 8px 0 8px 4px; margin-bottom: 4px;/);
  assert.match(ESTILO, /\.marca \{ font-size: 18px; line-height: 24px; font-weight: 600; letter-spacing: 0\.04em;/);
  assert.match(ESTILO, /min-height: 36px; padding: 7px 8px; margin: 0 2px; line-height: 22px;/);
  assert.match(ESTILO, /\.nav \{ display: flex; flex-direction: column; gap: 4px;/);
  assert.match(ESTILO, /\.nav a:hover, \.lateral-pe a:hover, \.nav a\[aria-current="page"\], \.lateral-pe a\[aria-current="page"\] \{ background: var\(--dsw-alias-interactive-bg-hover\)/);
  assert.doesNotMatch(ESTILO, /\.nav a\[aria-current="page"\] \{[^}]*interactive-bg-active/);
  assert.match(ESTILO, /\.lateral \.icone-btn \{ width: 28px; height: 28px; border-radius: var\(--dsw-radius-sm\)/);
  assert.match(ESTILO, /body\[data-lateral="recolhida"\] \.lateral \{ width: 56px; padding: 18px 10px 6px; gap: 12px;/);
  assert.match(ESTILO, /body\[data-lateral="recolhida"\] \.lateral \.icone-btn \{ width: 36px; height: 36px; border-radius: var\(--dsw-radius-md\)/);
});

test("atualização automática: servidor fora do ar vira aviso calmo (reconectando), com espera crescente, sem tarja vermelha", () => {
  assert.match(CLIENTE_JS, /id = "aviso-reconectando"; el\.className = "aviso info"/);
  assert.match(CLIENTE_JS, /Math\.min\(30000, 2000 \* Math\.pow\(2, tentativasRede\)\)/);
  const atualizar = /function atualizar\(forcar, alvoId\) \{[\s\S]*?\n  \}\n/.exec(CLIENTE_JS)![0];
  assert.doesNotMatch(atualizar, /aviso\("erro"/);
  assert.match(atualizar, /reconectando\(true\)/);
  assert.match(atualizar, /reconectando\(false\)/);
  assert.match(CLIENTE_JS, /"js\.reconectando":"Reconectando\.\.\."/);
});

// ------------------------------------------------- cartão que trabalha e atualização no lugar

function videoComEstado(estado: string, produtoId = 1): number {
  const db = abrir();
  const { video } = criarVideoComJob(db, { produtoId, titulo: "Corolla 2020", corpo: "Texto", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  db.prepare("UPDATE video SET estado = ?, caminho_mp4 = ? WHERE id = ?").run(estado, estado === "aguardando_aprovacao" ? mp4 : null, video.id);
  db.close();
  return video.id;
}

test("Refazer em andamento: o cartão mostra que está trabalhando, com progresso, e as ações vêm disabled de verdade", async () => {
  const antigo = videoComEstado("aguardando_aprovacao");
  const novo = videoComEstado("rascunho");
  const html = principal(await pagina("/fila"));
  const cartao = (id: number): string => new RegExp(`<article class="cartao fila-cartao[^"]*" data-card data-id="${id}"[\\s\\S]*?</article>`).exec(html)![0];
  const fazendo = cartao(novo);
  assert.match(fazendo, /class="cartao fila-cartao trabalhando"[^>]*aria-busy="true"/);
  assert.match(fazendo, /This video is being made\. Nothing can be changed until it finishes/);
  assert.match(fazendo, /role="progressbar"/);
  const botoes = [...fazendo.matchAll(/<button type="button"[^>]*>/g)].map((m) => m[0]);
  assert.ok(botoes.length > 0);
  for (const b of botoes) assert.match(b, /disabled/, b);
  assert.doesNotMatch(fazendo, /data-painel="refazer"/, "sem painel para abrir, logo sem segundo clique");
  // o cartão antigo do mesmo carro fica travado (não é punido com erro: o clique é impossível)
  const travado = cartao(antigo);
  assert.match(travado, /A new version of this video is being made\. This card stays locked until it is ready\./);
  assert.match(travado, /aria-busy="true"/);
  for (const b of [...travado.matchAll(/<button type="button"[^>]*>/g)].map((m) => m[0])) assert.match(b, /disabled/, b);
});

test("Atualização no lugar: só o cartão afetado é trocado, sem recarregar a lista nem mexer na rolagem", () => {
  assert.match(CLIENTE_JS, /function reconciliarLista\(atual, nova, alvoId\)/);
  assert.match(CLIENTE_JS, /existente\.sig === n\.outerHTML/, "cartão que não mudou não é recriado");
  assert.match(CLIENTE_JS, /existente\.replaceWith\(n\)/);
  assert.match(CLIENTE_JS, /atualizar nunca mexe na rolagem/);
  assert.match(CLIENTE_JS, /function cartaoOcupado\(c\)/, "cartão com painel aberto, texto sendo editado ou vídeo tocando é preservado");
  const executar = /function executar\(botao[\s\S]*?\n  \}\n/.exec(CLIENTE_JS)![0];
  assert.match(executar, /atualizar\(true, alvoId\)/, "depois de uma ação, só o cartão da ação é forçado");
  assert.match(CLIENTE_JS, /c\.classList\.add|card\.classList\.add\("trabalhando"\)/);
  assert.match(CLIENTE_JS, /card\.setAttribute\("aria-busy", "true"\)/);
  assert.doesNotMatch(/function atualizar\(forcar, alvoId\) \{[\s\S]*?\n  \}\n/.exec(CLIENTE_JS)![0], /scrollTo/);
});

test("Refazer: as escolhas novas do cardápio (modelo, enquadramento, cor) chegam à rota e ao vídeo novo", async () => {
  const id = videoComEstado("aguardando_aprovacao");
  const r = await ir("POST", `/api/videos/${id}/refazer`, { fundo: "escuro", modelo: "energico", enquadramento: "cheia", cor: "azul" });
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual([r.json.video.fundo, r.json.video.modelo, r.json.video.enquadramento, r.json.video.cor], ["escuro", "energico", "cheia", "azul"]);
  assert.equal((await ir("POST", `/api/videos/${id}/refazer`, { modelo: "inventado" })).status, 400);
});
