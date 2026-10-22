// As cinco telas do painel, pelo servidor real (127.0.0.1, porta efêmera).
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  criarVideoComJob,
  FUNDOS_ESCOLHA,
  listarCardapio,
  marcarJobConcluido,
  MOTIVOS_REJEICAO,
  migrar,
  registrarRodada,
  rejeitarVideo,
  RITMOS_ESCOLHA,
} from "@gerador/core";
import { ESTILO } from "./estilo.js";
import { CLIENTE_JS } from "./cliente.js";
import { infoProvedor } from "./paginas.js";
import { formatarBrasilia, formatarDuracao } from "./tempo.js";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };
const SEGREDO = "sk-SEGREDO-NAO-PODE-VAZAR-123";

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
const agora = new Date("2026-10-21T15:00:00.000Z");

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => {
    throw new Error("não usado");
  },
  executarRodada: async () => {
    throw new Error("não usado");
  },
  relerProduto: async () => {
    throw new Error("não usado");
  },
  agora: () => agora,
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-telas-"));
  servidor = iniciarServidor(0, { deps, agendadorAutomatico: false });
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => servidor.close(() => r()));
  rmSync(pasta, { recursive: true, force: true });
});

beforeEach(() => {
  caminhoBanco = join(pasta, `t-${Math.random().toString(36).slice(2)}.db`);
  abrir().close();
});

function semear(): void {
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(
    JSON.stringify(FICHA),
    "2026-10-21T12:00:00.000Z",
  );
  for (let i = 0; i < 3; i++) {
    db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, ?, 1024, 768, ?, ?)").run(
      `http://x/f${i}`,
      `/tmp/f${i}.jpg`,
      i,
    );
  }
  db.close();
}

function videoPronto(): number {
  const db = abrir();
  const { video, job } = criarVideoComJob(db, {
    produtoId: 1,
    titulo: "Corolla 2020 impecável",
    corpo: "Um carro bom.",
    fundo: "claro",
    ritmo: "calmo",
    ordemFotos: [],
  });
  marcarJobConcluido(db, job.id, video.id, "/tmp/v.mp4");
  db.close();
  return video.id;
}

async function pegar(caminho: string): Promise<{ status: number; html: string }> {
  const r = await fetch(base + caminho, { headers: { cookie: "painel-idioma=pt-BR" } });
  return { status: r.status, html: await r.text() };
}

const TELAS: [string, string][] = [
  ["/fila", "Fila"],
  ["/calendario", "Calendário"],
  ["/publicacoes", "Publicações"],
  ["/estoque", "Estoque"],
  ["/historico", "Histórico"],
  ["/contas", "Contas"],
  ["/prontidao", "Prontidão"],
  ["/agendamento", "Agendamento"],
  ["/configuracoes", "Configurações"],
];

test("cada uma das 9 telas responde 200 com a barra lateral, as 9 seções e o tema", async () => {
  for (const [caminho, titulo] of TELAS) {
    const { status, html } = await pegar(caminho);
    assert.equal(status, 200, caminho);
    assert.match(html, new RegExp(`<title>${titulo} — Gerador de vídeo</title>`));
    assert.match(html, /<aside class="lateral" id="lateral"/);
    for (const [aba] of TELAS) assert.ok(html.includes(`href="${aba}"`), `${caminho} sem seção ${aba}`);
    assert.doesNotMatch(html, /class="topo"/, "a barra de cima não existe mais");
    assert.match(html, /href="\/tema\/design-platform\.css"/);
    assert.match(html, /id="alternar-tema"/);
    assert.match(html, /id="recolher"[^>]*aria-expanded="true"/);
    assert.match(html, /id="abrir-gaveta"[^>]*aria-expanded="false"/);
    assert.match(html, /aria-current="page"/);
  }
});

test("telas vazias dizem o que fazer, não ficam em branco", async () => {
  assert.match((await pegar("/fila")).html, /Nenhum vídeo esperando você/);
  assert.match((await pegar("/estoque")).html, /Nenhum carro lido ainda/);
  assert.match((await pegar("/historico")).html, /Nada saiu ainda/);
});

test("Fila: mostra o progresso (quantos faltam, qual renderiza, quanto falta)", async () => {
  semear();
  const db = abrir();
  const a = criarVideoComJob(db, { produtoId: 1, titulo: "A", corpo: "a", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  criarVideoComJob(db, { produtoId: 1, titulo: "B", corpo: "b", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  db.prepare("UPDATE job SET estado = 'em_execucao', iniciado_em = ? WHERE id = ?").run("2026-10-21T14:59:30.000Z", a.job.id);
  db.close();
  const { html } = await pegar("/fila");
  assert.match(html, /Renderizando o vídeo <strong>#\d+<\/strong> há 30 s/);
  assert.match(html, /<span class="num">2<\/span><span class="leg">na fila de render/);
  assert.match(html, /<span class="num">1<\/span><span class="leg">esperando a vez/);
  assert.match(html, /para terminar tudo/);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /data-viva="sempre"/);
});

test("Fila: cartão tem player, ficha, texto e as cinco ações", async () => {
  semear();
  const id = videoPronto();
  const { html } = await pegar("/fila");
  assert.match(html, new RegExp(`<video src="/video/${id}\\.mp4"`));
  assert.match(html, /Toyota Corolla/);
  assert.match(html, /48\.000 km/);
  assert.match(html, /Corolla 2020 impecável/);
  for (const acao of ['data-acao="aprovar"', 'data-abre="rejeitar"', 'data-abre="refazer"', 'data-acao="reescrever"', 'data-abre="editar"']) {
    assert.ok(html.includes(acao), acao);
  }
  for (const m of MOTIVOS_REJEICAO) assert.ok(html.includes(`data-motivo="${m}"`), m);
  assert.equal((html.match(/data-motivo=/g) ?? []).length, 5);
  assert.match(html, /maxlength="80"/);
  assert.match(html, /maxlength="400"/);
});

test("Fila: o painel de refazer é montado da lista do núcleo (listarCardapio) e só oferece o cardápio fechado", async () => {
  semear();
  videoPronto();
  const { html } = await pegar("/fila");
  const cardapio = listarCardapio();
  const campos: Record<string, string> = { modelos: "modelo", enquadramentos: "enquadramento", cores: "cor", fundos: "fundo", ritmos: "ritmo" };
  for (const [lista, opcoes] of Object.entries(cardapio)) {
    const campo = campos[lista]!;
    const bloco = [...html.matchAll(new RegExp(`data-grupo="${campo}"[^>]*>(.*?)</div>`, "gs"))][0]![1]!;
    assert.deepEqual([...bloco.matchAll(/data-escolha="([^"]+)"/g)].map((m) => m[1]), opcoes.map((o: { id: string }) => o.id), campo);
  }
  assert.deepEqual([...FUNDOS_ESCOLHA], cardapio.fundos.map((o) => o.id));
  assert.deepEqual([...RITMOS_ESCOLHA], cardapio.ritmos.map((o) => o.id));
  assert.equal((html.match(/data-grupo="/g) ?? []).length, 5, "modelo, enquadramento, cor, fundo e ritmo (mais a ordem das fotos)");
  assert.equal((html.match(/data-foto="/g) ?? []).length, 3, "3 fotos na ordem");
  assert.doesNotMatch(html, /name="(cor|musica|fonte|prompt)"/);
  assert.match(html, />Institucional<\/button>/, "nome legível do catálogo");
});

test("Fila: vídeo renderizando não oferece aprovar", async () => {
  semear();
  const db = abrir();
  const { video } = criarVideoComJob(db, { produtoId: 1, titulo: "X", corpo: "x", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  db.prepare("UPDATE video SET estado = 'renderizando' WHERE id = ?").run(video.id);
  db.close();
  const { html } = await pegar("/fila");
  assert.doesNotMatch(html, /data-acao="aprovar"/);
  assert.match(html, /Renderizando agora/);
});

test("Estoque: preço, km, fotos, quando foi lido (Brasília) e estado do vídeo", async () => {
  semear();
  const { html: sem } = await pegar("/estoque");
  assert.match(sem, /R\$\s?15\.500,00/);
  assert.match(sem, /48\.000 km/);
  assert.match(sem, /21\/10\/2026 09:00 \(Brasília\)/);
  assert.match(sem, /Sem vídeo/);
  assert.match(sem, /data-acao="gerar-video"/);
  assert.match(sem, /data-acao="reler"/);
  videoPronto();
  const { html: com } = await pegar("/estoque");
  assert.match(com, /Aguardando sua aprovação|Na fila|Renderizando/);
  assert.doesNotMatch(com, /data-acao="gerar-video"/);
  assert.match(com, /data-acao="reler"/);
});

test("Histórico: só o que saiu (publicado ou rejeitado, com o motivo); vídeo aprovado que não saiu é fila, não histórico", async () => {
  semear();
  const v1 = videoPronto();
  const db = abrir();
  rejeitarVideo(db, { videoId: v1, motivo: "foto_ruim" });
  const v2 = videoPronto();
  db.prepare("UPDATE video SET estado = 'aprovado' WHERE id = ?").run(v2);
  db.close();
  const { html } = await pegar("/historico");
  assert.match(html, /Tudo o que já saiu/, "o propósito da tela fica escrito no topo");
  assert.match(html, /Rejeitado em \d\d\/\d\d\/\d{4}[^<]*Motivo: Foto ruim\./);
  assert.match(html, /Rejeitados <span class="fraco">1<\/span>/);
  assert.match(html, /Publicados <span class="fraco">0<\/span>/);
  assert.doesNotMatch(html, new RegExp(`data-id="${v2}"`), "aprovado e não publicado não é histórico");
});

test("Agendamento: converte a hora UTC para Brasília", async () => {
  const db = abrir();
  registrarRodada(db, { iniciadaEm: "2026-10-21T14:59:00.000Z", terminadaEm: "2026-10-21T15:00:00.000Z", itens: [] });
  db.close();
  await fetch(base + "/api/agendamento", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "painel-idioma=pt-BR" },
    body: JSON.stringify({ ligado: true, intervaloMinutos: 60 }),
  });
  const { html } = await pegar("/agendamento");
  assert.match(html, /21\/10\/2026 12:00 \(Brasília\)/, "última rodada 15:00Z = 12:00");
  assert.match(html, /21\/10\/2026 13:00 \(Brasília\)/, "próxima = 13:00");
  assert.doesNotMatch(html, /2026-10-21T15:00/);
  assert.match(html, /role="switch" class="chave" aria-checked="true"[^>]*data-acao="agendamento-alternar"/);
  assert.doesNotMatch(html, /data-acao="(ligar|desligar)"/, "sem botão Ligar/Desligar: a chave mostra o estado");
  assert.match(html, /data-acao="rodar-agora"/);
  assert.match(html, /<option value="60" selected>/);
});

test("Agendamento: desligado explica que nada roda sozinho", async () => {
  const { html } = await pegar("/agendamento");
  assert.match(html, /Desligado: nada roda sozinho/);
  assert.match(html, /role="switch" class="chave" aria-checked="false"[^>]*data-acao="agendamento-alternar"/);
  assert.match(html, /Ainda não rodou/);
});

test("Configurações: nunca imprime a chave e diz se ela existe", async () => {
  const antes = { ...process.env };
  try {
    process.env["PROVEDOR_IA"] = "claude";
    process.env["ANTHROPIC_API_KEY"] = SEGREDO;
    const com = await pegar("/configuracoes");
    assert.match(com.html, /Chave presente/);
    assert.ok(!com.html.includes(SEGREDO));
    assert.ok(!com.html.includes("SEGREDO"));
    delete process.env["ANTHROPIC_API_KEY"];
    const sem = await pegar("/configuracoes");
    assert.match(sem.html, /Chave ausente/);
    assert.match(sem.html, /ANTHROPIC_API_KEY/);
  } finally {
    for (const k of ["PROVEDOR_IA", "ANTHROPIC_API_KEY"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
});

test("Configurações: idioma e rejeições por motivo", async () => {
  semear();
  const v = videoPronto();
  const db = abrir();
  rejeitarVideo(db, { videoId: v, motivo: "ritmo" });
  db.close();
  const { html } = await pegar("/configuracoes");
  assert.match(html, /<option value="pt-BR" selected>/);
  assert.match(html, /<div class="num">1<\/div><div class="leg">Ritmo/);
  for (const m of ["Foto ruim", "Texto errado", "Dado errado", "Fundo"]) assert.ok(html.includes(m), m);
});

test("infoProvedor só devolve se a chave existe", () => {
  const i = infoProvedor({ PROVEDOR_IA: "deepseek", DEEPSEEK_API_KEY: SEGREDO });
  assert.equal(i.chavePresente, true);
  assert.ok(!JSON.stringify(i).includes(SEGREDO));
  assert.equal(infoProvedor({}).chavePresente, false);
  assert.equal(infoProvedor({ PROVEDOR_IA: "xyz" }).desconhecido, true);
});

test("hora de Brasília: virada de dia e valores vazios", () => {
  assert.equal(formatarBrasilia("2026-10-21T03:00:00.000Z"), "21/10/2026 00:00 (Brasília)");
  assert.equal(formatarBrasilia("2026-10-21T02:59:00.000Z"), "20/10/2026 23:59 (Brasília)");
  assert.equal(formatarBrasilia(null), "nunca");
  assert.equal(formatarBrasilia("lixo", "—"), "—");
  assert.equal(formatarDuracao(45), "45 s");
  assert.equal(formatarDuracao(90), "1 min 30 s");
});

test("arquivos de estilo e script são servidos; tema não vaza caminho", async () => {
  const css = await pegar("/painel.css");
  assert.equal(css.status, 200);
  const js = await pegar("/painel.js");
  assert.equal(js.status, 200);
  assert.doesNotThrow(() => new Function(js.html));
  const tema = await pegar("/tema/design-platform.css");
  assert.equal(tema.status, 200);
  assert.match(tema.html, /--dsw-alias-button-primary-fill/);
  assert.equal((await pegar("/tema/ORIGEM.md")).status, 404);
  assert.equal((await pegar("/tema/..%2Fservidor.ts")).status, 404);
});

test("identidade: medidas do Harness e nenhuma cor escrita à mão", () => {
  assert.match(ESTILO, /height: 36px/);
  assert.match(ESTILO, /height: 28px/);
  assert.match(ESTILO, /border: 0\.5px solid var\(--dsw-alias-border-l3\)/);
  assert.match(ESTILO, /transition: transform 180ms ease/);
  assert.match(ESTILO, /padding: 4px;\s*\n\s*border-radius: var\(--dsw-radius-lg\)/);
  assert.match(ESTILO, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(CLIENTE_JS, /data-ds-dark-theme/);
  const fontes = [ESTILO, CLIENTE_JS, readFileSync(new URL("./paginas.ts", import.meta.url), "utf8")];
  for (const f of fontes) {
    assert.doesNotMatch(f, /#[0-9a-fA-F]{3,8}\b/, "cor hexadecimal escrita à mão");
    assert.doesNotMatch(f, /\b(rgb|rgba|hsl|hsla)\(/, "cor funcional escrita à mão");
  }
  assert.doesNotMatch(ESTILO, /DeepSeek Harness/i);
});

import { ERROS_JS } from "./cliente.js";

function mensagemDeErro(e: unknown): { texto: string; link: { href: string } | null } {
  return new Function(`${ERROS_JS}; return mensagemDeErro;`)()(e);
}

test("erro chave_ausente: frase de usuário, sem variável nem arquivo interno, com atalho para Configurações", () => {
  const tecnica =
    "ANTHROPIC_API_KEY não está definida. Configure a chave do cliente no ambiente — nunca no código, nunca inventada (ver ESCOPO-CLIENTE.md).";
  const r = mensagemDeErro(Object.assign(new Error(tecnica), { codigo: "chave_ausente" }));
  assert.match(r.texto, /Falta configurar a chave de acesso da inteligência artificial\. Veja em Configurações\./);
  assert.ok(!r.texto.includes("ANTHROPIC_API_KEY"));
  assert.ok(!r.texto.includes("ESCOPO-CLIENTE.md"));
  assert.equal(r.link?.href, "/configuracoes");
});

test("erro sem código conhecido continua mostrando a mensagem do servidor", () => {
  assert.equal(mensagemDeErro(new Error("motivo é obrigatório")).texto, "motivo é obrigatório");
  assert.equal(mensagemDeErro(Object.assign(new Error("coisa nova"), { codigo: "desconhecido_x" })).texto, "coisa nova");
  assert.equal(mensagemDeErro(Object.assign(new Error("x"), { codigo: "constructor" })).texto, "x");
});

test("cartão da fila com painel aberto ocupa a largura inteira e só um fica aberto", () => {
  assert.match(ESTILO, /\.fila-cartao\.aberto \{ grid-column: 1 \/ -1;/);
  assert.match(CLIENTE_JS, /querySelectorAll\("\.fila-cartao\.aberto"\)\.forEach\(function \(o\) \{ if \(o !== card\) fecharPaineis\(o\)/);
  assert.match(CLIENTE_JS, /card\.classList\.toggle\("aberto", !!aberto\)/);
});

test("painéis embutidos rolam para a vista e respeitam movimento reduzido", async () => {
  assert.match(CLIENTE_JS, /scrollIntoView\(\{ block: "nearest", behavior: comp \}\)/);
  assert.match(CLIENTE_JS, /var comp = menos \? "auto" : "smooth"/);
  assert.match(CLIENTE_JS, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(CLIENTE_JS, /setAttribute\("aria-expanded", "true"\)/);
  semear();
  videoPronto();
  assert.match((await pegar("/fila")).html, /data-abre="refazer" aria-pressed="false" aria-expanded="false"/);
});
