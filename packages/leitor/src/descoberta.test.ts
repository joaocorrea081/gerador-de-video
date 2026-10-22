import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarAdaptador, normalizarEndereco, testarSite, EnderecoInvalidoError } from "./descoberta.js";
import { BloqueioError } from "./bloqueio.js";
import { NavegadorIndisponivelError } from "./navegador-pessoa.js";
import { fixture, navegadorFalso, robotsDe, ROBOTS_LIVRE } from "./teste-util.js";

const ZE = "https://autosdoze.example.com.br";

const siteJsonLd = (url: string): string => {
  if (url === `${ZE}/estoque`) return fixture("generico-listagem.html");
  if (url.endsWith("-1001")) return fixture("generico-detalhe-1.html");
  if (url.endsWith("-1002")) return fixture("generico-detalhe-2.html");
  if (url.endsWith("-1003")) return fixture("generico-detalhe-sem-preco.html");
  throw new Error(`url inesperada: ${url}`);
};

test("normalizarEndereco: completa https, tira barra final, recusa lixo", () => {
  assert.equal(normalizarEndereco(" rota66bh.com.br/ "), "https://rota66bh.com.br");
  assert.equal(normalizarEndereco("http://x.com.br/estoque"), "http://x.com.br/estoque");
  assert.throws(() => normalizarEndereco(""), EnderecoInvalidoError);
  assert.throws(() => normalizarEndereco("ftp://x.com"), EnderecoInvalidoError);
  assert.throws(() => normalizarEndereco("banana"), EnderecoInvalidoError);
});

test("detecção: página com JSON-LD de Car/Vehicle é reconhecida e a amostra vem lida", async () => {
  const nav = navegadorFalso(siteJsonLd);
  const r = await testarSite(`${ZE}/estoque`, { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.legivel, true);
  assert.equal(r.situacao, "legivel-jsonld");
  assert.equal(r.adaptador, "jsonld");
  assert.equal(r.carrosNaListagem, 3);
  assert.equal(r.amostra.length, 3);
  const argo = r.amostra.find((a) => a.url.endsWith("-1001"))!.ficha;
  assert.equal(argo.preco, 59900);
  assert.equal(argo.km, 38500);
  assert.equal(argo.ano, 2021);
  // O Onix não tem preço: o aviso diz, e o campo fica ausente.
  assert.ok(r.avisos.some((a) => a.includes("-1003") && a.includes("preço")));
  assert.equal(r.amostra.find((a) => a.url.endsWith("-1003"))!.ficha.preco, undefined);
});

test("detecção: detectarAdaptador lê só 1 ficha", async () => {
  const nav = navegadorFalso(siteJsonLd);
  const r = await detectarAdaptador(`${ZE}/estoque`, { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.legivel, true);
  assert.equal(r.amostra.length, 1);
  assert.equal(nav.chamadas.length, 2); // listagem + 1 detalhe, nada de varredura
});

test("detecção: entrando pela home, acha o link da listagem (1 página a mais)", async () => {
  const nav = navegadorFalso((u) => {
    if (u === ZE) return fixture("generico-home.html");
    if (u === `${ZE}/carros-usados`) return fixture("generico-listagem-so-links.html");
    return fixture("generico-detalhe-1.html");
  });
  const r = await testarSite(ZE, { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.situacao, "legivel-jsonld");
  assert.equal(r.urlListagem, `${ZE}/carros-usados`);
  assert.equal(r.carrosNaListagem, 4);
});

test("detecção: plataforma AutoCerto é reconhecida e o adaptador dela tem precedência", async () => {
  const nav = navegadorFalso((u) => (u.includes("/Veiculo/") ? fixture("detalhe-com-preco.html") : fixture("listagem.html")));
  const r = await testarSite("rota66bh.com.br", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.situacao, "legivel-autocerto");
  assert.equal(r.adaptador, "autocerto");
  assert.equal(r.amostra[0]!.ficha.preco, 82700);
  assert.equal(r.amostra[0]!.ficha.km, 47606);
});

test("detecção: página sem nada devolve 'não consegui ler' e não inventa ficha", async () => {
  const nav = navegadorFalso(() => fixture("pagina-sem-nada.html"));
  const r = await testarSite("https://example.com", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.legivel, false);
  assert.equal(r.situacao, "ilegivel");
  assert.equal(r.adaptador, undefined);
  assert.deepEqual(r.amostra, []);
  assert.match(r.mensagem, /Não consegui ler/);
});

test("detecção: links de carro sem JSON-LD -> 'precisa de seletor', nunca 'dá para ler'", async () => {
  const nav = navegadorFalso((u) =>
    u.includes("/veiculo/") ? fixture("generico-detalhe-sem-dado.html") : fixture("generico-sem-jsonld-com-links.html"),
  );
  const r = await testarSite("https://loja.example.com.br", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.legivel, false);
  assert.equal(r.situacao, "precisa-seletor");
  assert.equal(r.amostra.length, 0);
  assert.equal(r.carrosNaListagem, 4);
});

test("robots.txt proibindo: site recusado, dizendo a regra, sem abrir o navegador", async () => {
  const nav = navegadorFalso(() => fixture("pagina-sem-nada.html"));
  const r = await testarSite("https://fechado.example.com.br/estoque", {
    navegador: nav,
    intervaloMs: 0,
    buscarRobots: robotsDe("User-agent: *\nDisallow: /estoque\n"),
  });
  assert.equal(r.legivel, false);
  assert.equal(r.situacao, "recusado-robots");
  assert.equal(r.regraRobots, "Disallow: /estoque");
  assert.match(r.mensagem, /Disallow: \/estoque/);
  assert.equal(nav.chamadas.length, 0);
});

test("ritmo: respeita o intervalo entre requisições", async () => {
  const nav = navegadorFalso(siteJsonLd);
  await testarSite(`${ZE}/estoque`, { navegador: nav, intervaloMs: 60, maxFichas: 2, buscarRobots: ROBOTS_LIVRE });
  assert.ok(nav.chamadas.length >= 3);
  for (let i = 1; i < nav.chamadas.length; i++) {
    assert.ok(nav.chamadas[i]!.em - nav.chamadas[i - 1]!.em >= 55, `intervalo ${i} curto demais`);
  }
});

test("site fora do ar: erro de rede honesto", async () => {
  const nav = navegadorFalso(() => {
    throw new Error("net::ERR_NAME_NOT_RESOLVED");
  });
  const r = await testarSite("https://nao-existe.example.com.br", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.situacao, "erro-rede");
  assert.equal(r.legivel, false);
});

test("bloqueio no teste de conexão: para na hora, diz o sinal e não insiste", async () => {
  const nav = navegadorFalso(() => {
    throw new BloqueioError("desafio-cloudflare", "https://protegido.example.com.br");
  });
  const r = await testarSite("https://protegido.example.com.br", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.situacao, "bloqueado");
  assert.equal(r.sinalBloqueio, "desafio-cloudflare");
  assert.equal(r.legivel, false);
  assert.equal(nav.chamadas.length, 1);
  assert.match(r.mensagem, /Cloudflare/);
});

test("navegador da pessoa fechado no teste de conexão: estado claro", async () => {
  const nav = navegadorFalso(() => {
    throw new NavegadorIndisponivelError("navegador-fechado", "Abra o navegador (Chrome com a extensão BrowserSkill) para ler este site.");
  });
  const r = await testarSite("https://x.example.com.br", { navegador: nav, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(r.situacao, "navegador-indisponivel");
  assert.match(r.mensagem, /Abra o navegador/);
});
