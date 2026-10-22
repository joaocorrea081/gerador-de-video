// Geometria dos blocos de texto, em matemática pura (sem React). É a ÚNICA
// fonte da posição e do tamanho de cada bloco: Sobreposicoes.tsx desenha o que
// este arquivo calcula, e os testes (layout.test.ts) conferem este arquivo.
// Assim, "o texto cabe na forma" é provado por cálculo, sem renderizar.
// As regras, com as medidas e o porquê, estão em PADRAO-VIDEO.md.
import { Easing, interpolate } from "remotion";
import type { DadosVeiculo, ModeloEscolha } from "@gerador/core";
import { formatarAno, formatarKm, formatarPreco } from "./formatacao.js";
import { ALTURA_QUADRO, CONFIG, LARGURA_QUADRO, type Variante } from "./variantes.js";

/** Margem lateral do quadro: o texto nunca chega mais perto da borda que isto. */
export const MARGEM = 56;
/** Largura máxima de um painel que não é de largura total. */
export const LARGURA_UTIL = LARGURA_QUADRO - 2 * MARGEM;
/** Folga mínima entre o texto e a borda da forma que o contém (px). */
export const FOLGA_TEXTO = 20;
/** Linhas por bloco (ver PADRAO-VIDEO.md). */
export const MAX_LINHAS_CHAMADA = 2;
/** Manchete do modelo: no máximo isto de tokens e de caracteres. */
export const MANCHETE_MAX_TOKENS = 3;
export const MANCHETE_MAX_CARACTERES = 24;

// ---------- medidas fixas de cada modelo ----------

export interface Medidas {
  familia: "inter" | "playfair";
  raio: number;
  padding: { t: number; r: number; b: number; l: number };
  /** Inclinação (px) das bordas laterais: 0 = retângulo. Só o enérgico inclina. */
  inclinacao: number;
  larguraTotal: boolean;
  rotuloFonte: number;
  rotuloEspaco: number;
  valorFonte: (chave: string) => number;
  precoFechamento: number;
  /** Tamanho máximo da manchete do modelo (encolhe até caber). */
  mancheteFonte: number;
  revendaFonte: number;
  revendaEspaco: number;
  pesoNumero: number;
  maiusculas: boolean;
  /** Decoração que também ocupa altura: barra sob o valor (institucional) ou filete (editorial). */
  decoracao: "barra" | "filete" | "nenhuma";
}

export const MEDIDAS: Record<ModeloEscolha, Medidas> = {
  energico: {
    familia: "inter",
    raio: 0,
    padding: { t: 20, r: 28, b: 22, l: 64 },
    inclinacao: 40,
    larguraTotal: false,
    rotuloFonte: 28,
    rotuloEspaco: 6,
    valorFonte: () => 100,
    precoFechamento: 128,
    mancheteFonte: 76,
    revendaFonte: 60,
    revendaEspaco: 6,
    pesoNumero: 700,
    maiusculas: true,
    decoracao: "nenhuma",
  },
  numeros: {
    familia: "inter",
    raio: 16,
    padding: { t: 12, r: 30, b: 16, l: 30 },
    inclinacao: 0,
    larguraTotal: false,
    rotuloFonte: 24,
    rotuloEspaco: 6,
    valorFonte: (chave) => (chave === "ano" ? 96 : 150),
    precoFechamento: 160,
    mancheteFonte: 64,
    revendaFonte: 50,
    revendaEspaco: 8,
    pesoNumero: 700,
    maiusculas: false,
    decoracao: "nenhuma",
  },
  editorial: {
    familia: "playfair",
    raio: 0,
    padding: { t: 34, r: 72, b: 34, l: 72 },
    inclinacao: 0,
    larguraTotal: true,
    rotuloFonte: 24,
    rotuloEspaco: 12,
    valorFonte: () => 120,
    precoFechamento: 128,
    mancheteFonte: 84,
    revendaFonte: 44,
    revendaEspaco: 16,
    pesoNumero: 400,
    maiusculas: false,
    decoracao: "filete",
  },
  institucional: {
    familia: "inter",
    raio: 24,
    padding: { t: 22, r: 36, b: 26, l: 36 },
    inclinacao: 0,
    larguraTotal: false,
    rotuloFonte: 26,
    rotuloEspaco: 5,
    valorFonte: () => 84,
    precoFechamento: 124,
    mancheteFonte: 70,
    revendaFonte: 58,
    revendaEspaco: 8,
    pesoNumero: 700,
    maiusculas: false,
    decoracao: "barra",
  },
};

// ---------- medida de texto ----------

/**
 * Largura estimada de um texto (px). Não há como medir fonte em cálculo puro,
 * então usa a largura média por classe de caractere, medida nos quadros
 * renderizados (Inter negrito: maiúscula ~0,70 em; algarismo ~0,62; minúscula ~0,58;
 * espaço ~0,28; Playfair um pouco mais larga). Calibrado no video-21: ASTRA em
 * 76 px mede 257 px (0,68 em/letra); a versão em 32 px mede 677 px (estimativa 694). Erra para MAIS (conservador):
 * é melhor sobrar 2% de ar do que encostar na borda.
 */
export function larguraTexto(
  texto: string,
  fonte: number,
  espaco: number,
  familia: "inter" | "playfair",
): number {
  let em = 0;
  for (const c of texto) {
    if (c === " ") em += 0.28;
    else if (".,:;·|'!".includes(c)) em += 0.3;
    else if (/\d/.test(c)) em += familia === "inter" ? 0.62 : 0.62;
    else if (c === c.toLowerCase() && c !== c.toUpperCase()) em += familia === "inter" ? 0.58 : 0.6;
    else em += familia === "inter" ? 0.7 : 0.74;
  }
  return em * fonte + espaco * [...texto].length;
}

function ajustarFonte(
  texto: string,
  base: number,
  minimo: number,
  disponivel: number,
  espaco: number,
  familia: "inter" | "playfair",
): number {
  let f = base;
  while (f > minimo && larguraTexto(texto, f, espaco, familia) > disponivel) f -= 2;
  return f;
}

/** Quebra por palavras em até `maxLinhas`. Devolve `null` se não couber. */
export function quebrarPalavras(
  texto: string,
  fonte: number,
  disponivel: number,
  espaco: number,
  familia: "inter" | "playfair",
  maxLinhas: number,
): string[] | null {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const tentativa = atual === "" ? palavra : `${atual} ${palavra}`;
    if (atual !== "" && larguraTexto(tentativa, fonte, espaco, familia) > disponivel) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual !== "") linhas.push(atual);
  if (linhas.length > maxLinhas) return null;
  if (linhas.some((l) => larguraTexto(l, fonte, espaco, familia) > disponivel)) return null;
  return linhas;
}

// ---------- nome do modelo para a tela ----------

export interface ModeloTratado {
  /** O que identifica o carro (vira a manchete). */
  manchete: string;
  /** O resto da string do banco (vira a linha secundária, menor). Pode ser vazio. */
  versao: string;
}

/**
 * Divide o nome do banco em manchete + versão, SÓ cortando e nunca
 * acrescentando: manchete ++ versão == nome original (menos espaços repetidos).
 * Manchete = primeiro token + os seguintes que não são técnicos. É técnico o
 * token que começa com algarismo ("2.0", "16V", "4P", "7L", "4X4") ou tem
 * ponto. Tokens com letra primeiro e algarismo depois ("C4", "X6", "S10")
 * identificam o carro e ficam. No máximo 3 tokens e 24 caracteres.
 */
export function tratarModelo(modelo: string | undefined): ModeloTratado {
  const tokens = (modelo ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { manchete: "", versao: "" };
  const tecnico = (t: string) => /^\d/.test(t) || t.includes(".") || t.includes("/") || t === "-";
  const manchete: string[] = [tokens[0]!];
  for (let i = 1; i < tokens.length && manchete.length < MANCHETE_MAX_TOKENS; i++) {
    const t = tokens[i]!;
    if (tecnico(t) || [...manchete, t].join(" ").length > MANCHETE_MAX_CARACTERES) break;
    manchete.push(t);
  }
  return { manchete: manchete.join(" "), versao: tokens.slice(manchete.length).join(" ") };
}

// ---------- blocos ----------

export interface ItemTexto {
  tipo: "texto";
  texto: string;
  fonte: number;
  espaco: number;
  entrelinha: number;
  peso: number;
  cor: "principal" | "secundario" | "destaque" | "numero";
  opacidade: number;
  /** Posição e tamanho no painel (px, origem no canto superior esquerdo). */
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ItemDecoracao {
  tipo: "barra" | "filete";
  y: number;
  h: number;
}
export type Item = ItemTexto | ItemDecoracao;

export type TipoBloco = "tag" | "abertura" | "fechamento";

export interface Bloco {
  chave: string;
  tipo: TipoBloco;
  faixa: "topo" | "base";
  lado: "esq" | "dir" | "cheio";
  largura: number;
  altura: number;
  itens: Item[];
  /** Alinhamento do texto dentro do painel. */
  alinha: "esq" | "dir";
  inclinacao: number;
}

type Especificacao = {
  tipo: "texto";
  texto: string;
  fonte: number;
  espaco: number;
  entrelinha: number;
  peso: number;
  cor: ItemTexto["cor"];
  mt: number;
  opacidade?: number;
} | { tipo: "barra" | "filete"; h: number; mt: number };

/** Empilha as especificações e fecha as medidas do painel. */
function montarBloco(
  modelo: ModeloEscolha,
  base: Pick<Bloco, "chave" | "tipo" | "faixa" | "lado">,
  espec: Especificacao[],
  larguraMin = 0,
): Bloco {
  const md = MEDIDAS[modelo];
  const { padding: p, inclinacao: S } = md;
  const alinha: "esq" | "dir" = md.larguraTotal && base.lado === "dir" ? "dir" : "esq";
  // 1) altura: depende só das linhas.
  let y = p.t;
  const posicionados = espec.map((e) => {
    y += e.mt;
    const h = e.tipo === "texto" ? e.fonte * e.entrelinha : e.h;
    const topo = y;
    y += h;
    return { e, topo, h };
  });
  const altura = y + p.b;
  // 2) largura: painel de largura total ocupa o quadro; os demais encolhem ao
  // conteúdo (até LARGURA_UTIL), com o recuo da inclinação em CADA linha.
  const textos = posicionados.filter((q): q is typeof q & { e: Extract<Especificacao, { tipo: "texto" }> } => q.e.tipo === "texto");
  let largura: number;
  if (md.larguraTotal) largura = LARGURA_QUADRO;
  else if (base.lado === "cheio") largura = LARGURA_UTIL;
  else {
    largura = larguraMin;
    for (const q of textos) {
      const w = larguraTexto(q.e.texto, q.e.fonte, q.e.espaco, md.familia);
      const recuo = S > 0 ? p.r + S * ((q.topo + q.h) / altura) : p.r;
      largura = Math.max(largura, p.l + w + recuo);
    }
    largura = Math.min(Math.ceil(largura), LARGURA_UTIL);
  }
  const itens: Item[] = posicionados.map(({ e, topo, h }) => {
    if (e.tipo !== "texto") return { tipo: e.tipo, y: topo, h };
    const w = larguraTexto(e.texto, e.fonte, e.espaco, md.familia);
    const x = alinha === "dir" ? largura - p.r - w : p.l;
    return {
      tipo: "texto",
      texto: e.texto,
      fonte: e.fonte,
      espaco: e.espaco,
      entrelinha: e.entrelinha,
      peso: e.peso,
      cor: e.cor,
      opacidade: e.opacidade ?? 1,
      x,
      y: topo,
      w,
      h,
    };
  });
  return { ...base, largura, altura, itens, alinha, inclinacao: S };
}

/** Largura que sobra para uma linha de texto, no pior caso de inclinação. */
function larguraLinha(md: Medidas, larguraPainel: number): number {
  return larguraPainel - md.padding.l - md.padding.r - md.inclinacao;
}

function larguraPainelMax(md: Medidas): number {
  return md.larguraTotal ? LARGURA_QUADRO : LARGURA_UTIL;
}

export interface TagDef {
  chave: string;
  rotulo: string;
  /** Texto final (do dado). `contar` anima de 0 até ele, terminando exato. */
  valor: (progressoContagem: number) => string;
  lado: "esq" | "dir";
  faixa: "topo" | "base";
}

/** Só entram tags de campos que existem no dado. */
export function montarTags(dados: DadosVeiculo): TagDef[] {
  const tags: TagDef[] = [];
  const ano = formatarAno(dados.ano);
  const km = formatarKm(dados.km);
  const preco = formatarPreco(dados.preco);
  if (ano !== "") tags.push({ chave: "ano", rotulo: "ANO", valor: () => ano, lado: "esq", faixa: "base" });
  if (km !== "")
    tags.push({
      chave: "km",
      rotulo: "QUILOMETRAGEM",
      valor: (p) => formatarKm(Math.round((dados.km ?? 0) * p)),
      lado: "dir",
      faixa: "topo",
    });
  if (preco !== "")
    tags.push({
      chave: "preco",
      rotulo: "VALOR",
      valor: (p) => formatarPreco(Math.round((dados.preco ?? 0) * p)),
      lado: "esq",
      faixa: "topo",
    });
  return tags;
}

const maiusc = (md: Medidas, t: string) => (md.maiusculas ? t.toLocaleUpperCase("pt-BR") : t);

export function blocoTag(modelo: ModeloEscolha, def: TagDef): Bloco {
  const md = MEDIDAS[modelo];
  const valor = maiusc(md, def.valor(1));
  const ehNumero = def.chave === "preco" || def.chave === "km";
  const fonteValor = ajustarFonte(valor, md.valorFonte(def.chave), 40, larguraLinha(md, larguraPainelMax(md)), 0, md.familia);
  const espec: Especificacao[] = [];
  if (md.decoracao === "filete") espec.push({ tipo: "filete", h: 2, mt: 0 });
  espec.push({
    tipo: "texto",
    texto: def.rotulo,
    fonte: md.rotuloFonte,
    espaco: md.rotuloEspaco,
    entrelinha: 1.2,
    peso: 700,
    cor: "secundario",
    mt: md.decoracao === "filete" ? 14 : 0,
    opacidade: modelo === "energico" ? 0.85 : 1,
  });
  espec.push({
    tipo: "texto",
    texto: valor,
    fonte: fonteValor,
    espaco: 0,
    entrelinha: 1.05,
    peso: md.pesoNumero,
    cor: ehNumero && modelo === "numeros" ? "destaque" : "principal",
    mt: 6,
  });
  if (md.decoracao === "barra") espec.push({ tipo: "barra", h: 8, mt: 14 });
  return montarBloco(modelo, { chave: def.chave, tipo: "tag", faixa: def.faixa, lado: def.lado }, espec, 300);
}

export function blocosAbertura(modelo: ModeloEscolha, dados: DadosVeiculo): Bloco[] {
  const md = MEDIDAS[modelo];
  const disp = larguraLinha(md, larguraPainelMax(md));
  const blocos: Bloco[] = [];
  if (dados.revenda) {
    const t = dados.revenda.trim().toLocaleUpperCase("pt-BR");
    const fonte = ajustarFonte(t, md.revendaFonte, 28, disp, md.revendaEspaco, md.familia);
    const espec: Especificacao[] = [
      { tipo: "texto", texto: t, fonte, espaco: md.revendaEspaco, entrelinha: 1.2, peso: 700, cor: "principal", mt: 0 },
    ];
    if (md.decoracao === "barra") espec.push({ tipo: "barra", h: 8, mt: 12 });
    if (md.decoracao === "filete") espec.push({ tipo: "filete", h: 2, mt: 14 });
    blocos.push(montarBloco(modelo, { chave: "revenda", tipo: "abertura", faixa: "topo", lado: "esq" }, espec));
  }
  const { manchete, versao } = tratarModelo(dados.modelo);
  if (dados.marca || manchete !== "") {
    const espec: Especificacao[] = [];
    if (dados.marca) {
      const t = maiusc(md, dados.marca);
      const espaco = modelo === "editorial" ? 14 : 8;
      espec.push({
        tipo: "texto",
        texto: t,
        fonte: 34,
        espaco,
        entrelinha: 1.2,
        peso: 700,
        cor: modelo === "energico" ? "principal" : "destaque",
        mt: 0,
      });
    }
    if (manchete !== "") {
      const t = maiusc(md, manchete);
      const fonte = ajustarFonte(t, md.mancheteFonte, 44, disp, 0, md.familia);
      espec.push({ tipo: "texto", texto: t, fonte, espaco: 0, entrelinha: 1.08, peso: md.pesoNumero, cor: "principal", mt: 6 });
    }
    const sec = linhaVersao(modelo, versao, disp, 32);
    if (sec) espec.push({ ...sec, mt: 8 });
    blocos.push(montarBloco(modelo, { chave: "modelo", tipo: "abertura", faixa: "base", lado: "dir" }, espec));
  }
  return blocos;
}

/** Linha secundária da versão: uma linha só; se não couber, perde as últimas palavras (nunca inventa). */
function linhaVersao(modelo: ModeloEscolha, versao: string, disp: number, fonte: number) {
  const md = MEDIDAS[modelo];
  let tokens = maiusc(md, versao).split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && larguraTexto(tokens.join(" "), fonte, 0, md.familia) > disp) tokens = tokens.slice(0, -1);
  if (tokens.length === 0) return null;
  return {
    tipo: "texto" as const,
    texto: tokens.join(" "),
    fonte,
    espaco: 0,
    entrelinha: 1.15,
    peso: 700,
    cor: "secundario" as const,
    opacidade: 0.92,
  };
}

export interface FechamentoEntrada {
  dados: DadosVeiculo;
  titulo?: string | undefined;
}

export function blocosFechamento(modelo: ModeloEscolha, { dados, titulo }: FechamentoEntrada): Bloco[] {
  const md = MEDIDAS[modelo];
  const disp = larguraLinha(md, LARGURA_UTIL + (md.larguraTotal ? 2 * MARGEM : 0));
  const blocos: Bloco[] = [];
  const { manchete, versao } = tratarModelo(dados.modelo);
  const veiculo = maiusc(md, [dados.marca, manchete].filter(Boolean).join(" "));
  if (veiculo !== "") {
    const fonte = ajustarFonte(veiculo, modelo === "editorial" ? 46 : 40, 28, disp, 0, md.familia);
    const espec: Especificacao[] = [
      { tipo: "texto", texto: veiculo, fonte, espaco: 0, entrelinha: 1.1, peso: md.pesoNumero, cor: "principal", mt: 0 },
    ];
    const sec = linhaVersao(modelo, versao, disp, 28);
    if (sec) espec.push({ ...sec, mt: 6 });
    blocos.push(montarBloco(modelo, { chave: "veiculo", tipo: "fechamento", faixa: "topo", lado: "cheio" }, espec));
  }
  const preco = formatarPreco(dados.preco);
  const espec: Especificacao[] = [];
  if (preco !== "") {
    const fontePreco = ajustarFonte(preco, md.precoFechamento, 60, disp, 0, md.familia);
    espec.push({ tipo: "texto", texto: "VALOR", fonte: 28, espaco: 6, entrelinha: 1.2, peso: 700, cor: "secundario", mt: 0 });
    espec.push({
      tipo: "texto",
      texto: preco,
      fonte: fontePreco,
      espaco: 0,
      entrelinha: 1.02,
      peso: md.pesoNumero,
      cor: modelo === "energico" ? "principal" : "destaque",
      mt: 0,
    });
  }
  const chamada = chamadaEmLinhas(modelo, titulo?.trim() ? titulo.trim() : "Agende sua visita", dados.revenda, disp);
  chamada.linhas.forEach((texto, i) =>
    espec.push({
      tipo: "texto",
      texto,
      fonte: chamada.fonte,
      espaco: 0,
      entrelinha: 1.15,
      peso: 700,
      cor: "principal",
      mt: i === 0 ? (preco !== "" ? 14 : 0) : 0,
    }),
  );
  blocos.push(montarBloco(modelo, { chave: "preco", tipo: "fechamento", faixa: "base", lado: "cheio" }, espec));
  return blocos;
}

/**
 * Chamada do fechamento: título escrito (até 80 caracteres) + revenda, em no
 * máximo MAX_LINHAS_CHAMADA. Tenta, nesta ordem: fonte 42, 38, 34, 30; sem a
 * revenda; e por último corta palavras do fim com reticências.
 */
export function chamadaEmLinhas(
  modelo: ModeloEscolha,
  titulo: string,
  revenda: string | undefined,
  disp: number,
): { linhas: string[]; fonte: number } {
  const md = MEDIDAS[modelo];
  const completo = revenda ? `${titulo} · ${revenda}` : titulo;
  for (const texto of [completo, titulo]) {
    for (const fonte of [42, 38, 34, 30]) {
      const l = quebrarPalavras(texto, fonte, disp, 0, md.familia, MAX_LINHAS_CHAMADA);
      if (l) return { linhas: l, fonte };
    }
  }
  const palavras = titulo.split(/\s+/);
  while (palavras.length > 1) {
    palavras.pop();
    const l = quebrarPalavras(`${palavras.join(" ")}…`, 30, disp, 0, md.familia, MAX_LINHAS_CHAMADA);
    if (l) return { linhas: l, fonte: 30 };
  }
  return { linhas: [titulo.slice(0, 20)], fonte: 30 };
}

// ---------- forma e posição no quadro ----------

/**
 * Bordas laterais da forma na altura `y` (px a partir do topo do painel).
 * Retângulo: 0 e largura. Paralelogramo (enérgico): a borda esquerda vai de
 * S (em cima) a 0 (embaixo); a direita, de L (em cima) a L-S (embaixo).
 */
export function bordasForma(b: Bloco, y: number): { esquerda: number; direita: number } {
  const f = Math.min(1, Math.max(0, y / b.altura));
  const S = b.inclinacao;
  return { esquerda: S * (1 - f), direita: b.largura - S * f };
}

/** Espaço de cada faixa do quadro, descontada a folga da foto. */
export function faixaDoQuadro(variante: Variante, faixa: "topo" | "base") {
  const topoJanela = (ALTURA_QUADRO - CONFIG[variante].alturaJanela) / 2;
  const fimJanela = topoJanela + CONFIG[variante].alturaJanela;
  return faixa === "topo" ? { inicio: 0, fim: topoJanela } : { inicio: fimJanela, fim: ALTURA_QUADRO };
}

export interface Posicao {
  top: number;
  left: number;
  bottom: number;
  right: number;
  /** Espaço vazio entre o bloco e CADA ponta da faixa (iguais, pois o bloco é centrado). */
  sobra: number;
}

/**
 * ÂNCORA: o bloco fica CENTRADO na faixa livre (entre a borda da foto e a
 * borda do quadro). Sobra igual dos dois lados; nunca um vazio morto só no pé.
 */
export function posicionar(b: Bloco, variante: Variante): Posicao {
  const f = faixaDoQuadro(variante, b.faixa);
  const sobra = (f.fim - f.inicio - b.altura) / 2;
  const top = f.inicio + sobra;
  const left = b.largura === LARGURA_QUADRO ? 0 : b.lado === "dir" ? LARGURA_QUADRO - MARGEM - b.largura : MARGEM;
  return { top, left, bottom: top + b.altura, right: left + b.largura, sobra };
}

/**
 * Confere se todo texto do bloco cabe na forma, com FOLGA_TEXTO de ar, linha a
 * linha. Para cada linha usa o PIOR ponto da inclinação: a borda esquerda no
 * topo da linha e a direita no pé dela. Devolve a lista de problemas (vazia = ok).
 */
export function violacoesForma(b: Bloco): string[] {
  const erros: string[] = [];
  for (const it of b.itens) {
    if (it.tipo !== "texto") continue;
    const esq = bordasForma(b, it.y).esquerda;
    const dir = bordasForma(b, it.y + it.h).direita;
    if (it.x < esq + FOLGA_TEXTO) erros.push(`"${it.texto}" encosta na borda esquerda (${it.x.toFixed(0)} < ${(esq + FOLGA_TEXTO).toFixed(0)})`);
    if (it.x + it.w > dir - FOLGA_TEXTO)
      erros.push(`"${it.texto}" passa da borda direita (${(it.x + it.w).toFixed(0)} > ${(dir - FOLGA_TEXTO).toFixed(0)})`);
  }
  return erros;
}

// ---------- presença (entrada e saída) ----------

export const CURVA_ENTRADA = Easing.bezier(0.16, 1, 0.3, 1);
/** Saída amortecida: acelera e desacelera (nunca termina em velocidade máxima, o que lê como corte). */
export const CURVA_SAIDA = Easing.inOut(Easing.cubic);

/** Progresso de presença: 0 fora, 1 plena; entrada e saída suaves. */
export function presenca(t: number, entra: number, sai: number, durEntrada: number, durSaida: number) {
  const ent = interpolate(t, [entra, entra + durEntrada], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CURVA_ENTRADA,
  });
  const sa = interpolate(t, [sai, sai + durSaida], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: CURVA_SAIDA,
  });
  return { ent, sa, visivel: t >= entra && t <= sai + durSaida };
}

/** Opacidade de um bloco. TODOS os modelos fazem fade na entrada e na saída: nenhum corta seco. */
export function opacidadeBloco(ent: number, sa: number): number {
  return Math.min(ent * 1.4, 1) * (1 - sa);
}
