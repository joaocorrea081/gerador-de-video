import { test } from "node:test";
import assert from "node:assert/strict";
import { BloqueioError, detectarBloqueio, exigirSemBloqueio } from "./bloqueio.js";
import { fixture } from "./teste-util.js";

const U = "https://revenda.example.com.br/estoque";

test("bloqueio: HTTP 403 e 429 são reconhecidos pelo código", () => {
  assert.equal(detectarBloqueio({ url: U, status: 403, html: fixture("bloqueio-403.html") }), "http-403");
  assert.equal(detectarBloqueio({ url: U, status: 429, html: fixture("bloqueio-403.html") }), "http-429");
});

test("bloqueio: desafio do Cloudflare pelo HTML e pelo cabeçalho cf-mitigated", () => {
  assert.equal(detectarBloqueio({ url: U, status: 403, html: fixture("bloqueio-cloudflare.html") }), "desafio-cloudflare");
  assert.equal(detectarBloqueio({ url: U, html: fixture("bloqueio-cloudflare.html") }), "desafio-cloudflare");
  assert.equal(detectarBloqueio({ url: U, cfMitigated: "challenge", html: "<html><body>x</body></html>" }), "desafio-cloudflare");
});

test("bloqueio: captcha, login (por redirecionamento e por formulário) e página vazia", () => {
  assert.equal(detectarBloqueio({ url: U, html: fixture("bloqueio-captcha.html") }), "captcha");
  assert.equal(
    detectarBloqueio({ url: U, urlFinal: "https://revenda.example.com.br/login?next=/estoque", html: fixture("bloqueio-login.html") }),
    "login",
  );
  assert.equal(detectarBloqueio({ url: U, html: fixture("bloqueio-login.html") }), "login");
  assert.equal(detectarBloqueio({ url: U, html: fixture("bloqueio-vazia.html") }), "pagina-vazia");
});

test("bloqueio: página normal NÃO é bloqueio (nem com reCAPTCHA de formulário, nem a example.com)", () => {
  assert.equal(detectarBloqueio({ url: U, status: 200, html: fixture("catalogo-com-recaptcha.html") }), undefined);
  assert.equal(detectarBloqueio({ url: U, status: 200, html: fixture("pagina-sem-nada.html") }), undefined);
  assert.equal(detectarBloqueio({ url: U, status: 200, html: fixture("listagem.html") }), undefined);
  assert.equal(detectarBloqueio({ url: "https://x.com.br/login", urlFinal: "https://x.com.br/login", html: fixture("generico-detalhe-1.html") }), undefined);
});

test("exigirSemBloqueio lança BloqueioError dizendo o sinal", () => {
  assert.throws(
    () => exigirSemBloqueio({ url: U, html: fixture("bloqueio-cloudflare.html") }),
    (e: unknown) => e instanceof BloqueioError && e.sinal === "desafio-cloudflare" && /Cloudflare/.test(e.message),
  );
});
