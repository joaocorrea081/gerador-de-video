// Etapa 6, parte B: as telas premium (barra lateral, calendário, publicações, contas, prontidão,
// validação/legenda/prévia por rede). Servidor real em 127.0.0.1, banco temporário, nada toca rede.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import { aprovarVideo, criarVideoComJob, marcarJobConcluido, migrar, rejeitarVideo, type CaracteristicasMidia, type Rede } from "@gerador/core";
import { ErroConfiguracaoProvedor } from "@gerador/escritor";
import { ERROS_JS, CLIENTE_JS } from "./cliente.js";
import { ESTILO } from "./estilo.js";
import { cortarLegenda } from "./paginas-redes.js";
import { ErroRede, type ProvedorRede } from "./publicacao/provedores.js";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";
import { diaDaSemana, horaBrasilia, inicioDoDiaUtc, somarDias, ymdBrasilia, ymdValido } from "./tempo.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500 };
const SENTINELA = "SENTINELA-TOKEN-NAO-PODE-VAZAR-9X";
const SENTINELA_REFRESH = "SENTINELA-REFRESH-NAO-PODE-VAZAR-7Q";
const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
let mp4: string;
const agora = new Date("2026-10-21T15:00:00.000Z"); // 12:00 em Brasília
let midia: CaracteristicasMidia = BOA;
let fabrica: Dependencias["fabricaRede"];

function abrir(): Database.Database {
  const db = new Database(caminhoBanco);
  db.pragma("foreign_keys = ON");
  migrar(db);
  return db;
}

const deps: Dependencias = {
  abrirBanco: abrir,
  criarProvedor: () => {
    throw new ErroConfiguracaoProvedor("ANTHROPIC_API_KEY não está definida.");
  },
  executarRodada: async () => { throw new Error("não usado"); },
  relerProduto: async () => { throw new Error("não usado"); },
  agora: () => agora,
  lerMidia: async () => midia,
  envPublicacao: {},
  get fabricaRede() { return fabrica; },
} as Dependencias;

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-telas-pub-"));
  mp4 = join(pasta, "video.mp4");
  writeFileSync(mp4, "x");
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
  midia = BOA;
  fabrica = undefined;
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, 'http://x/f', 1024, 768, '/tmp/f.jpg', 0)").run();
  db.close();
});

async function api(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: "painel-idioma=pt-BR" } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(base + caminho, init);
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
async function pagina(caminho: string): Promise<string> {
  const r = await fetch(base + caminho, { headers: { cookie: "painel-idioma=pt-BR" } });
  assert.equal(r.status, 200, caminho);
  return r.text();
}
/** Vídeo pronto; aprovado ou esperando aprovação. */
function video(aprovar: boolean, produtoId = 1): number {
  const db = abrir();
  const { video: v, job } = criarVideoComJob(db, { produtoId, titulo: "Corolla 2020", corpo: "Texto do anúncio", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, v.id, mp4);
  if (aprovar) aprovarVideo(db, v.id);
  db.close();
  return v.id;
}
async function seco(...redes: Rede[]) {
  for (const r of redes) assert.equal((await api("POST", `/api/contas/${r}/conectar`, { modo: "seco" })).status, 200);
}
function ajustar(chave: string, valor: string) {
  const db = abrir();
  db.prepare("INSERT INTO ajuste (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").run(chave, valor);
  db.close();
}
const contador = (html: string, k: string): number => Number(new RegExp(`data-contador="${k}"[^>]*>(\\d+)<`).exec(html)?.[1]);

// ----------------------------------------------------------------- barra lateral

test("barra lateral: traz os contadores (aguardando, renderizando, agendados, falharam)", async () => {
  video(false); // esperando aprovação
  const aprovado = video(true);
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (2, 'http://x/2', '{}', '2026-10-21T12:00:00.000Z')").run();
  db.prepare("INSERT INTO video (produto_id, estado, criado_em, atualizado_em) VALUES (2, 'renderizando', ?, ?)").run(agora.toISOString(), agora.toISOString());
  db.close();
  await seco("instagram", "facebook");
  assert.equal((await api("POST", "/api/calendario/agendar", { videoId: aprovado, rede: "instagram", quando: "2026-10-22T17:00:00Z" })).status, 201);
  assert.equal((await api("POST", "/api/calendario/agendar", { videoId: aprovado, rede: "facebook", quando: "2026-10-22T17:00:00Z" })).status, 201);
  const d2 = abrir();
  d2.prepare("UPDATE publicacao SET estado = 'falhou', erro = 'Facebook: pedido recusado (HTTP 400).' WHERE rede = 'facebook'").run();
  d2.close();
  const html = await pagina("/fila");
  assert.equal(contador(html, "aguardando"), 1);
  assert.equal(contador(html, "renderizando"), 1);
  assert.equal(contador(html, "agendados"), 1);
  assert.equal(contador(html, "falharam"), 1);
  assert.match(html, /<nav class="nav" aria-label="Telas do painel">/);
  // a mesma contagem em qualquer tela
  assert.equal(contador(await pagina("/contas"), "agendados"), 1);
  // vazio: bolinhas escondidas
  caminhoBanco = join(pasta, "vazio.db");
  abrir().close();
  assert.match(await pagina("/configuracoes"), /data-contador="aguardando"[^>]*hidden>0</);
});

test("barra lateral: recolhível e guardada, gaveta em tela estreita, teclado e foco", () => {
  assert.match(CLIENTE_JS, /localStorage\.setItem\("painel-lateral"/);
  assert.match(CLIENTE_JS, /localStorage\.getItem\("painel-lateral"\)/);
  assert.match(CLIENTE_JS, /matchMedia\("\(min-width: 900px\)"\)/);
  assert.match(CLIENTE_JS, /ev\.key === "Escape"/);
  assert.match(CLIENTE_JS, /setAttribute\("inert", ""\)/);
  assert.match(ESTILO, /@media \(max-width: 899px\)/);
  assert.match(ESTILO, /body\[data-gaveta="aberta"\] \.lateral/);
  assert.match(ESTILO, /body\[data-lateral="recolhida"\]/);
  assert.match(ESTILO, /position: sticky; top: 0; align-self: flex-start/);
  assert.match(ESTILO, /prefers-reduced-motion: reduce/);
  assert.match(ESTILO, /\.pular:focus/);
  assert.doesNotThrow(() => new Function(CLIENTE_JS));
});

test("barra lateral: o tema escuro e a escolha recolhida são aplicados antes da pintura", async () => {
  const html = await pagina("/fila");
  assert.match(html, /localStorage\.getItem\("painel-lateral"\)==="recolhida"/);
  assert.match(html, /data-ds-dark-theme/);
});

// ------------------------------------------------------------------- calendário

test("calendário: mostra a hora de Brasília (e não a UTC) no mês e na semana", async () => {
  const id = video(true);
  await seco("instagram");
  const r = await api("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T17:00:00Z" });
  assert.equal(r.status, 201);
  const mes = await pagina("/calendario?visao=mes&data=2026-10-22");
  assert.match(mes, /outubro de 2026/);
  assert.match(mes, /<span class="chip-hora">14:00<\/span>/);
  assert.doesNotMatch(mes, /<span class="chip-hora">17:00<\/span>/);
  assert.match(mes, /22\/10\/2026 14:00 \(Brasília\)/);
  assert.match(mes, /Hora \(Brasília\)/);
  assert.match(mes, /data-dia-celula="2026-10-22"/);
  assert.match(mes, /data-acao="desmarcar"/);
  assert.match(mes, /data-acao="remarcar"/);
  assert.match(mes, /aria-expanded="false" aria-controls="pub-/);
  const semana = await pagina("/calendario?visao=semana&data=2026-10-22");
  assert.match(semana, /18\/10 a 24\/10\/2026/);
  assert.match(semana, /chip-titulo">Corolla 2020</);
  assert.match(semana, /aria-current="page">Semana/);
});

test("calendário: o formulário só oferece vídeo aprovado e deixa de fora rede não conectada", async () => {
  video(false); // não aprovado: não entra
  const aprovado = video(true);
  await seco("instagram");
  const html = await pagina(`/calendario?video=${aprovado}`);
  assert.match(html, new RegExp(`<option value="${aprovado}" selected>`));
  assert.equal((html.match(/<option value="\d+"/g) ?? []).length, 1);
  assert.match(html, /value="facebook" disabled data-sem-conta/);
  assert.match(html, /value="instagram" \/>/);
  assert.match(html, /Conectada em modo seco/);
  assert.match(html, /name="visibilidade" value="publica"/);
  assert.doesNotMatch(html, /name="visibilidade"[^>]*checked/); // TikTok: sem valor padrão
  assert.match(html, /Espaçamento mínimo entre publicações na mesma rede: 60 min/);
});

test("calendário: sem vídeo aprovado, diz o próximo passo; endpoint recusa por espaçamento e devolve o próximo horário", async () => {
  assert.match(await pagina("/calendario"), /Nenhum vídeo aprovado para marcar[\s\S]*Ir para a Fila/);
  const id = video(true);
  await seco("instagram");
  await api("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T17:00:00Z" });
  const id2 = video(true);
  const r = await api("POST", "/api/calendario/agendar", { videoId: id2, rede: "instagram", quando: "2026-10-22T17:10:00Z" });
  assert.equal(r.status, 409);
  assert.equal(r.json.codigo, "espacamento");
  assert.equal(r.json.proximoHorarioLivre, "2026-10-22T18:00:00.000Z");
  // o cliente sabe mostrar isso em Brasília e oferecer o horário
  assert.match(CLIENTE_JS, /proximoHorarioLivre/);
  assert.match(CLIENTE_JS, /T\("js\.usarHorario"/);
  assert.match(CLIENTE_JS, /timeZone: "America\/Sao_Paulo"/);
});

test("calendário: datas inventadas na URL não quebram a tela", async () => {
  for (const q of ["?data=2026-02-31", "?data=lixo", "?visao=outra&data=2026-10-22", "?video=abc"]) {
    assert.match(await pagina(`/calendario${q}`), /<title>Calendário/);
  }
});

test("tempo: dias de Brasília, meia-noite em UTC e validação de data", () => {
  assert.equal(ymdBrasilia(new Date("2026-10-22T02:30:00Z")), "2026-10-21"); // ainda é dia 21 em Brasília
  assert.equal(inicioDoDiaUtc("2026-10-21"), "2026-10-21T03:00:00.000Z");
  assert.equal(horaBrasilia("2026-10-22T17:00:00Z"), "14:00");
  assert.equal(horaBrasilia("2026-10-22T02:59:00Z"), "23:59");
  assert.equal(somarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diaDaSemana("2026-10-21"), 3); // quarta
  assert.equal(ymdValido("2026-02-31"), false);
  assert.equal(ymdValido("2026-10-22"), true);
});

// ------------------------------------------------------------------- publicações

test("publicações: estado por vídeo e por rede, lado a lado (publicou, falhou e por quê, espera nova tentativa)", async () => {
  const id = video(true);
  await seco("instagram", "facebook", "tiktok");
  fabrica = (rede): ProvedorRede => ({
    rede, simulado: false,
    consultarLimite: async () => null,
    renovarToken: async () => { throw new Error("não usado"); },
    publicar: async () => {
      if (rede === "facebook") throw new ErroRede("Facebook: serviço temporariamente indisponível (HTTP 503).", "temporario", true);
      if (rede === "tiktok") throw new ErroRede("TikTok: pedido recusado (código spam_risk_too_many_posts).", "recusado", false);
      return { idExterno: "ext-1", simulado: false };
    },
  });
  assert.equal((await api("POST", `/api/videos/${id}/publicar`, { rede: "instagram" })).status, 200);
  assert.equal((await api("POST", `/api/videos/${id}/publicar`, { rede: "facebook" })).status, 202);
  assert.equal((await api("POST", `/api/videos/${id}/publicar`, { rede: "tiktok", visibilidade: "privada" })).status, 422);
  const html = await pagina("/publicacoes");
  assert.match(html, /data-rede="instagram" data-estado="publicada"/);
  assert.match(html, /data-rede="facebook" data-estado="agendada"/);
  assert.match(html, /data-rede="tiktok" data-estado="falhou"/);
  assert.match(html, /Esperando nova tentativa/);
  assert.match(html, /Tentativa 1 de 10\. Próxima: \d\d\/\d\d\/\d{4} \d\d:\d\d \(Brasília\)/);
  assert.match(html, /serviço temporariamente indisponível/);
  assert.match(html, /pedido recusado \(código spam_risk_too_many_posts\)/); // erro legível, na tela
  assert.match(html, /data-acao="tentar-de-novo"/);
  assert.match(html, /data-acao="publicar-agora"/);
  assert.match(html, /<h4>Instagram<\/h4>[\s\S]*<h4>Facebook<\/h4>[\s\S]*<h4>TikTok<\/h4>/);
  assert.equal(contador(html, "falharam"), 1);
});

test("publicações: modo seco avisa que nada saiu de verdade; vazio diz o próximo passo", async () => {
  assert.match(await pagina("/publicacoes"), /Nenhum vídeo aprovado ainda[\s\S]*Ir para a Fila/);
  const id = video(true);
  await seco("instagram");
  assert.equal((await api("POST", `/api/videos/${id}/publicar`, { rede: "instagram" })).status, 200);
  const html = await pagina("/publicacoes");
  assert.match(html, /Modo seco: nada saiu de verdade/);
  assert.match(html, /Não agendado/);
});

// ----------------------------------------------------------- contas e prontidão

test("contas: conectada ou não, qual conta, quando expira; NUNCA token nem segredo", async () => {
  assert.match(await pagina("/contas"), /Nenhuma rede conectada/);
  const expira = new Date(agora.getTime() + 30 * 24 * 3_600_000).toISOString();
  const r = await api("POST", "/api/contas/tiktok/conectar", {
    modo: "real", contaId: "open-id-1", contaNome: "Revenda Teste", accessToken: SENTINELA, refreshToken: SENTINELA_REFRESH,
    expiraEm: expira, refreshExpiraEm: new Date(agora.getTime() + 365 * 24 * 3_600_000).toISOString(), escopos: ["video.publish"],
  });
  assert.equal(r.status, 200);
  const html = await pagina("/contas");
  assert.doesNotMatch(html, new RegExp(SENTINELA));
  assert.doesNotMatch(html, new RegExp(SENTINELA_REFRESH));
  assert.match(html, /Revenda Teste/);
  assert.match(html, /20\/11\/2026 12:00 \(Brasília\)/);
  assert.match(html, /<h3>TikTok <span class="selo ok">Conectada<\/span>/);
  assert.match(html, /<h3>Instagram <span class="selo erro">Não conectada<\/span>/);
  assert.match(html, /data-acao="renovar" data-rede="tiktok"/);
  assert.match(html, /Conectar<\/button>/);
  assert.match(html, /type="password" autocomplete="off"/);
  assert.match(html, /nunca voltam para esta tela/);
  // modo seco não passa por real
  await seco("instagram");
  assert.match(await pagina("/contas"), /Conectada em modo seco/);
  for (const t of ["/prontidao", "/fila", "/calendario", "/publicacoes", "/configuracoes"]) {
    const h = await pagina(t);
    assert.doesNotMatch(h, new RegExp(SENTINELA), t);
    assert.doesNotMatch(h, new RegExp(SENTINELA_REFRESH), t);
  }
});

test("prontidão: item por item, com os prazos reais escritos sem enfeite", async () => {
  const html = await pagina("/prontidao");
  assert.match(html, /Nenhuma rede está pronta para publicar de verdade/);
  assert.match(html, /Sem auditoria aprovada não existe publicação pública; a auditoria leva de 2 a 6 semanas/);
  assert.match(html, /relatos de 2026 falam em cerca de 20 dias/);
  assert.match(html, /Standard Access, sem App Review/);
  assert.match(html, /App Review e verificação da empresa/);
  assert.match(html, /<li class="falta"><span class="marca-item" aria-hidden="true">✗<\/span>/);
  assert.match(html, /Conta conectada/);
  assert.match(html, /Auditoria do TikTok aprovada/);
  assert.match(html, /Vídeo em URL pública/);
  assert.match(html, /3 a 10 semanas/);
  assert.match(html, /alguém que leia romeno|Alguém que leia romeno/);
  assert.match(html, /Sem a chave, a legenda sai só com a ficha do carro/);
  assert.match(html, /50 em outro|consultado na API antes de postar/);
  assert.match(html, /0 de 30 publicações nas últimas 24 h/); // Facebook
  // conectar em modo seco NÃO vira "pronta": segue honesto
  await seco("tiktok");
  const h2 = await pagina("/prontidao");
  assert.match(h2, /<h3>TikTok <span class="selo espera">Só modo seco<\/span>/);
  assert.doesNotMatch(h2, /Pronto para publicar de verdade em:/);
});

// ----------------------------------------------- fila: validação, legenda e prévia

test("fila: selo de validação por rede (passa / não passa, com motivo)", async () => {
  video(false);
  const html = await pagina("/fila");
  assert.match(html, /data-validacao="instagram" data-passa="true"[^>]*>Instagram: passa</);
  assert.match(html, /data-validacao="facebook" data-passa="true"[^>]*>Facebook: passa</);
  // TikTok sem auditoria não publica em público: barrado, com o motivo escrito
  assert.match(html, /data-validacao="tiktok" data-passa="false"[^>]*>TikTok: não passa</);
  assert.match(html, /<strong>TikTok<\/strong> não passa: [^<]*auditoria/i);
  assert.match(html, /Vídeo que não passa em uma rede não pode ser agendado nela/);
});

test("fila: vídeo horizontal não passa no Facebook (9:16 obrigatório) e o motivo aparece", async () => {
  midia = { ...BOA, largura: 1920, altura: 1080 };
  video(false);
  const html = await pagina("/fila");
  assert.match(html, /data-validacao="facebook" data-passa="false"/);
  assert.match(html, /<strong>Facebook<\/strong> não passa: [^<]*9:16/);
});

test("fila: ffprobe falhando não derruba a tela, diz que a validação está indisponível", async () => {
  video(false);
  const velho = deps.lerMidia!;
  deps.lerMidia = async () => { throw new Error("ENOENT"); };
  try {
    const html = await pagina("/fila");
    assert.match(html, /Validação indisponível/);
    assert.match(html, /O arquivo MP4 não está mais no disco/);
  } finally {
    deps.lerMidia = velho;
  }
});

test("fila: prévia por rede com proporção 9:16, conta e corte da legenda", async () => {
  const id = video(false);
  const longa = "Carro muito bem cuidado, revisado, pronto para viajar com a família toda e sem preocupação nenhuma. Venha conhecer pessoalmente hoje mesmo, sem compromisso nenhum.";
  assert.equal((await api("POST", `/api/videos/${id}/legendas/instagram`, { texto: longa })).status, 200);
  const html = await pagina("/fila");
  for (const r of ["instagram", "facebook", "tiktok"]) {
    assert.match(html, new RegExp(`class="previa previa-${r}" aria-label="Prévia aproximada no feed do`));
    assert.match(html, new RegExp(`data-previa-texto="${r}"`));
  }
  assert.equal((html.match(/class="previa-topo"/g) ?? []).length, 3); // barra de cima nas três
  assert.match(html, /Para você/); // só o TikTok tem as abas Seguindo / Para você
  assert.match(html, /class="previa-lateral"/); // ícones de ação
  assert.match(html, /<span class="previa-exemplo">exemplo<\/span>/); // sem conta conectada: nome de exemplo, marcado
  assert.match(html, /data-previa-contagem="instagram" data-limite="2200">\d+ \/ 2200 caracteres/);
  assert.match(html, /… mais<\/p>/); // legenda longa é cortada na prévia do Instagram
  assert.match(html, /Proporção 9:16, como no Instagram\. A legenda é cortada em cerca de 125 caracteres/);
  assert.match(html, /Prévia aproximada: dá a proporção e o corte da legenda/);
  assert.match(html, /<video src="\/video\/\d+\.mp4" muted/);
  assert.match(ESTILO, /\.previa-tela \{[^}]*aspect-ratio: 9 \/ 16/);
  assert.match(html, /Editada à mão\. Limite: 2200 caracteres/);
  assert.match(html, /Ainda só a ficha lida do site/); // as outras redes ainda sem texto da IA
  assert.match(html, /data-acao="salvar-legenda" data-rede="tiktok"/);
});

test("prévia: o corte da legenda é o mesmo no servidor e no navegador", () => {
  assert.equal(cortarLegenda("curta", 125), "curta");
  const t = "a".repeat(130);
  assert.equal(cortarLegenda(t, 125), "a".repeat(125) + "… mais");
  assert.equal(cortarLegenda("linha 1\n\nlinha 2", 125), "linha 1 linha 2");
  assert.match(CLIENTE_JS, /"… mais"/);
});

test("fila: sem chave da IA, a legenda avisa com a mensagem humana e o atalho para Configurações", async () => {
  video(false);
  const html = await pagina("/fila");
  assert.match(html, /data-sem-chave>Sem a chave da inteligência artificial[^<]*<a href="\/configuracoes">Abrir Configurações<\/a>/);
  const r = await api("POST", "/api/videos/1/legendas/gerar");
  assert.equal(r.status, 503);
  assert.equal(r.json.codigo, "chave_ausente");
  const msg = new Function(`${ERROS_JS}; return mensagemDeErro;`)()(Object.assign(new Error(r.json.erro), { codigo: r.json.codigo }));
  assert.match(msg.texto, /Falta configurar a chave de acesso da inteligência artificial\. Veja em Configurações\./);
  assert.equal(msg.link.href, "/configuracoes");
});

test("histórico: o que foi publicado (rede, quando, id do post) e o que foi rejeitado; aprovado que não saiu não entra", async () => {
  const naoSaiu = video(true);
  const publicado = video(true);
  await seco("instagram");
  assert.equal((await api("POST", `/api/videos/${publicado}/publicar`, { rede: "instagram" })).status, 200);
  const rejeitado = video(false);
  const dbr = abrir();
  rejeitarVideo(dbr, { videoId: rejeitado, motivo: "ritmo" });
  dbr.close();
  const html = await pagina("/historico");
  assert.match(html, new RegExp(`data-id="${publicado}"`));
  assert.match(html, /Instagram · 21\/10\/2026 12:00 \(Brasília\)/);
  assert.match(html, /Modo seco: nada saiu de verdade/);
  assert.match(html, /ID do post: /);
  assert.match(html, new RegExp(`data-id="${rejeitado}"`));
  assert.match(html, /Motivo: Ritmo\./);
  assert.doesNotMatch(html, new RegExp(`data-id="${naoSaiu}"`));
});

test("fila: cartão com painéis acessíveis (aria-expanded) para legenda e prévia", async () => {
  video(false);
  const html = await pagina("/fila");
  assert.match(html, /data-abre="redes" aria-pressed="false" aria-expanded="false"/);
  assert.match(html, /<label for="leg-\d+-instagram">Legenda do Instagram<\/label>/);
  assert.match(html, /maxlength="2200"/);
});

// ----------------------------------------------------------------- erros e estilo

function mensagemDeErro(e: unknown): { texto: string; link: { href: string } | null } {
  return new Function(`${ERROS_JS}; return mensagemDeErro;`)()(e);
}

test("erros conhecidos de publicação viram frase humana, na tela", () => {
  const caso = (codigo: string) => mensagemDeErro(Object.assign(new Error("texto técnico do servidor"), { codigo }));
  assert.match(caso("nao_conectada").texto, /ainda não está conectada/);
  assert.equal(caso("nao_conectada").link?.href, "/contas");
  assert.match(caso("video_nao_aprovado").texto, /Só vídeo aprovado/);
  assert.equal(caso("video_nao_aprovado").link?.href, "/fila");
  assert.match(caso("limite_diario").texto, /limite de publicações das últimas 24 horas/);
  assert.match(caso("visibilidade_obrigatoria").texto, /pública ou privada/);
  assert.match(caso("ja_publicada").texto, /nunca sai duas vezes/);
  // midia_invalida mantém a frase do servidor, que já diz o motivo de cada rede
  assert.equal(caso("midia_invalida").texto, "texto técnico do servidor");
});

test("nenhuma cor escrita à mão em nenhum arquivo das telas", () => {
  for (const nome of ["paginas.ts", "paginas-redes.ts", "paginas-publicacao.ts", "html.ts", "dados-telas.ts", "cliente.ts", "estilo.ts"]) {
    const f = readFileSync(new URL(`./${nome}`, import.meta.url), "utf8");
    assert.doesNotMatch(f, /#[0-9a-fA-F]{3,8}\b/, `${nome}: cor hexadecimal`);
    assert.doesNotMatch(f, /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab)\(/, `${nome}: cor funcional`);
    assert.doesNotMatch(f, /:\s*(white|black|red|green|blue|gray|grey|orange|yellow|purple)\s*[;}]/, `${nome}: cor nomeada`);
  }
  assert.match(ESTILO, /var\(--dsw-static-neutral-bluish-1000\)/); // véu da prévia vem de token
});

test("medidas do Harness mantidas: botão 36px, borda 0.5px, 180ms", () => {
  assert.match(ESTILO, /height: 36px/);
  assert.match(ESTILO, /border: 0\.5px solid var\(--dsw-alias-border-l3\)/);
  assert.match(ESTILO, /transition: width 180ms ease, transform 180ms ease/);
  assert.match(ESTILO, /\[hidden\] \{ display: none !important; \}/);
});
