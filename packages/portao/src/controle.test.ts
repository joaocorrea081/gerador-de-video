// Planos P3 e P4: sugestões de variação, grade de publicação com previsão, aprovar emendado no agendar, parar tudo,
// carro vendido, job travado e desfazer a rejeição. Servidor real em 127.0.0.1, banco temporário, nada toca rede.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import Database from "better-sqlite3";
import {
  aprovarVideo, contarRejeicoesPorMotivo, criarVideoComJob, listarCardapio, marcarJobConcluido, marcarJobEmExecucao, migrar,
  type CaracteristicasMidia, type Rede,
} from "@gerador/core";
import { CLIENTE_JS } from "./cliente.js";
import { ESTILO } from "./estilo.js";
import { CATALOGOS, IDIOMAS, PENDENTES } from "./idioma/index.js";
import { iniciarServidor } from "./servidor.js";
import type { Dependencias } from "./rotas-acoes.js";

const FICHA = { marca: "Toyota", modelo: "Corolla", ano: 2020, km: 48000, preco: 15500, moeda: "BRL" };
const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 13_000_000, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264",
  codecAudio: "aac", perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};
// 200 s: o Facebook aceita no máximo 90 s, o Instagram aceita
const LONGA: CaracteristicasMidia = { ...BOA, duracaoSegundos: 200 };

let pasta: string;
let caminhoBanco: string;
let servidor: ReturnType<typeof iniciarServidor>;
let base: string;
let mp4: string;
const agora = new Date("2026-10-21T15:00:00.000Z"); // quarta-feira, 12:00 em Brasília
let midia: CaracteristicasMidia = BOA;

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
  lerMidia: async () => midia,
  envPublicacao: {},
};

before(async () => {
  pasta = mkdtempSync(join(tmpdir(), "gerador-controle-"));
  mp4 = join(pasta, "v.mp4");
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
  const db = abrir();
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', ?, ?)").run(JSON.stringify(FICHA), "2026-10-21T12:00:00.000Z");
  for (let i = 0; i < 3; i++) db.prepare("INSERT INTO foto (produto_id, url, largura, altura, caminho_local, ordem) VALUES (1, ?, 1024, 768, ?, ?)").run(`http://x/f${i}`, `/tmp/f${i}.jpg`, i);
  db.close();
});

async function api(metodo: string, caminho: string, corpo?: unknown, idioma = "pt-BR"): Promise<{ status: number; json: any }> {
  const init: RequestInit = { method: metodo, headers: { "content-type": "application/json", cookie: `painel-idioma=${idioma}` } };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const r = await fetch(base + caminho, init);
  const t = await r.text();
  return { status: r.status, json: t ? JSON.parse(t) : undefined };
}
async function pagina(caminho: string, idioma = "pt-BR"): Promise<string> {
  const r = await fetch(base + caminho, { headers: { cookie: `painel-idioma=${idioma}` } });
  assert.equal(r.status, 200, caminho);
  return r.text();
}
function video(aprovar: boolean): number {
  const db = abrir();
  const { video: v, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla 2020", corpo: "Texto do anúncio", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, v.id, mp4);
  if (aprovar) aprovarVideo(db, v.id);
  db.close();
  return v.id;
}
async function seco(...redes: Rede[]) {
  for (const r of redes) assert.equal((await api("POST", `/api/contas/${r}/conectar`, { modo: "seco" })).status, 200);
}
function sql<T>(consulta: string, ...params: unknown[]): T[] {
  const db = abrir();
  try { return db.prepare(consulta).all(...params) as T[]; } finally { db.close(); }
}
function exec(consulta: string, ...params: unknown[]): void {
  const db = abrir();
  try { db.prepare(consulta).run(...params); } finally { db.close(); }
}
const GRADE = { grades: [{ dias: [1, 3, 5], horarios: ["10:00", "18:00"], redes: ["instagram", "facebook"] }] };

// ------------------------------------------------------------- P3: cardápio e variações

test("Refazer: todos os botões vêm do cardápio do núcleo, com a cor automática, e cada um tem nome em todos os idiomas", async () => {
  video(false);
  const html = await pagina("/fila", "en");
  const campo: Record<string, string> = { modelos: "modelo", enquadramentos: "enquadramento", cores: "cor", fundos: "fundo", ritmos: "ritmo" };
  for (const [lista, opcoes] of Object.entries(listarCardapio())) {
    const grupo = new RegExp(`data-grupo="${campo[lista]}"[^>]*>(.*?)</div>`, "s").exec(html)?.[1];
    assert.ok(grupo, `grupo ${lista}`);
    for (const o of opcoes) {
      assert.match(grupo!, new RegExp(`data-escolha="${o.id}"`), `${lista}/${o.id} vira botão`);
      for (const i of IDIOMAS) {
        const chaves = [`cardapio.${campo[lista]}.${o.id}`, `${campo[lista]}.${o.id}`];
        const tem = chaves.some((k) => k in CATALOGOS[i] || (PENDENTES[i].includes(k) && k in CATALOGOS.en));
        assert.ok(tem, `${i}: sem nome para ${lista}/${o.id}`);
      }
    }
  }
  assert.match(html, /data-escolha="automatica"[^>]*>Automatic \(from the photo\)</);
  assert.ok(html.includes("Photo order"), "ordem das fotos");
});

test("Sugestões de variação: 3 botões clicáveis com nome legível, nenhuma igual à escolha atual, e 'outras' nunca repete", async () => {
  const id = video(false);
  const html = await pagina("/fila", "pt-BR");
  const chaves = [...html.matchAll(/data-sugestao="[^"]*" data-chave="([^"]+)"/g)].map((m) => m[1]!);
  assert.equal(chaves.length, 3);
  assert.equal(new Set(chaves).size, 3, "sem repetir");
  assert.ok(!chaves.includes("institucional|ambar|nitida"), "nunca a escolha atual (padrão do vídeo)");
  assert.match(html, /class="sug-valor">(Editorial|Enérgico|Números|Institucional)</, "nome legível, não o id");
  assert.match(html, /data-acao="outras-sugestoes"/);
  assert.match(html, /<span class="rotulo">Variações sugeridas<\/span>/);

  const outras = await api("GET", `/api/videos/${id}/variacoes?semente=2&vistas=${encodeURIComponent(chaves.join(","))}`);
  assert.equal(outras.status, 200);
  const novas = [...outras.json.html.matchAll(/data-chave="([^"]+)"/g)].map((m: RegExpMatchArray) => m[1]!);
  assert.equal(novas.length, 3);
  for (const n of novas) assert.ok(!chaves.includes(n), `${n} já tinha sido mostrada`);
  assert.equal((await api("GET", "/api/videos/9999/variacoes")).status, 400);
  assert.match(CLIENTE_JS, /data-sugestao/);
  assert.match(CLIENTE_JS, /\/variacoes\?semente=/);
});

// ---------------------------------------------------------------- P4: parar tudo

test("Parar tudo: nome vazio é 400 (ErroPausa não vira 500), grava quem e quando, e a faixa aparece em toda tela", async () => {
  video(false);
  for (const por of ["", "   ", undefined]) {
    const r = await api("POST", "/api/pausa", { por });
    assert.equal(r.status, 400, `por=${JSON.stringify(por)}`);
    assert.match(r.json.erro, /quem está fazendo/);
  }
  assert.equal((await api("GET", "/api/pausa")).json.pausado, false);
  assert.match(await pagina("/fila"), /id="pausa-banner" role="status" hidden/, "livre: faixa escondida");
  assert.match(await pagina("/fila"), /data-pausado="0"/);

  const r = await api("POST", "/api/pausa", { por: "Maria", motivo: "preço errado" });
  assert.equal(r.status, 200);
  assert.equal(r.json.pausado, true);
  assert.equal(r.json.por, "Maria");
  assert.ok(r.json.em);
  for (const tela of ["/fila", "/estoque", "/grade", "/configuracoes", "/sites"]) {
    const html = await pagina(tela);
    assert.match(html, /id="pausa-banner" role="status"><strong class="faixa-titulo">Tudo está parado\./, tela);
    assert.match(html, /Maria parou em 21\/10\/2026 12:00 \(Brasília\)\. Motivo: preço errado/, tela);
    assert.match(html, /data-pausado="1"/, tela);
    assert.match(html, /class="parar-texto">Retomar</, tela);
  }
  // já pausado: o primeiro responsável fica
  assert.equal((await api("POST", "/api/pausa", { por: "João" })).json.por, "Maria");
});

test("Retomar: exige o nome, devolve quantas publicações vencidas foram reescalonadas e solta o freio", async () => {
  const id = video(true);
  await seco("instagram");
  assert.equal((await api("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-22T15:00:00.000Z" })).status, 201);
  assert.equal((await api("POST", "/api/pausa", { por: "Maria" })).status, 200);
  exec("UPDATE publicacao SET agendada_para = '2026-10-21T10:00:00.000Z'"); // venceu durante a pausa
  assert.equal((await api("POST", "/api/pausa/retomar", { por: "" })).status, 400);
  assert.equal((await api("GET", "/api/pausa")).json.pausado, true, "sem nome continua parado");
  const r = await api("POST", "/api/pausa/retomar", { por: "Maria" });
  assert.equal(r.status, 200);
  assert.equal(r.json.pausado, false);
  assert.equal(r.json.reagendadas, 1);
  assert.equal(r.json.retomadoPor, "Maria");
  const [pub] = sql<{ agendada_para: string }>("SELECT agendada_para FROM publicacao");
  assert.ok(pub!.agendada_para >= "2026-10-21T15:00:00.000Z", "saiu do passado: foi para agora ou depois");
  assert.match(await pagina("/fila"), /data-pausado="0"/);
  // a trava fica visível no navegador: botão, diálogos e o aviso com a contagem
  assert.match(CLIENTE_JS, /js\.pausa\.reagendadas/);
  assert.match(CLIENTE_JS, /\/api\/pausa\/retomar/);
});

test("Parar tudo: o freio impede render novo e publicação nova (a trava mora no núcleo)", async () => {
  const id = video(true);
  await seco("instagram");
  const pub = (await api("POST", "/api/calendario/agendar", { videoId: id, rede: "instagram", quando: "2026-10-21T15:30:00.000Z" })).json.publicacao;
  await api("POST", "/api/pausa", { por: "Maria" });
  const r = await api("POST", "/api/publicacoes/processar");
  assert.equal(r.status, 200);
  assert.equal(sql<{ estado: string }>("SELECT estado FROM publicacao WHERE id = ?", pub.id)[0]!.estado, "agendada", "nada saiu durante a pausa");
});

// -------------------------------------------------------------------- carro vendido

test("Carro vendido: alerta visível com 'quer tirar do ar?', nunca tira sozinho, 'já tirei' encerra e leituras são ajustáveis", async () => {
  const id = video(true);
  await seco("instagram", "facebook");
  const pub = await api("POST", `/api/videos/${id}/publicar`, { rede: "instagram" });
  assert.equal(pub.status, 200, JSON.stringify(pub.json));
  await api("POST", "/api/calendario/agendar", { videoId: id, rede: "facebook", quando: "2026-10-22T15:00:00.000Z" });
  assert.doesNotMatch(await pagina("/publicacoes"), /alertas-estoque/, "carro no estoque: sem alerta");

  exec("UPDATE produto SET saiu_do_estoque_em = '2026-10-21T14:00:00.000Z', saida_detalhe = 'sumiu da listagem'");
  const antes = sql<{ id: number; estado: string }>("SELECT id, estado FROM publicacao ORDER BY id");
  for (const tela of ["/fila", "/publicacoes", "/estoque"]) {
    const html = await pagina(tela);
    assert.match(html, /id="alerta-estoque"[^>]*><strong class="faixa-titulo">1 carro saiu do site e ainda tem vídeo no ar\. Quer tirar do ar\?/, `${tela}: faixa`);
  }
  const bloco = await pagina("/publicacoes");
  assert.match(bloco, /id="alertas-estoque"/);
  assert.match(bloco, /data-situacao="tirar_do_ar"/);
  assert.match(bloco, /data-situacao="bloqueada"/);
  assert.match(bloco, /Este carro saiu do site\. Quer tirar o vídeo dele do ar no Instagram\?/);
  assert.match(bloco, /Saiu do site em 21\/10\/2026 11:00 \(Brasília\)/);
  assert.match(bloco, /data-acao="alerta-resolver"/);
  assert.match(await pagina("/estoque"), /Saiu do site<\/span>/, "selo no estoque");
  assert.deepEqual(sql("SELECT id, estado FROM publicacao ORDER BY id"), antes, "ver o alerta não tira nada do ar");

  assert.equal((await api("POST", `/api/estoque/alertas/${antes[1]!.id}/resolver`)).status, 400, "só dá para dar baixa no que está no ar");
  assert.equal((await api("POST", `/api/estoque/alertas/${antes[0]!.id}/resolver`)).status, 200);
  const depois = await pagina("/publicacoes");
  assert.doesNotMatch(depois, /id="alerta-estoque"/, "sem vídeo no ar pendente, sem faixa");
  assert.doesNotMatch(depois, /data-situacao="tirar_do_ar"/);
  assert.match(depois, /data-situacao="bloqueada"/, "a bloqueada continua informando");
  assert.deepEqual(sql("SELECT id, estado FROM publicacao ORDER BY id"), antes, "dar baixa no alerta também não mexe na publicação");

  assert.equal((await api("GET", "/api/estoque/leituras-para-saida")).json.leituras, 3);
  assert.equal((await api("POST", "/api/estoque/leituras-para-saida", { leituras: 7 })).status, 200);
  for (const ruim of [0, 51, 2.5, "x", null]) assert.equal((await api("POST", "/api/estoque/leituras-para-saida", { leituras: ruim })).status, 400, String(ruim));
  assert.equal((await api("GET", "/api/estoque/leituras-para-saida")).json.leituras, 7);
  assert.match(await pagina("/configuracoes"), /id="aj-leituras" name="leituras" type="number" min="1" max="50" step="1" value="7"/);
});

// ------------------------------------------------------------- job travado e desfazer

test("Job travado: a tela diz travado, oferece destravar e a estimativa nunca contradiz o quadro", async () => {
  const id = video(false);
  // o job do vídeo já concluiu; este é um segundo job que "ficou" em execução
  let jobId = 0;
  { const db = abrir(); jobId = Number(db.prepare("INSERT INTO job (video_id, estado, tentativas, criado_em) VALUES (?, 'pendente', 0, ?)").run(id, "2026-10-21T14:00:00.000Z").lastInsertRowid); marcarJobEmExecucao(db, jobId, id); db.close(); }

  // rodando há 100 s: passou da média (60 s) e ainda está dentro do limite (180 s): NÃO é travado, e não pode dizer "0 s"
  exec("UPDATE job SET iniciado_em = ? WHERE id = ?", new Date(agora.getTime() - 100_000).toISOString(), jobId);
  let html = await pagina("/fila");
  assert.doesNotMatch(html, /data-travado/);
  assert.match(html, /Renderizando o vídeo <strong>#\d+<\/strong> há 1 min 40 s/);
  assert.match(html, /<span class="num">mais alguns segundos<\/span>/);
  assert.doesNotMatch(html, /<span class="num">0 s<\/span>/);

  // 588 s em execução com limite de 180: travado
  exec("UPDATE job SET iniciado_em = ? WHERE id = ?", new Date(agora.getTime() - 588_000).toISOString(), jobId);
  html = await pagina("/fila");
  assert.match(html, /data-travado/);
  assert.match(html, /<strong>Travado\.<\/strong> O vídeo #\d+ está &quot;renderizando&quot; há 9 min 48 s, mas um render nunca deveria passar de 3 min\./);
  assert.match(html, /data-acao="destravar">Destravar</);
  assert.doesNotMatch(html, /Renderizando o vídeo <strong>/, "não diz que está renderizando");
  assert.doesNotMatch(html, /<span class="num">0 s<\/span>/);
  assert.match(html, /<span class="num">—<\/span><span class="leg">para terminar tudo/, "estimativa desconhecida, não zero");
  assert.match(html, /parece travado/, "o cartão do vídeo também diz");
  assert.match(CLIENTE_JS, /\/api\/fila\/destravar/);

  const r = await api("POST", "/api/fila/destravar");
  assert.equal(r.json.destravados, 1);
  const [j] = sql<{ estado: string; tentativas: number; iniciado_em: string | null; erro: string }>("SELECT * FROM job WHERE id = ?", jobId);
  assert.equal(j!.estado, "pendente");
  assert.equal(j!.tentativas, 1);
  assert.equal(j!.iniciado_em, null);
  assert.match(j!.erro, /Travado/);
  assert.doesNotMatch(await pagina("/fila"), /data-travado/);
});

test("Destravar não toca num render que está rodando de verdade (dentro do limite)", async () => {
  const id = video(false);
  const db = abrir();
  const jobId = Number(db.prepare("INSERT INTO job (video_id, estado, tentativas, criado_em) VALUES (?, 'pendente', 0, ?)").run(id, "2026-10-21T14:00:00.000Z").lastInsertRowid);
  marcarJobEmExecucao(db, jobId, id);
  db.close();
  exec("UPDATE job SET iniciado_em = ? WHERE id = ?", new Date(agora.getTime() - 120_000).toISOString(), jobId);
  assert.equal((await api("POST", "/api/fila/destravar")).json.destravados, 0);
  assert.equal(sql<{ estado: string }>("SELECT estado FROM job WHERE id = ?", jobId)[0]!.estado, "em_execucao");
});

test("Rejeitar tem desfazer: apaga a rejeição (memória do escritor) E devolve o vídeo à fila", async () => {
  const id = video(false);
  const rej = await api("POST", `/api/videos/${id}/rejeitar`, { motivo: "fundo" });
  assert.equal(rej.status, 200, JSON.stringify(rej.json));
  assert.equal(sql("SELECT * FROM rejeicao").length, 1);
  assert.equal(sql<{ estado: string }>("SELECT estado FROM video WHERE id = ?", id)[0]!.estado, "rejeitado");

  const des = await api("POST", `/api/rejeicoes/${rej.json.rejeicao.id}/desfazer`);
  assert.equal(des.status, 200);
  assert.equal(sql("SELECT * FROM rejeicao").length, 0, "a rejeição sumiu do banco");
  const db = abrir();
  assert.equal(contarRejeicoesPorMotivo(db)["fundo"], 0, "o escritor não aprende nada com o clique errado");
  db.close();
  assert.equal(sql<{ estado: string }>("SELECT estado FROM video WHERE id = ?", id)[0]!.estado, "aguardando_aprovacao");
  assert.match(await pagina("/fila"), new RegExp(`id="video-${id}"`), "voltou para a fila");

  // desfazer duas vezes, ou um desfazer velho, não faz nada
  assert.equal((await api("POST", `/api/rejeicoes/${rej.json.rejeicao.id}/desfazer`)).status, 409);
  const outra = await api("POST", `/api/videos/${id}/rejeitar`, { motivo: "ritmo" });
  exec("UPDATE rejeicao SET criado_em = '2026-10-21T10:00:00.000Z'"); // 5 h antes de "agora"
  assert.equal((await api("POST", `/api/rejeicoes/${outra.json.rejeicao.id}/desfazer`)).status, 409, "fora da janela");
  assert.equal(sql("SELECT * FROM rejeicao").length, 1, "a rejeição antiga fica");
  assert.equal((await api("POST", "/api/rejeicoes/9999/desfazer")).status, 409);
});

test("Desfazer a rejeição: o aviso tem botão com contagem de 10 s e chama a rota que apaga", () => {
  assert.match(CLIENTE_JS, /desfazer: \{ segundos: 10/);
  assert.match(CLIENTE_JS, /\/api\/rejeicoes\/" \+ r\.rejeicao\.id \+ "\/desfazer/);
  assert.match(CLIENTE_JS, /data-desfazer/);
});

// ------------------------------------------------------------- grade de publicação

test("Grade: a previsão mostra quando cada vídeo sairia ANTES de confirmar, e confirmar agenda exatamente isso", async () => {
  const a = video(true);
  const b = video(true);
  await seco("instagram", "facebook");
  const tela = await pagina("/grade");
  assert.match(tela, /id="form-grade"/);
  assert.match(tela, /data-acao="plano-alternar"/);
  assert.match(tela, /Nenhum bloco ainda/);

  const prev = await api("POST", "/api/plano/previsao", GRADE);
  assert.equal(prev.status, 200);
  assert.equal(prev.json.total, 4);
  const horarios = [...prev.json.html.matchAll(/data-previsao-quando="([^"]+)"/g)].map((m: RegExpMatchArray) => m[1]!);
  assert.equal(horarios.length, 4);
  assert.match(prev.json.html, /21\/10\/2026 18:00 \(Brasília\)/, "quarta, 18:00");
  assert.match(prev.json.html, /23\/10\/2026 10:00 \(Brasília\)/, "sexta, 10:00");
  assert.match(prev.json.html, new RegExp(`data-previsao-video="${a}"`));
  assert.match(prev.json.html, new RegExp(`data-previsao-video="${b}"`));
  assert.match(prev.json.html, /Salvar a grade e agendar estas 4 publicações/);
  assert.equal(sql("SELECT * FROM publicacao").length, 0, "prever não agenda nada");
  assert.equal((await api("GET", "/api/plano")).json.plano.ativo, false, "nem salva a grade");

  const ok = await api("POST", "/api/plano/confirmar", GRADE);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.agendadas, 4);
  const gravados = sql<{ agendada_para: string }>("SELECT agendada_para FROM publicacao").map((p) => p.agendada_para).sort();
  assert.deepEqual(gravados, [...horarios].sort(), "o que saiu no calendário é exatamente o que foi mostrado");
  assert.equal((await api("GET", "/api/plano")).json.plano.ativo, true);
  const depois = await pagina("/grade");
  assert.match(depois, /aria-checked="true"[^>]*data-acao="plano-alternar"/);
  assert.match(depois, /value="10:00"/);
  assert.match(depois, /Nenhum vídeo aprovado está esperando vaga\./);
});

test("Grade: erros em português de gente, ligar sem bloco é recusado, desligar mantém os blocos", async () => {
  const sem = await api("POST", "/api/plano/ativo", { ativo: true });
  assert.equal(sem.status, 400);
  assert.match(sem.json.erro, /monte ao menos um bloco/);
  const dias = await api("POST", "/api/plano", { grades: [{ dias: [], horarios: ["10:00"], redes: ["instagram"] }] });
  assert.equal(dias.status, 400);
  assert.match(dias.json.erro, /Bloco 1: escolha ao menos um dia da semana\./);
  const hora = await api("POST", "/api/plano", { grades: [{ dias: [1], horarios: [], redes: ["instagram"] }] });
  assert.match(hora.json.erro, /Bloco 1: adicione ao menos um horário/);
  const rede = await api("POST", "/api/plano", { grades: [{ dias: [1], horarios: ["10:00"], redes: [] }] });
  assert.match(rede.json.erro, /Bloco 1: escolha ao menos uma rede\./);
  const en = await api("POST", "/api/plano", { grades: [{ dias: [], horarios: ["10:00"], redes: ["instagram"] }] }, "en");
  assert.match(en.json.erro, /Block 1: choose at least one day of the week\./);

  assert.equal((await api("POST", "/api/plano", GRADE)).status, 200);
  assert.equal((await api("POST", "/api/plano/ativo", { ativo: true })).json.plano.ativo, true);
  const off = await api("POST", "/api/plano/ativo", { ativo: false });
  assert.equal(off.json.plano.ativo, false);
  assert.equal(off.json.plano.grades.length, 1, "desligar não apaga os blocos");
  assert.match(await pagina("/grade"), /A grade está desligada\. Isto é o que ela faria/);
});

test("Grade: a tela existe nos quatro idiomas e a previsão reflete o bloco que está sendo montado, sem salvar", async () => {
  for (const i of IDIOMAS) assert.match(await pagina("/grade", i), /id="form-grade"/, i);
  assert.match(await pagina("/grade", "en"), /<h2>Posting plan<\/h2>/);
  assert.match(await pagina("/grade", "pt-BR"), /<h2>Grade de publicação<\/h2>/);
  video(true);
  await seco("instagram");
  const so = await api("POST", "/api/plano/previsao", { grades: [{ dias: [1], horarios: ["09:30"], redes: ["instagram"] }] });
  assert.match(so.json.html, /26\/10\/2026 09:30 \(Brasília\)/, "segunda 26/10 09:30");
  assert.equal((await api("POST", "/api/plano/previsao", { grades: [] })).json.total, 0);
  assert.equal((await api("POST", "/api/plano/previsao", { grades: [{ dias: [9], horarios: ["09:30"], redes: ["instagram"] }] })).status, 400);
});

// ----------------------------------------------------- aprovar emendado no agendar

test("Aprovar emendado no agendar: oferece só as redes em que o vídeo passa, com o horário sugerido, e agenda a pedido", async () => {
  await seco("instagram", "facebook");
  midia = LONGA; // passa no Instagram (até 15 min), não passa no Facebook (até 90 s)
  const a = video(false);
  const r = await api("POST", `/api/videos/${a}/aprovar-com-sugestao`, { modo: "aprovar_e_decidir_depois" });
  assert.equal(r.status, 200);
  assert.equal(r.json.video.estado, "aprovado");
  assert.equal(r.json.agendadas, 0, "decidir depois não agenda nada");
  assert.equal(sql("SELECT * FROM publicacao").length, 0);
  const ig = r.json.sugestoes.find((s: any) => s.rede === "instagram");
  assert.equal(ig.passa, true);
  assert.ok(ig.sugestao.horario.iso);
  assert.equal(r.json.sugestoes.find((s: any) => s.rede === "facebook").passa, false);
  assert.match(r.json.html, /Vídeo aprovado\. Agendar agora\?/);
  assert.match(r.json.html, /<input type="checkbox" name="rede" value="instagram" data-quando="2026-10-21T16:00:00\.000Z" checked \/>/, "próxima hora cheia livre");
  assert.doesNotMatch(r.json.html, /value="facebook"/, "rede em que o vídeo não passa nunca vira opção");
  assert.doesNotMatch(r.json.html, /value="tiktok"/);
  assert.match(r.json.html, /Facebook: /, "mas o aviso diz por quê");
  assert.match(r.json.html, /Agendar nestes horários/);
  assert.match(r.json.html, /Decidir depois/);
  assert.match(CLIENTE_JS, /aprovar-com-sugestao/);
  assert.match(CLIENTE_JS, /\/api\/calendario\/agendar/);
  assert.equal(sql<{ estado: string }>("SELECT estado FROM video WHERE id = ?", a)[0]!.estado, "aprovado");

  const b = video(false);
  const dois = await api("POST", `/api/videos/${b}/aprovar-com-sugestao`, { modo: "aprovar_e_agendar" });
  assert.equal(dois.status, 200);
  assert.equal(dois.json.agendadas, 1);
  assert.deepEqual(sql<{ rede: string; video_id: number }>("SELECT rede, video_id FROM publicacao WHERE video_id = ?", b).map((p) => p.rede), ["instagram"], "nunca agenda onde não passa");

  const c = video(false);
  assert.equal((await api("POST", `/api/videos/${c}/aprovar-com-sugestao`, { modo: "qualquer" })).status, 400);
  assert.equal(sql<{ estado: string }>("SELECT estado FROM video WHERE id = ?", c)[0]!.estado, "aguardando_aprovacao", "modo inválido não aprova");
  assert.equal((await api("POST", `/api/videos/${a}/aprovar-com-sugestao`, {})).status, 400, "já aprovado");
});

test("Aprovar emendado no agendar: com a grade ligada a sugestão vem da grade; em inglês o quadro sai em inglês", async () => {
  await seco("instagram");
  assert.equal((await api("POST", "/api/plano", GRADE)).status, 200);
  assert.equal((await api("POST", "/api/plano/ativo", { ativo: true })).status, 200);
  const a = video(false);
  const r = await api("POST", `/api/videos/${a}/aprovar-com-sugestao`, { modo: "aprovar_e_decidir_depois" }, "en");
  assert.match(r.json.html, /Video approved\. Schedule it now\?/);
  assert.match(r.json.html, /21\/10\/2026 18:00 \(Brasília time\) · from your posting plan/);
  assert.match(r.json.html, /Decide later/);
});

// ------------------------------------------------------------- regras gerais

test("Toda tela leva o botão Parar tudo e os diálogos; nenhuma cor escrita à mão nos arquivos novos", async () => {
  for (const tela of ["/fila", "/calendario", "/publicacoes", "/estoque", "/historico", "/contas", "/prontidao", "/grade", "/agendamento", "/sites", "/configuracoes"]) {
    const html = await pagina(tela, "en");
    assert.match(html, /id="pausa-botao"/, tela);
    assert.match(html, /<dialog class="dialogo" id="dlg-pausa"/, tela);
    assert.match(html, /<dialog class="dialogo" id="dlg-aprovado"/, tela);
  }
  assert.match(await pagina("/fila", "en"), /class="parar-texto">Stop everything</);
  assert.match(await pagina("/fila", "ro"), /class="parar-texto">Oprește tot</);
  assert.match(await pagina("/fila", "ru"), /class="parar-texto">Остановить всё</);
  for (const arquivo of ["pecas-controle.ts", "paginas-grade.ts", "rotas-controle.ts", "limites.ts", "contexto-tela.ts"]) {
    const f = readFileSync(new URL(`./${arquivo}`, import.meta.url), "utf8");
    assert.doesNotMatch(f, /#[0-9a-fA-F]{3,8}\b/, `${arquivo}: cor hexadecimal`);
    assert.doesNotMatch(f, /\b(rgb|rgba|hsl|hsla|oklch)\(/, `${arquivo}: cor funcional`);
  }
  assert.match(ESTILO, /\.btn\.parar \{ background: var\(--dsw-alias-state-error-primary\)/);
  assert.match(ESTILO, /\.pilula:has\(input:focus-visible\) \{ outline/, "foco visível por teclado nos dias");
  assert.match(ESTILO, /prefers-reduced-motion: reduce/);
});
