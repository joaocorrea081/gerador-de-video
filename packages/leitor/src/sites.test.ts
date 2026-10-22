import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarSite,
  cadastrarSite,
  cadastrarSiteDetectando,
  definirSiteAtivo,
  ErroSite,
  listarSites,
  listarSitesAtivos,
  removerSite,
} from "./sites.js";
import { banco, fixture, navegadorFalso, ROBOTS_LIVRE } from "./teste-util.js";

test("cadastro: criar, ativar, desativar, listar", () => {
  const db = banco();
  assert.deepEqual(listarSites(db), []);
  const a = cadastrarSite(db, { url: "www.rota66bh.com.br", nome: "Rota 66", adaptador: "autocerto" });
  const b = cadastrarSite(db, { url: "https://autosdoze.example.com.br/estoque", adaptador: "jsonld", ativo: false });
  assert.equal(a.id, "rota66bh.com.br");
  assert.equal(a.url, "https://www.rota66bh.com.br");
  assert.equal(b.nome, "autosdoze.example.com.br");
  assert.deepEqual(listarSites(db).map((s) => s.id), ["rota66bh.com.br", "autosdoze.example.com.br"]);
  assert.deepEqual(listarSitesAtivos(db).map((s) => s.id), ["rota66bh.com.br"]);

  definirSiteAtivo(db, b.id, true);
  assert.equal(listarSitesAtivos(db).length, 2);
  definirSiteAtivo(db, a.id, false);
  assert.deepEqual(listarSitesAtivos(db).map((s) => s.id), ["autosdoze.example.com.br"]);
  assert.equal(buscarSite(db, a.id)!.ativo, false);

  removerSite(db, a.id);
  assert.equal(listarSites(db).length, 1);
});

test("cadastro: duplicado, inexistente e adaptador inválido dão erro claro", () => {
  const db = banco();
  cadastrarSite(db, { url: "https://x.com.br", adaptador: "jsonld" });
  assert.throws(() => cadastrarSite(db, { url: "http://www.x.com.br/outra", adaptador: "jsonld" }), ErroSite);
  assert.throws(() => definirSiteAtivo(db, "nao.existe", true), ErroSite);
  assert.throws(() => cadastrarSite(db, { url: "https://y.com.br", adaptador: "xpto" as never }), ErroSite);
});

test("cadastrarSiteDetectando: só cadastra se leu dado de verdade", async () => {
  const db = banco();
  const vazio = navegadorFalso(() => fixture("pagina-sem-nada.html"));
  const ruim = await cadastrarSiteDetectando(db, "https://example.com", { navegador: vazio, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE });
  assert.equal(ruim.site, undefined);
  assert.equal(ruim.resultado.legivel, false);
  assert.equal(listarSites(db).length, 0);

  const bom = navegadorFalso((u) => (u.includes("/Veiculo/") ? fixture("detalhe-com-preco.html") : fixture("listagem.html")));
  const ok = await cadastrarSiteDetectando(db, "rota66bh.com.br", { navegador: bom, intervaloMs: 0, buscarRobots: ROBOTS_LIVRE, nome: "Rota 66" });
  assert.equal(ok.site!.adaptador, "autocerto");
  assert.equal(listarSites(db)[0]!.nome, "Rota 66");
});
