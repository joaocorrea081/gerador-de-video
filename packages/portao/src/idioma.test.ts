// Camada de idiomas: catálogo completo, troca de idioma de verdade, tema em três opções, Fila com todas as ações.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { criarVideoComJob, marcarJobConcluido, migrar, type CaracteristicasMidia } from "@gerador/core";
import { CLIENTE_JS, clienteJs } from "./cliente.js";
import { CHAVES_DE_ERRO_DO_NUCLEO, traduzirErro } from "./erros.js";
import { CATALOGOS, IDIOMAS, PENDENTES, comIdioma, idiomaDoCookie, tp, t, type Idioma } from "./idioma/index.js";
import { EN } from "./idioma/en.js";
import { iniciarServidor } from "./servidor.js";
import { formatarBrasilia, formatarDuracao } from "./tempo.js";
import type { Dependencias } from "./rotas-acoes.js";

const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};
const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };

// ---------------------------------------------------------------- catálogo

const base = (chave: string): string => chave.replace(/\.(zero|one|two|few|many|other)$/, "");
const marcadores = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("catálogo: nenhum idioma tem chave faltando nem chave órfã (ro e ru só faltam no que está declarado como pendente)", () => {
  const mestre = new Set(Object.keys(EN).map(base));
  for (const idioma of IDIOMAS) {
    const tem = new Set(Object.keys(CATALOGOS[idioma]).map(base));
    const pendentes = new Set(PENDENTES[idioma]);
    const orfas = [...tem].filter((k) => !mestre.has(k));
    const faltando = [...mestre].filter((k) => !tem.has(k) && !pendentes.has(k));
    const pendenteTraduzida = [...pendentes].filter((k) => tem.has(k));
    const pendenteInexistente = [...pendentes].filter((k) => !mestre.has(k));
    assert.deepEqual(orfas, [], `${idioma}: chave órfã`);
    assert.deepEqual(faltando, [], `${idioma}: chave faltando`);
    assert.deepEqual(pendenteTraduzida, [], `${idioma}: chave pendente que já tem tradução`);
    assert.deepEqual(pendenteInexistente, [], `${idioma}: pendência de chave que não existe`);
  }
  assert.equal(PENDENTES.en.length + PENDENTES["pt-BR"].length, 0, "inglês e português são completos");
});

test("catálogo: a mesma chave leva os mesmos {parâmetros} em todos os idiomas, e cada plural tem as formas do idioma", () => {
  const FORMAS: Record<Idioma, string[]> = { en: ["one", "other"], "pt-BR": ["one", "other"], ro: ["one", "few", "other"], ru: ["one", "few", "many", "other"] };
  for (const idioma of IDIOMAS) {
    const cat = CATALOGOS[idioma];
    for (const [k, v] of Object.entries(cat)) {
      assert.equal(typeof v, "string");
      assert.ok(v.trim().length > 0, `${idioma} ${k} vazio`);
      const modelo = (EN as Record<string, string>)[k] ?? (EN as Record<string, string>)[`${base(k)}.one`];
      if (modelo !== undefined && !/\.(one|few|many|other)$/.test(k)) {
        assert.equal(marcadores(v), marcadores(modelo), `${idioma} ${k}: parâmetros diferentes do inglês`);
      }
    }
    const plurais = new Set(Object.keys(cat).filter((k) => /\.(one|few|many|other)$/.test(k)).map(base));
    for (const b of plurais) {
      const formas = Object.keys(cat).filter((k) => base(k) === b && k !== b).map((k) => k.slice(b.length + 1)).sort();
      assert.deepEqual(formas, [...FORMAS[idioma]].sort(), `${idioma} ${b}: formas de plural`);
    }
  }
});

test("catálogo: toda chave usada no código existe no inglês", () => {
  const primeiros = new Set(Object.keys(EN).map((k) => k.split(".")[0]!));
  const mestre = new Set(Object.keys(EN).map(base));
  const arquivos = [
    "paginas.ts", "paginas-redes.ts", "paginas-publicacao.ts", "cliente.ts", "dados-telas.ts", "servidor.ts", "rotas-acoes.ts",
    "rotas-publicacao.ts", "http.ts", "tempo.ts", "publicacao/prontidao.ts", "publicacao/publicador.ts", "erros.ts",
  ];
  const usadas = new Set<string>();
  for (const a of arquivos) {
    const src = readFileSync(new URL(`./${a}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/["'`]([a-z]+(?:\.[A-Za-z0-9_-]+)+)["'`]/g)) {
      const chave = m[1]!;
      if (primeiros.has(chave.split(".")[0]!)) usadas.add(chave);
    }
  }
  const prefixos = (k: string): boolean => Object.keys(EN).some((c) => c.startsWith(`${k}.`)); // "estado", "pub.estado"... montam a chave na hora
  const sem = [...usadas].filter((k) => !mestre.has(k) && !mestre.has(base(k)) && !prefixos(k));
  assert.deepEqual(sem, [], "chaves usadas e ausentes do catálogo");
  for (const k of CHAVES_DE_ERRO_DO_NUCLEO) assert.ok(mestre.has(k), k);
  assert.ok(usadas.size > 150, "o teste está de fato lendo o código");
});

test("catálogo: sem tradução confiável, cai para o inglês (nunca mostra a chave nem inventa)", () => {
  const pendente = PENDENTES.ro[0]!;
  assert.ok(pendente);
  assert.equal(comIdioma("ro", () => t(pendente as never)), (EN as Record<string, string>)[pendente]);
  assert.equal(comIdioma("ru", () => t("aba.fila")), "Очередь");
});

test("trocar o idioma troca o texto, o plural, a data e a duração", () => {
  assert.equal(comIdioma("en", () => t("aba.fila")), "Queue");
  assert.equal(comIdioma("pt-BR", () => t("aba.fila")), "Fila");
  assert.equal(comIdioma("ro", () => t("aba.fila")), "Coadă");
  assert.equal(comIdioma("ru", () => t("aba.fila")), "Очередь");
  assert.equal(t("aba.fila"), "Fila", "fora de uma requisição o texto sai em português");
  assert.equal(comIdioma("en", () => tp("cartao.fotos", 1)), "1 photo");
  assert.equal(comIdioma("en", () => tp("cartao.fotos", 3)), "3 photos");
  assert.equal(comIdioma("pt-BR", () => tp("cartao.fotos", 0)), "0 fotos");
  assert.equal(comIdioma("ro", () => tp("cartao.fotos", 3)), "3 fotografii");
  assert.equal(comIdioma("ro", () => tp("cartao.fotos", 25)), "25 de fotografii");
  assert.equal(comIdioma("ru", () => tp("estoque.videosFeitos", 2)), "2 видео уже сделаны");
  const iso = "2026-10-21T15:00:00.000Z"; // 12:00 em Brasília
  assert.equal(comIdioma("pt-BR", () => formatarBrasilia(iso)), "21/10/2026 12:00 (Brasília)");
  assert.equal(comIdioma("en", () => formatarBrasilia(iso)), "21/10/2026 12:00 (Brasília time)");
  assert.equal(comIdioma("ro", () => formatarBrasilia(iso)), "21.10.2026 12:00 (ora Brasíliei)");
  assert.equal(comIdioma("ru", () => formatarBrasilia(iso)), "21.10.2026 12:00 (время Бразилиа)");
  assert.equal(comIdioma("ru", () => formatarDuracao(90)), "1 мин 30 с");
  assert.equal(comIdioma("en", () => formatarBrasilia(null)), "never");
});

test("cookie de idioma: sem cookie ou com valor estranho, inglês", () => {
  assert.equal(idiomaDoCookie(undefined), "en");
  assert.equal(idiomaDoCookie("a=b; painel-idioma=ru"), "ru");
  assert.equal(idiomaDoCookie("painel-idioma=pt-BR"), "pt-BR");
  assert.equal(idiomaDoCookie("painel-idioma=klingon"), "en");
});

test("mensagens de erro do núcleo viram o idioma escolhido; as sem padrão saem como vieram", () => {
  assert.equal(comIdioma("pt-BR", () => traduzirErro("vídeo 7 não encontrado")), "vídeo 7 não encontrado");
  assert.equal(comIdioma("en", () => traduzirErro("vídeo 7 não encontrado")), "video 7 not found");
  assert.equal(comIdioma("ru", () => traduzirErro("vídeo 7 não encontrado")), "видео 7 не найдено");
  assert.equal(comIdioma("en", () => traduzirErro("título passa de 80 caracteres")), "title is over 80 characters");
  assert.equal(comIdioma("en", () => traduzirErro("erro que ninguém previu")), "erro que ninguém previu");
});

test("o script do navegador sai em cada idioma, é JavaScript válido e não carrega frase em português no inglês", () => {
  for (const i of IDIOMAS) assert.doesNotThrow(() => new Function(clienteJs(i)), i);
  assert.match(clienteJs("en"), /"js\.aprovado":"Video approved\. It went to History\."/);
  assert.match(clienteJs("pt-BR"), /"js\.aprovado":"Vídeo aprovado\. Ele foi para o Histórico\."/);
  assert.match(clienteJs("ru"), /"js\.aprovado":"Видео одобрено/);
  assert.equal(CLIENTE_JS, clienteJs("pt-BR"));
  assert.match(clienteJs("en"), /var IDIOMA = "en"/);
});

test("nenhuma cor escrita à mão nos arquivos novos", () => {
  const dir = new URL("./idioma/", import.meta.url);
  const arquivos = [...readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => new URL(f, dir)), new URL("./erros.ts", import.meta.url), new URL("./estilo.ts", import.meta.url)];
  for (const a of arquivos) {
    const f = readFileSync(a, "utf8");
    assert.doesNotMatch(f, /#[0-9a-fA-F]{3,8}\b/, `${a.pathname}: cor hexadecimal`);
    assert.doesNotMatch(f, /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/, `${a.pathname}: cor funcional`);
  }
});

// ------------------------------------------------------------------ servidor

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let url: string;
const agora = new Date("2026-10-21T15:00:00.000Z");
function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}
const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => { throw new Error("sem chave"); },
  executarRodada: async () => { throw new Error("não usado"); },
  relerProduto: async () => { throw new Error("não usado"); },
  agora: () => agora,
  lerMidia: async () => BOA,
  envPublicacao: {},
};
before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-idioma-"));
  writeFileSync(join(pasta, "v.mp4"), "x");
  servidor = iniciarServidor(0, { deps, agendadorAutomatico: false });
  await new Promise<void>((r) => servidor.once("listening", () => r()));
  url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((r) => servidor.close(() => r()));
  rmSync(pasta, { recursive: true, force: true });
});
beforeEach(() => {
  caminhoBanco = join(pasta, `t-${Math.random().toString(36).slice(2)}.db`);
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, ?, 1024, 768, ?, ?)").run(`http://x/f${i}`, `/tmp/f${i}.jpg`, i);
  const { video, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla 2020 impecável", corpo: "Um carro bom.", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, video.id, join(pasta, "v.mp4"));
  db.close();
});
async function pegar(caminho: string, idioma?: string, extra: RequestInit = {}): Promise<{ status: number; html: string; headers: Headers }> {
  const r = await fetch(url + caminho, { redirect: "manual", ...extra, headers: { ...(idioma ? { cookie: `painel-idioma=${idioma}` } : {}) } });
  return { status: r.status, html: await r.text(), headers: r.headers };
}
const TELAS = ["/fila", "/calendario", "/publicacoes", "/estoque", "/historico", "/contas", "/prontidao", "/agendamento", "/configuracoes"];

test("sem cookie o painel sai em inglês; com cookie, no idioma escolhido, em todas as telas", async () => {
  for (const tela of TELAS) {
    const en = await pegar(tela);
    assert.equal(en.status, 200, tela);
    assert.match(en.html, /<html lang="en">/, tela);
    assert.doesNotMatch(en.html, /Aprovar|Rejeitar|Configurações|Calendário|Publicações|Histórico|Agendamento|Prontidão|Gerador de vídeo/, `${tela}: português vazando no inglês`);
    const pt = await pegar(tela, "pt-BR");
    assert.match(pt.html, /<html lang="pt-BR">/);
    assert.match(pt.html, /Gerador de vídeo/);
    assert.match(pt.html, /Pular para o conteúdo/);
    const ru = await pegar(tela, "ru");
    assert.match(ru.html, /<html lang="ru">/);
    assert.match(ru.html, /Очередь/);
    const ro = await pegar(tela, "ro");
    assert.match(ro.html, /<html lang="ro">/);
    assert.match(ro.html, /Coadă/);
    assert.equal(en.headers.get("content-type"), "text/html; charset=utf-8");
  }
});

test("a Fila: mesmo cartão em inglês e em português, com as ações todas, agrupadas em decisão e ferramentas", async () => {
  for (const [idioma, rotulos] of [
    ["en", ["Approve", "Reject", "Redo video", "Rewrite text", "Edit text", "Captions &amp; preview"]],
    ["pt-BR", ["Aprovar", "Rejeitar", "Refazer vídeo", "Reescrever texto", "Editar texto", "Legenda e prévia"]],
    ["ro", ["Aprobă", "Respinge", "Refă videoclipul", "Rescrie textul", "Editează textul", "Legendă și previzualizare"]],
    ["ru", ["Одобрить", "Отклонить", "Переделать видео", "Переписать текст", "Изменить текст", "Подписи и предпросмотр"]],
  ] as const) {
    const { html } = await pegar("/fila", idioma);
    for (const acao of ['data-acao="aprovar"', 'data-abre="rejeitar"', 'data-abre="refazer"', 'data-acao="reescrever"', 'data-abre="editar"', 'data-abre="redes"']) {
      assert.ok(html.includes(acao), `${idioma}: ${acao}`);
    }
    for (const r of rotulos) assert.ok(html.includes(`>${r}</button>`), `${idioma}: botão "${r}"`);
    const decisao = html.indexOf("acoes-decisao");
    const ferramentas = html.indexOf("acoes-ferramentas");
    assert.ok(decisao > 0 && ferramentas > decisao, `${idioma}: decisões antes das ferramentas`);
    const grupoDecisao = html.slice(decisao, ferramentas);
    assert.ok(grupoDecisao.includes('data-acao="aprovar"') && grupoDecisao.includes('data-abre="rejeitar"'));
    assert.ok(!grupoDecisao.includes('data-acao="reescrever"'));
    const grupoFerramentas = html.slice(ferramentas, html.indexOf('data-painel="rejeitar"'));
    for (const f of ['data-abre="refazer"', 'data-acao="reescrever"', 'data-abre="editar"', 'data-abre="redes"']) assert.ok(grupoFerramentas.includes(f), `${idioma}: ${f} em ferramentas`);
    assert.match(html, /<details class="detalhes|class="selos-rede"/, "validação compacta");
    assert.match(html, /class="lista-fila"/);
    assert.match(html, /class="fila-nome">Toyota Corolla</);
  }
});

test("prévia das redes: moldura do feed com barra de cima, ícones, conta de exemplo marcada, legenda cortada e contagem", async () => {
  const { html } = await pegar("/fila", "en");
  for (const r of ["instagram", "facebook", "tiktok"]) assert.match(html, new RegExp(`class="previa previa-${r}"`));
  assert.equal((html.match(/class="previa-topo"/g) ?? []).length, 3);
  assert.equal((html.match(/class="previa-lateral"/g) ?? []).length, 3);
  assert.equal((html.match(/<span class="previa-exemplo">example<\/span>/g) ?? []).length, 3);
  assert.match(html, /@your_account/);
  assert.match(html, /data-previa-contagem="tiktok" data-limite="\d+">\d+ \/ \d+ characters/);
  assert.match(html, /9:16 ratio, as on TikTok\. The caption is cut at about 100 characters\./);
  assert.match(html, /For You/);
});

test("tema: ícone discreto no topo (sem botão com texto na barra lateral); as 3 opções ficam em Configurações", async () => {
  for (const tela of TELAS) {
    const { html } = await pegar(tela, "en");
    assert.match(html, /<header class="barra-topo">[\s\S]*id="alternar-tema"[^>]*aria-label="Switch to dark theme"/, tela);
    assert.doesNotMatch(html, /class="lateral-pe">\s*<button/, `${tela}: nada de botão de tema no pé da barra lateral`);
    assert.match(html, /class="lateral-pe"><a href="\/configuracoes"[^>]*>/, `${tela}: Configurações ancoradas no rodapé da barra`);
    assert.doesNotMatch(html, /class="nav-rotulo">(Dark|Light) theme</);
  }
  const { html } = await pegar("/configuracoes", "en");
  assert.deepEqual([...html.matchAll(/name="tema" value="(\w+)"/g)].map((m) => m[1]), ["light", "dark", "system"]);
  for (const rotulo of ["Light", "Dark", "Follow the system"]) assert.match(html, new RegExp(`name="tema" value="\\w+"[^>]*/> <span>${rotulo}</span>`), `rótulo do tema em inglês: ${rotulo}`);
  assert.doesNotMatch(html, /<span>(claro|escuro|sistema)<\/span>/i);
  assert.match(html, /Follow the system/);
  assert.match(html, /<option value="en" selected>English<\/option>/);
  assert.match(html, /<option value="pt-BR">Português \(Brasil\)<\/option>/);
  assert.match(html, /<option value="ro">Română<\/option>/);
  assert.match(html, /<option value="ru">Русский<\/option>/);
  // aplicado antes da pintura, com "seguir o sistema"
  assert.match(html, /\(p==="sistema"\|\|p==="system"\)&&window\.matchMedia\("\(prefers-color-scheme: dark\)"\)\.matches/);
  assert.match(html, /<body>\s*<script>try\{var p=localStorage/);
  assert.match(CLIENTE_JS, /prefers-color-scheme: dark/);
  assert.match(CLIENTE_JS, /guardarTema\(t\.value\)/);
});

test("Configurações é a rota nova; /ajustes redireciona (link antigo continua valendo)", async () => {
  const velho = await pegar("/ajustes");
  assert.equal(velho.status, 301);
  assert.equal(velho.headers.get("location"), "/configuracoes");
  const novo = await pegar("/configuracoes", "ru");
  assert.equal(novo.status, 200);
  assert.match(novo.html, /<title>Настройки — Генератор видео<\/title>/);
});

test("telas largas: o conteúdo usa a largura, não fica numa coluna estreita", async () => {
  const css = await pegar("/painel.css");
  assert.match(css.html, /main \{ width: 100%; max-width: 1840px/);
  assert.match(css.html, /\.lista-fila \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 600px\), 1fr\)\)/);
  assert.match(css.html, /\.fila-cartao \{ display: grid; grid-template-columns: 208px minmax\(0, 1fr\)/);
  assert.match(css.html, /\.fila-acoes \{[^}]*align-items: flex-start/, "decisões e ferramentas juntas à esquerda, nunca em extremos opostos");
  assert.doesNotMatch(css.html, /\.fila-acoes \{[^}]*space-between/);
  assert.match(css.html, /\.fila-midia video, \.fila-midia \.semvideo \{[^}]*height: 370px/, "altura do vídeo limitada entre 360 e 440px");
  assert.match(css.html, /\.anuncio \.corpo, \.fila-corpo \.escolhas \{ max-width: 75ch/, "medida do texto");
  assert.match(css.html, /main\[data-aba="contas"\], main\[data-aba="prontidao"\]/);
  assert.doesNotMatch(css.html, /max-width: 1080px/);
});

test("erro do servidor sai no idioma escolhido", async () => {
  const chamar = async (idioma?: string) => {
    const r = await fetch(`${url}/api/estoque/999/gerar-video`, { method: "POST", headers: idioma ? { cookie: `painel-idioma=${idioma}` } : {} });
    return (await r.json()) as { erro: string };
  };
  assert.equal((await chamar()).erro, "product 999 not found");
  assert.equal((await chamar("pt-BR")).erro, "produto 999 não encontrado");
  assert.equal((await chamar("ru")).erro, "товар 999 не найден");
  const e404 = await fetch(`${url}/nada`, { headers: { cookie: "painel-idioma=ro" } });
  assert.equal(((await e404.json()) as { erro: string }).erro, "negăsit");
});

test("validação de mídia sai no idioma escolhido (regras do núcleo, texto do catálogo)", async () => {
  const ruim: CaracteristicasMidia = { ...BOA, largura: 1920, altura: 1080 };
  const velho = deps.lerMidia!;
  deps.lerMidia = async () => ruim;
  try {
    const pt = await pegar("/fila", "pt-BR");
    assert.match(pt.html, /Proporção 1920x1080: o Facebook Reels exige 9:16 \(vertical\)\./);
    const en = await pegar("/fila", "en");
    assert.match(en.html, /Ratio 1920x1080: Facebook Reels requires 9:16 \(vertical\)\./);
  } finally {
    deps.lerMidia = velho;
  }
});

// ------------------------------------------------------------ dinheiro e quilometragem

import { formatarKm, formatarPreco } from "./dinheiro.js";

/** Lê o texto como um brasileiro leria o número (ponto = milhar, vírgula = centavos) e como um anglófono. */
const valorBr = (s: string): number => Number(s.match(/\d[\d.   ]*(?:,\d+)?/)![0].replace(/[.   ]/g, "").replace(",", "."));

test("o mesmo preço em BRL é inequivocamente 22.500 nos quatro idiomas (nunca 22,50)", () => {
  const por = Object.fromEntries(IDIOMAS.map((i) => [i, formatarPreco(22500, "BRL", i)]));
  for (const i of IDIOMAS) {
    assert.match(por[i]!, /R\$\s?22\.500,00/, `${i}: ${por[i]}`);
    assert.equal(valorBr(por[i]!), 22500, i);
    assert.doesNotMatch(por[i]!, /22,500|22[.,]50\b(?!0)/);
  }
  assert.doesNotMatch(por["pt-BR"]!, /BRL/, "em português a moeda é a esperada");
  for (const i of ["en", "ro", "ru"] as const) assert.match(por[i]!, /\(BRL\)/, `${i}: código da moeda à vista`);
});

test("quilometragem 92.991 km nos quatro idiomas, sempre com separador de milhar legível", () => {
  assert.equal(formatarKm(92991, "pt-BR"), "92.991 km");
  assert.equal(formatarKm(92991, "en"), "92 991 km");
  assert.equal(formatarKm(92991, "ro"), "92 991 km");
  assert.equal(formatarKm(92991, "ru"), "92 991 км");
  for (const i of IDIOMAS) assert.doesNotMatch(formatarKm(92991, i), /^92 |92991|^92,|^92\.(?!991)/);
});

test("ficha sem moeda: nenhum símbolo de moeda é inventado e a tela diz que a moeda não foi informada", () => {
  for (const i of IDIOMAS) {
    const s = formatarPreco(22500, undefined, i);
    assert.doesNotMatch(s, /R\$|\$|€|£|₽|BRL|USD|EUR/, `${i}: ${s}`);
    assert.match(s, new RegExp(CATALOGOS[i]["cartao.moedaNaoInformada"] ?? EN["cartao.moedaNaoInformada"]));
  }
  assert.doesNotMatch(formatarPreco(22500, "", "pt-BR"), /R\$/);
});

test("telas: preço e km aparecem pela moeda do dado em todos os idiomas; ficha sem moeda não ganha R$", async () => {
  for (const i of IDIOMAS) {
    const { html } = await pegar("/fila", i);
    assert.match(html, /R\$\s?15\.500,00/, i);
    assert.match(html, i === "pt-BR" ? /48\.000 km/ : /48 000 (km|км)/, i);
    if (i !== "pt-BR") assert.match(html, /15\.500,00[^<]*\(BRL\)/, i);
  }
  const db = abrir();
  db.prepare("UPDATE produto SET dados_json = ? WHERE id = 1").run(JSON.stringify({ ...FICHA, moeda: undefined }));
  db.close();
  const sem = await pegar("/fila", "en");
  assert.doesNotMatch(sem.html, /R\$/);
  assert.match(sem.html, /currency not stated/);
});
