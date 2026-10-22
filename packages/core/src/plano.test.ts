import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  aprovarComSugestao, criarVideoComJob, definirPlanoAtivo, encaixarAprovados, estouraLimite24h, formatarBrasilia,
  gravarAjuste, lerPlano, marcarJobConcluido, migrar, normalizarPlano, preverEncaixe, proximaVagaDaGrade,
  calcularEncaixe, salvarPlano, CHAVE_ESPACAMENTO, aprovarVideo, agendarPublicacao, conectarConta, definirAprovacaoPlataforma,
  type CaracteristicasMidia, type ContextoVagas, type Plano, type Rede,
} from "./index.js";

const BOA: CaracteristicasMidia = {
  duracaoSegundos: 30, tamanhoBytes: 5e6, largura: 1080, altura: 1920, fps: 30, codecVideo: "h264", codecAudio: "aac",
  perfilAudio: "LC", taxaAmostragemAudio: 48000, bitrateAudio: 128000, moovNoInicio: true, temEditList: false,
};
// Instagram aceita, Facebook barra (horizontal).
const SO_INSTAGRAM: CaracteristicasMidia = { ...BOA, largura: 1920, altura: 1080 };

// 2026-10-21 é quarta. 15:00Z = 12:00 em Brasília.
const AGORA = new Date("2026-10-21T15:00:00.000Z");
const MSG = (h: string) => formatarBrasilia(Date.parse(h)).rotulo;

const GRADE_SQS: Plano = {
  ativo: true,
  grades: [{ dias: [1, 3, 5], horarios: ["10:00", "18:00"], redes: ["instagram", "facebook", "tiktok"] }],
};

function ctx(over: Partial<ContextoVagas> = {}): ContextoVagas {
  return { agora: AGORA, espacamentoMs: 60 * 60_000, limites: {}, ocupados: { instagram: [], facebook: [], tiktok: [] }, ...over };
}

function banco(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrar(db);
  db.prepare("INSERT INTO produto (id, origem_url, dados_json, lido_em) VALUES (1, 'http://x/1', '{}', ?)").run(AGORA.toISOString());
  return db;
}
function video(db: Database.Database, aprovar = true): number {
  const { video: v, job } = criarVideoComJob(db, { produtoId: 1, titulo: "Corolla", corpo: "x", fundo: "claro", ritmo: "calmo", ordemFotos: [] });
  marcarJobConcluido(db, job.id, v.id, "/tmp/x.mp4");
  if (aprovar) aprovarVideo(db, v.id);
  return v.id;
}
const conectar = (db: Database.Database, ...redes: Rede[]) => { for (const r of redes) conectarConta(db, r, { modo: "seco" }, AGORA); };
const deps = (m: CaracteristicasMidia = BOA) => ({ lerMidia: async () => m, limites: { facebook: 30 } as Partial<Record<Rede, number>> });
const horasBrt = (itens: { horario: { rotulo: string } }[]) => itens.map((i) => i.horario.rotulo);

test("grade de 3 dias e 2 horários: próxima vaga cai no dia e na hora certos", () => {
  // quarta 12:00 -> quarta 18:00, depois sexta 10:00, sexta 18:00, segunda 10:00
  const r = calcularEncaixe(GRADE_SQS, [1, 2, 3, 4].map((id) => ({ videoId: id, redes: ["instagram" as Rede] })), ctx());
  assert.deepEqual(horasBrt(r.itens), ["qua 21/10 18:00", "sex 23/10 10:00", "sex 23/10 18:00", "seg 26/10 10:00"]);
  assert.equal(r.itens[0]!.horario.iso, "2026-10-21T21:00:00.000Z"); // 18h BRT = 21h UTC
});

test("vaga no passado é pulada (e vaga exatamente agora também)", () => {
  const agora = new Date("2026-10-21T13:00:00.000Z"); // 10:00 BRT em ponto
  const v = proximaVagaDaGrade(GRADE_SQS, "instagram", ctx({ agora }));
  assert.equal(formatarBrasilia(v!).rotulo, "qua 21/10 18:00");
});

test("espaçamento mínimo entre vagas consecutivas", () => {
  const plano: Plano = { ativo: true, grades: [{ dias: [3], horarios: ["18:00", "18:30", "19:00", "20:00"], redes: ["instagram"] }] };
  const r = calcularEncaixe(plano, [1, 2, 3].map((id) => ({ videoId: id, redes: ["instagram" as Rede] })), ctx());
  // 18:30 está a 30 min de 18:00 (< 60) -> pulado; 19:00 está a exatos 60 -> vale; 20:00 vale
  assert.deepEqual(horasBrt(r.itens), ["qua 21/10 18:00", "qua 21/10 19:00", "qua 21/10 20:00"]);
  const [a, b] = r.itens;
  assert.ok(b!.quandoMs - a!.quandoMs >= 60 * 60_000);
});

test("limite diário da rede empurra para o dia seguinte da grade", () => {
  const plano: Plano = { ativo: true, grades: [{ dias: [1, 2, 3, 4, 5, 6, 0], horarios: ["10:00", "18:00"], redes: ["facebook"] }] };
  const r = calcularEncaixe(plano, [1, 2, 3, 4].map((id) => ({ videoId: id, redes: ["facebook" as Rede] })), ctx({ limites: { facebook: 2 } }));
  // no máximo 2 em qualquer janela de 24h
  const t = r.itens.map((i) => i.quandoMs);
  for (let i = 0; i + 2 < t.length; i++) assert.ok(t[i + 2]! - t[i]! >= 24 * 3_600_000, "3 publicações em menos de 24h");
  assert.equal(r.itens.length, 4);
});

test("limite do Facebook (30/24h) conta o que já foi publicado", () => {
  const ocupados = Array.from({ length: 30 }, (_, i) => AGORA.getTime() - 3_600_000 + i * 60_000); // 30 na última hora
  assert.equal(estouraLimite24h(ocupados, AGORA.getTime() + 3_600_000, 30), true);
  assert.equal(estouraLimite24h(ocupados.slice(1), AGORA.getTime() + 3_600_000, 30), false);
  const plano: Plano = { ativo: true, grades: [{ dias: [0, 1, 2, 3, 4, 5, 6], horarios: ["18:00", "10:00"], redes: ["facebook"] }] };
  const v = proximaVagaDaGrade(plano, "facebook", ctx({ limites: { facebook: 30 }, ocupados: { instagram: [], tiktok: [], facebook: ocupados } }));
  // primeira publicação do lote saiu há ~1h: só volta a caber quando ela sair da janela de 24h
  assert.ok(v! - ocupados[0]! >= 24 * 3_600_000);
  assert.equal(formatarBrasilia(v!).rotulo, "qui 22/10 18:00"); // 10:00 de quinta ainda cai a <24h do primeiro dos 30
});

test("vaga já ocupada é pulada", () => {
  const ocupada = Date.parse("2026-10-21T21:00:00.000Z"); // qua 18:00 BRT
  const v = proximaVagaDaGrade(GRADE_SQS, "instagram", ctx({ ocupados: { instagram: [ocupada], facebook: [], tiktok: [] } }));
  assert.equal(formatarBrasilia(v!).rotulo, "sex 23/10 10:00");
  // ocupada em OUTRA rede não atrapalha
  const v2 = proximaVagaDaGrade(GRADE_SQS, "instagram", ctx({ ocupados: { instagram: [], facebook: [ocupada], tiktok: [] } }));
  assert.equal(formatarBrasilia(v2!).rotulo, "qua 21/10 18:00");
});

test("encaixar 10 aprovados distribui na ordem, sem colisão", () => {
  const r = calcularEncaixe(GRADE_SQS, Array.from({ length: 10 }, (_, i) => ({ videoId: i + 1, redes: ["instagram" as Rede] })), ctx());
  assert.equal(r.itens.length, 10);
  const t = r.itens.map((i) => i.quandoMs);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
  assert.equal(new Set(t).size, 10);
  assert.deepEqual(r.itens.map((i) => i.videoId), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test("grade desligada não sugere nada, mas guarda a configuração", () => {
  const db = banco();
  salvarPlano(db, GRADE_SQS);
  const off = definirPlanoAtivo(db, false);
  assert.equal(off.ativo, false);
  assert.deepEqual(lerPlano(db).grades, GRADE_SQS.grades);
  assert.equal(proximaVagaDaGrade(lerPlano(db), "instagram", ctx()), null);
  const r = calcularEncaixe(lerPlano(db), [{ videoId: 1, redes: ["instagram"] }], ctx());
  assert.equal(r.itens.length, 0);
  assert.equal(r.semVaga[0]!.motivo, "grade_desligada");
  assert.equal(definirPlanoAtivo(db, true).ativo, true);
  assert.deepEqual(lerPlano(db).grades, GRADE_SQS.grades);
});

test("não dá para ligar grade sem blocos; entradas ruins são recusadas", () => {
  const db = banco();
  assert.throws(() => definirPlanoAtivo(db, true), /ao menos um bloco/);
  assert.throws(() => normalizarPlano({ ativo: false, grades: [{ dias: [7], horarios: ["10:00"], redes: ["instagram"] }] }), /dia/);
  assert.throws(() => normalizarPlano({ ativo: false, grades: [{ dias: [1], horarios: ["25:00"], redes: ["instagram"] }] }), /horário/);
  assert.throws(() => normalizarPlano({ ativo: false, grades: [{ dias: [1], horarios: ["10:00"], redes: ["orkut"] }] }), /rede/);
});

test("a previsão devolve exatamente os horários que o encaixe de verdade usa", async () => {
  const db = banco();
  conectar(db, "instagram", "facebook");
  salvarPlano(db, GRADE_SQS);
  const ids = Array.from({ length: 6 }, () => video(db));
  const prev = await preverEncaixe(db, ids, AGORA, {}, deps());
  const real = await encaixarAprovados(db, ids, AGORA, {}, deps());
  assert.equal(real.erros.length, 0);
  assert.deepEqual(real.itens.map((i) => [i.videoId, i.rede, i.horario.iso]), prev.itens.map((i) => [i.videoId, i.rede, i.horario.iso]));
  const gravados = real.agendadas.map((p) => [p.videoId, p.rede, p.agendadaPara]);
  assert.deepEqual(gravados, prev.itens.map((i) => [i.videoId, i.rede, i.horario.iso]));
  assert.equal(prev.itens.length, 12);
});

test("encaixe não agenda vídeo não aprovado e é idempotente por (vídeo, rede)", async () => {
  const db = banco();
  conectar(db, "instagram");
  salvarPlano(db, GRADE_SQS);
  const ok = video(db);
  const pendente = video(db, false);
  const r1 = await encaixarAprovados(db, [ok, pendente], AGORA, {}, deps());
  assert.equal(r1.agendadas.length, 1);
  assert.ok(r1.fora.some((f) => f.videoId === pendente && f.motivo === "nao_aprovado"));
  const r2 = await encaixarAprovados(db, [ok], AGORA, {}, deps());
  assert.equal(r2.agendadas.length, 0);
  assert.ok(r2.fora.some((f) => f.motivo === "ja_agendada"));
  assert.equal((db.prepare("SELECT COUNT(*) n FROM publicacao").get() as { n: number }).n, 1);
});

test("aprovar e agendar: rede em que o vídeo não passa NÃO entra", async () => {
  const db = banco();
  conectar(db, "instagram", "facebook");
  salvarPlano(db, GRADE_SQS);
  const id = video(db, false);
  const r = await aprovarComSugestao(db, id, "aprovar_e_agendar", AGORA, {}, deps(SO_INSTAGRAM));
  assert.equal(r.video.estado, "aprovado");
  assert.deepEqual(r.agendadas.map((p) => p.rede), ["instagram"]);
  const fb = r.sugestoes.find((s) => s.rede === "facebook")!;
  assert.equal(fb.passa, false);
  assert.equal(fb.motivo, "nao_passa_validacao");
  assert.ok(fb.bloqueios.length > 0);
  assert.equal(r.sugestoes.find((s) => s.rede === "instagram")!.sugestao!.origem, "grade");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM publicacao WHERE rede = 'facebook'").get()!["n" as never], 0);
});

test("aprovar e decidir depois: sugere e não agenda", async () => {
  const db = banco();
  conectar(db, "instagram", "facebook");
  salvarPlano(db, GRADE_SQS);
  const id = video(db, false);
  const r = await aprovarComSugestao(db, id, "aprovar_e_decidir_depois", AGORA, {}, deps());
  assert.equal(r.video.estado, "aprovado");
  assert.equal(r.agendadas.length, 0);
  assert.equal(r.sugestoes.filter((s) => s.passa && s.sugestao).length, 2);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM publicacao").get() as { n: number }).n, 0);
});

test("sem grade, aprovar sugere os próximos horários livres (hora cheia, com espaçamento)", async () => {
  const db = banco();
  conectar(db, "instagram");
  const a = video(db, false);
  const b = video(db, false);
  const r1 = await aprovarComSugestao(db, a, "aprovar_e_agendar", AGORA, {}, deps());
  const r2 = await aprovarComSugestao(db, b, "aprovar_e_agendar", AGORA, {}, deps());
  const s1 = r1.sugestoes.find((s) => s.rede === "instagram")!.sugestao!;
  const s2 = r2.sugestoes.find((s) => s.rede === "instagram")!.sugestao!;
  assert.equal(s1.origem, "livre");
  assert.equal(s1.horario.rotulo, "qua 21/10 13:00");
  assert.equal(s2.horario.rotulo, "qua 21/10 14:00");
});

test("TikTok: sem escolher visibilidade não entra; público sem auditoria não passa", async () => {
  const db = banco();
  conectar(db, "tiktok");
  salvarPlano(db, GRADE_SQS);
  const a = video(db, false);
  const r = await aprovarComSugestao(db, a, "aprovar_e_agendar", AGORA, {}, deps());
  assert.equal(r.sugestoes.find((s) => s.rede === "tiktok")!.motivo, "visibilidade_obrigatoria");
  assert.equal(r.agendadas.length, 0);
  const b = video(db, false);
  const r2 = await aprovarComSugestao(db, b, "aprovar_e_agendar", AGORA, { visibilidadeTiktok: "publica" }, deps());
  assert.equal(r2.sugestoes.find((s) => s.rede === "tiktok")!.motivo, "nao_passa_validacao");
  assert.equal(r2.agendadas.length, 0);
  definirAprovacaoPlataforma(db, "tiktok", true, AGORA);
  const c = video(db, false);
  const r3 = await aprovarComSugestao(db, c, "aprovar_e_agendar", AGORA, { visibilidadeTiktok: "publica" }, deps());
  assert.equal(r3.agendadas.length, 1);
  assert.equal(r3.agendadas[0]!.visibilidade, "publica");
});

test("aprovar vídeo que não está aguardando aprovação falha e nada é agendado", async () => {
  const db = banco();
  conectar(db, "instagram");
  const id = video(db, true); // já aprovado
  await assert.rejects(aprovarComSugestao(db, id, "aprovar_e_agendar", AGORA, {}, deps()), /não está aguardando aprovação/);
  assert.equal((db.prepare("SELECT COUNT(*) n FROM publicacao").get() as { n: number }).n, 0);
});

test("virada de dia no fuso de Brasília: 22:30 BRT de sexta, vaga 00:30 de sábado vira dia UTC certo", () => {
  const plano: Plano = { ativo: true, grades: [{ dias: [6], horarios: ["00:30"], redes: ["instagram"] }] };
  const agora = new Date("2026-10-24T01:30:00.000Z"); // sex 22:30 BRT
  const v = proximaVagaDaGrade(plano, "instagram", ctx({ agora }));
  assert.equal(new Date(v!).toISOString(), "2026-10-24T03:30:00.000Z");
  assert.equal(formatarBrasilia(v!).brasilia, "2026-10-24T00:30:00-03:00");
  // 23:30 BRT já é "amanhã" em UTC? agora=sáb 00:10 UTC = sex 21:10 BRT: o dia da grade é sexta (BRT), não sábado
  const agora2 = new Date("2026-10-24T00:10:00.000Z");
  const v2 = proximaVagaDaGrade({ ativo: true, grades: [{ dias: [5], horarios: ["22:00"], redes: ["instagram"] }] }, "instagram", ctx({ agora: agora2 }));
  assert.equal(formatarBrasilia(v2!).rotulo, "sex 23/10 22:00"); // 01:00Z do sábado
  assert.equal(new Date(v2!).toISOString(), "2026-10-24T01:00:00.000Z");
});

test("virada de mês e de ano no fuso de Brasília", () => {
  const plano: Plano = { ativo: true, grades: [{ dias: [0, 1, 2, 3, 4, 5, 6], horarios: ["10:00"], redes: ["instagram"] }] };
  const fimMes = new Date("2026-10-31T14:00:00.000Z"); // sáb 31/10 11:00 BRT
  const v = proximaVagaDaGrade(plano, "instagram", ctx({ agora: fimMes }));
  assert.equal(formatarBrasilia(v!).rotulo, "dom 01/11 10:00");
  const fimAno = new Date("2026-12-31T20:00:00.000Z");
  const v2 = proximaVagaDaGrade(plano, "instagram", ctx({ agora: fimAno }));
  assert.equal(formatarBrasilia(v2!).brasilia, "2027-01-01T10:00:00-03:00");
  // 29/02 de ano bissexto
  const bissexto = new Date("2028-02-28T14:00:00.000Z");
  const v3 = proximaVagaDaGrade(plano, "instagram", ctx({ agora: bissexto }));
  assert.equal(formatarBrasilia(v3!).rotulo, "ter 29/02 10:00");
});

test("agendarPublicacao continua recusando o mesmo (vídeo, rede) duas vezes", () => {
  const db = banco();
  conectar(db, "instagram");
  const id = video(db);
  agendarPublicacao(db, { videoId: id, rede: "instagram", quando: "2026-10-22T13:00:00.000Z" }, AGORA);
  assert.throws(() => agendarPublicacao(db, { videoId: id, rede: "instagram", quando: "2026-10-23T13:00:00.000Z" }, AGORA), /já está/);
});

test("espaçamento configurado no banco vale para a grade", async () => {
  const db = banco();
  conectar(db, "instagram");
  gravarAjuste(db, CHAVE_ESPACAMENTO, "600"); // 10h
  salvarPlano(db, GRADE_SQS);
  const ids = [video(db), video(db)];
  const p = await preverEncaixe(db, ids, AGORA, {}, deps());
  // qua 18:00, depois sexta 10:00 (a 40h) — com 10h de espaço, sexta 10:00 serve
  assert.deepEqual(horasBrt(p.itens), ["qua 21/10 18:00", "sex 23/10 10:00"]);
  gravarAjuste(db, CHAVE_ESPACAMENTO, "1500"); // 25h: sexta 10:00 (40h) ainda serve
  const p2 = await preverEncaixe(db, ids, AGORA, {}, deps());
  assert.deepEqual(horasBrt(p2.itens), ["qua 21/10 18:00", "sex 23/10 10:00"]);
  gravarAjuste(db, CHAVE_ESPACAMENTO, "3000"); // 50h: empurra para sexta 18:00? 18:00qua+50h = sáb 20:00 -> seg 10:00
  const p3 = await preverEncaixe(db, ids, AGORA, {}, deps());
  assert.deepEqual(horasBrt(p3.itens), ["qua 21/10 18:00", "seg 26/10 10:00"]);
});
