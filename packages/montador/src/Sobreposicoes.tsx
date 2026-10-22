// Camada de texto global (fica FORA do TransitionSeries, senão duas cópias
// coexistem durante o fade). Tudo aqui vem do DADO LIDO, nunca de modelo de
// linguagem: modelo, ano, km e preço chegam por prop. Os únicos textos fixos
// são rótulos de template (ANO, KM, VALOR, chamada de fechamento).
//
// Regra de posição: tags ficam nas faixas acima e abaixo da janela da foto
// (área de fundo), nunca sobre o carro. As animações são de entrada/saída das
// próprias tags (deslizar + opacidade); a transição ENTRE FOTOS continua só fade().
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DadosVeiculo, ModeloEscolha } from "@gerador/core";
import type { JanelaTag } from "./cronograma.js";
import { formatarAno, formatarKm, formatarPreco } from "./formatacao.js";
import { FOLGA_FOTO, MODELOS } from "./modelos.js";
import { FONT, SERIF, type Paleta } from "./theme.js";
import { ALTURA_QUADRO, CONFIG, type Variante } from "./variantes.js";

const ENTRADA = Easing.bezier(0.16, 1, 0.3, 1);
const SAIDA = Easing.in(Easing.cubic);
const MARGEM = 56;

/** Limites das faixas livres, a partir da janela nominal da variante. */
function faixas(variante: Variante) {
  const topoJanela = (ALTURA_QUADRO - CONFIG[variante].alturaJanela) / 2;
  const fimJanela = topoJanela + CONFIG[variante].alturaJanela;
  return { topoJanela, fimJanela };
}

/** Progresso de presença: 0 fora, 1 plena; entrada e saída suaves. */
function presenca(t: number, entra: number, sai: number, durEntrada: number, durSaida: number) {
  const ent = interpolate(t, [entra, entra + durEntrada], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  const sa = interpolate(t, [sai, sai + durSaida], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAIDA,
  });
  return { ent, sa, visivel: t >= entra && t <= sai + durSaida };
}

interface TagDef {
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


// --- Visual de cada modelo (fixo em código; o Claude só escolhe o id) ---

interface Tokens {
  fonte: string;
  raio: number;
  padding: string;
  /** Fundo do painel. */
  fundo: string;
  clip?: string;
  sombra: string;
  /** Painel ocupa a largura toda (editorial) em vez de caber no conteúdo. */
  larguraTotal: boolean;
  corTexto: string;
  corSecundario: string;
  /** Cor do valor numérico das tags de preço e km. */
  corNumero: string;
  barra: boolean;
  rotuloFonte: number;
  rotuloEspaco: number;
  /** Tamanho do valor da tag, por chave, para caber em `larguraConteudo`. */
  valorFonte: (chave: string) => number;
  precoFechamento: number;
  modeloFonte: (comprimento: number) => number;
  revendaFonte: number;
  revendaEspaco: number;
  pesoNumero: number;
  maiusculas: boolean;
}

const LARGURA_UTIL = 1080 - 2 * MARGEM;

/** Fonte que cabe: ~0,66em por algarismo em Inter/Playfair negrito. */
function caber(texto: string, maximo: number, largura: number): number {
  return Math.min(maximo, Math.floor(largura / (Math.max(1, texto.length) * 0.66)));
}

function tokens(modelo: ModeloEscolha, paleta: Paleta): Tokens {
  switch (modelo) {
    case "energico":
      return {
        fonte: FONT,
        raio: 0,
        padding: "20px 64px 22px 52px",
        fundo: paleta.destaque,
        clip: "polygon(5% 0, 100% 0, 95% 100%, 0 100%)",
        sombra: "none",
        larguraTotal: false,
        corTexto: paleta.textoSobreDestaque,
        corSecundario: paleta.textoSobreDestaque,
        corNumero: paleta.textoSobreDestaque,
        barra: false,
        rotuloFonte: 28,
        rotuloEspaco: 6,
        valorFonte: () => 100,
        precoFechamento: 128,
        modeloFonte: (n) => (n > 28 ? 54 : 66),
        revendaFonte: 60,
        revendaEspaco: 6,
        pesoNumero: 700,
        maiusculas: true,
      };
    case "numeros":
      return {
        fonte: FONT,
        raio: 16,
        padding: "12px 30px 16px 30px",
        fundo: paleta.faixa,
        sombra: "0 18px 50px rgba(0,0,0,0.35)",
        larguraTotal: false,
        corTexto: paleta.textoPrincipal,
        corSecundario: paleta.textoSecundario,
        corNumero: paleta.destaque,
        barra: false,
        rotuloFonte: 24,
        rotuloEspaco: 6,
        valorFonte: (chave) => (chave === "ano" ? 96 : 150),
        precoFechamento: 160,
        modeloFonte: (n) => (n > 28 ? 50 : 60),
        revendaFonte: 50,
        revendaEspaco: 8,
        pesoNumero: 700,
        maiusculas: false,
      };
    case "editorial":
      return {
        fonte: SERIF,
        raio: 0,
        padding: "34px 72px 34px 72px",
        fundo: `linear-gradient(180deg, transparent 0%, color-mix(in srgb, ${paleta.base} 80%, transparent) 28%, color-mix(in srgb, ${paleta.base} 80%, transparent) 72%, transparent 100%)`,
        sombra: "none",
        larguraTotal: true,
        corTexto: paleta.textoPrincipal,
        corSecundario: paleta.textoSecundario,
        corNumero: paleta.textoPrincipal,
        barra: false,
        rotuloFonte: 24,
        rotuloEspaco: 12,
        valorFonte: () => 120,
        precoFechamento: 128,
        modeloFonte: (n) => (n > 28 ? 62 : 80),
        revendaFonte: 44,
        revendaEspaco: 16,
        pesoNumero: 400,
        maiusculas: false,
      };
    default:
      return {
        fonte: FONT,
        raio: 24,
        padding: "22px 36px 26px 36px",
        fundo: paleta.faixa,
        sombra: "0 18px 50px rgba(0,0,0,0.35)",
        larguraTotal: false,
        corTexto: paleta.textoPrincipal,
        corSecundario: paleta.textoSecundario,
        corNumero: paleta.textoPrincipal,
        barra: true,
        rotuloFonte: 26,
        rotuloEspaco: 5,
        valorFonte: () => 84,
        precoFechamento: 124,
        modeloFonte: (n) => (n > 28 ? 52 : 64),
        revendaFonte: 58,
        revendaEspaco: 8,
        pesoNumero: 700,
        maiusculas: false,
      };
  }
}

/** Posição vertical ancorada na borda da foto, crescendo para FORA dela. */
function ancora(variante: Variante, faixa: "topo" | "base"): React.CSSProperties {
  const { topoJanela, fimJanela } = faixas(variante);
  return faixa === "topo"
    ? { bottom: ALTURA_QUADRO - (topoJanela - FOLGA_FOTO) }
    : { top: fimJanela + FOLGA_FOTO };
}

const Painel: React.FC<{
  tk: Tokens;
  lado?: "esq" | "dir" | "cheio";
  style: React.CSSProperties;
  children: React.ReactNode;
}> = ({ tk, lado = "cheio", style, children }) => {
  const largura: React.CSSProperties = tk.larguraTotal
    ? { left: 0, right: 0, textAlign: lado === "dir" ? "right" : "left" }
    : lado === "esq"
      ? { left: MARGEM }
      : lado === "dir"
        ? { right: MARGEM }
        : { left: MARGEM, right: MARGEM };
  return (
    <div
      style={{
        position: "absolute",
        ...largura,
        background: tk.fundo,
        clipPath: tk.clip,
        borderRadius: tk.raio,
        padding: tk.padding,
        boxShadow: tk.sombra,
        fontFamily: tk.fonte,
        overflow: "hidden",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Deslocamento de entrada/saída de um bloco, conforme o eixo do modelo. */
function deslocar(
  modelo: ModeloEscolha,
  ent: number,
  sa: number,
  lado: "esq" | "dir" | "cheio",
  faixa: "topo" | "base",
): string {
  const m = MODELOS[modelo].tag;
  const k = (1 - ent) + sa;
  if (m.eixo === "lado") {
    const sentido = lado === "dir" ? 1 : -1;
    return `${sentido * k * m.deslocamento}px 0px`;
  }
  // vertical: vem da borda do quadro mais próxima, nunca atravessa a foto
  return `0px ${(faixa === "topo" ? -1 : 1) * k * m.deslocamento}px`;
}

function opacidadeDe(modelo: ModeloEscolha, ent: number, sa: number): number {
  // energético corta seco; os outros fazem fade
  return modelo === "energico" ? (ent > 0 && sa < 1 ? 1 : 0) : Math.min(ent * 1.4, 1) * (1 - sa);
}

const Tag: React.FC<{
  def: TagDef;
  janela: JanelaTag;
  variante: Variante;
  modelo: ModeloEscolha;
  paleta: Paleta;
}> = ({ def, janela, variante, modelo, paleta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const m = MODELOS[modelo];
  const { ent, sa, visivel } = presenca(t, janela.entra, janela.sai, m.tag.entrada, m.tag.saida);
  if (!visivel) return null;
  const tk = tokens(modelo, paleta);

  const contagem = interpolate(t, [janela.entra + 0.15, janela.entra + 0.15 + m.tag.contagem], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const lado = def.lado;
  const valorFinal = def.valor(1);
  const largura = LARGURA_UTIL - 120;
  const fonteValor = Math.min(tk.valorFonte(def.chave), caber(valorFinal, 999, largura));
  const ehNumero = def.chave === "preco" || def.chave === "km";

  return (
    <Painel
      tk={tk}
      lado={lado}
      style={{
        ...ancora(variante, def.faixa),
        translate: deslocar(modelo, ent, sa, lado, def.faixa),
        opacity: opacidadeDe(modelo, ent, sa),
        maxHeight: m.alturaMax.tag,
        minWidth: tk.larguraTotal ? undefined : 300,
        // Painel de largura total só tem fundo próprio nas bordas verticais.
      }}
    >
      {modelo === "editorial" && (
        <div style={{ height: 2, width: 96 * ent, background: paleta.destaque, marginBottom: 14, marginLeft: lado === "dir" ? "auto" : 0 }} />
      )}
      <div
        style={{
          fontSize: tk.rotuloFonte,
          fontWeight: 700,
          letterSpacing: tk.rotuloEspaco,
          color: tk.corSecundario,
          marginBottom: 6,
          opacity: modelo === "energico" ? 0.85 : 1,
        }}
      >
        {def.rotulo}
      </div>
      <div
        style={{
          fontSize: fonteValor,
          fontWeight: tk.pesoNumero,
          lineHeight: 1.05,
          whiteSpace: "nowrap",
          textTransform: tk.maiusculas ? "uppercase" : "none",
          color: ehNumero ? tk.corNumero : tk.corTexto,
        }}
      >
        {def.valor(contagem)}
      </div>
      {tk.barra && (
        <div
          style={{
            marginTop: 14,
            height: 8,
            width: `${interpolate(ent, [0, 1], [0, 100])}%`,
            borderRadius: 4,
            background: paleta.destaque,
          }}
        />
      )}
    </Painel>
  );
};

export const Tags: React.FC<{
  dados: DadosVeiculo;
  janelas: JanelaTag[];
  variante: Variante;
  modelo: ModeloEscolha;
  paleta: Paleta;
}> = ({ dados, janelas, variante, modelo, paleta }) => {
  const defs = montarTags(dados);
  return (
    <>
      {defs.map((def, i) => {
        const janela = janelas[i];
        return janela ? (
          <Tag key={def.chave} def={def} janela={janela} variante={variante} modelo={modelo} paleta={paleta} />
        ) : null;
      })}
    </>
  );
};

function fadeJanela(t: number, entra: number, sai: number, durEntrada: number, durSaida: number) {
  const ent = interpolate(t, [entra, entra + durEntrada], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ENTRADA,
  });
  const sa = interpolate(t, [sai, sai + durSaida], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: SAIDA,
  });
  return { ent, sa, visivel: t >= entra && t <= sai + durSaida };
}

/** Abertura curta: revenda acima da foto, marca + modelo abaixo. */
export const Abertura: React.FC<{
  dados: DadosVeiculo;
  fim: number;
  variante: Variante;
  modelo: ModeloEscolha;
  paleta: Paleta;
}> = ({ dados, fim, variante, modelo, paleta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const m = MODELOS[modelo];
  const { ent, sa, visivel } = fadeJanela(t, 0.05, fim - m.tag.saida, m.tag.entrada, m.tag.saida);
  if (!visivel) return null;
  const tk = tokens(modelo, paleta);
  const nome = dados.modelo ?? "";
  const opacidade = opacidadeDe(modelo, ent, sa);
  return (
    <>
      {dados.revenda && (
        <Painel
          tk={tk}
          lado="esq"
          style={{
            ...ancora(variante, "topo"),
            opacity: opacidade,
            translate: deslocar(modelo, ent, sa, "esq", "topo"),
            maxHeight: m.alturaMax.abertura,
            right: tk.larguraTotal ? 0 : MARGEM,
          }}
        >
          <div
            style={{
              fontSize: tk.revendaFonte,
              fontWeight: 700,
              letterSpacing: tk.revendaEspaco,
              textTransform: "uppercase",
              color: tk.corTexto,
            }}
          >
            {dados.revenda}
          </div>
          {tk.barra && (
            <div style={{ marginTop: 12, height: 8, width: `${ent * 100}%`, borderRadius: 4, background: paleta.destaque }} />
          )}
          {modelo === "editorial" && (
            <div style={{ marginTop: 14, height: 2, width: 140 * ent, background: paleta.destaque }} />
          )}
        </Painel>
      )}
      {(dados.marca || nome) && (
        <Painel
          tk={tk}
          lado="dir"
          style={{
            ...ancora(variante, "base"),
            opacity: opacidade,
            translate: deslocar(modelo, ent, sa, "dir", "base"),
            maxHeight: m.alturaMax.abertura,
            left: tk.larguraTotal ? 0 : MARGEM,
          }}
        >
          {dados.marca && (
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: modelo === "editorial" ? 14 : 8,
                // No energético o painel É a cor de destaque: texto usa a cor legível sobre ela.
                color: modelo === "energico" ? tk.corTexto : paleta.destaque,
              }}
            >
              {dados.marca}
            </div>
          )}
          {nome !== "" && (
            <div
              style={{
                fontSize: tk.modeloFonte(nome.length),
                fontWeight: tk.pesoNumero,
                lineHeight: 1.08,
                color: tk.corTexto,
                marginTop: 6,
                overflowWrap: "anywhere",
                textTransform: tk.maiusculas ? "uppercase" : "none",
              }}
            >
              {nome}
            </div>
          )}
        </Painel>
      )}
    </>
  );
};

/** Fechamento: preço em destaque + chamada (título escrito, se houver). */
export const Fechamento: React.FC<{
  dados: DadosVeiculo;
  titulo?: string | undefined;
  inicio: number;
  variante: Variante;
  modelo: ModeloEscolha;
  paleta: Paleta;
}> = ({ dados, titulo, inicio, variante, modelo, paleta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const m = MODELOS[modelo];
  const { ent } = fadeJanela(t, inicio, durationInFrames / fps + 10, m.tag.entrada, m.tag.saida);
  if (t < inicio) return null;
  const tk = tokens(modelo, paleta);
  const preco = formatarPreco(dados.preco);
  const contagem = interpolate(t, [inicio + 0.2, inicio + 0.2 + m.tag.contagem], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const chamada = titulo?.trim() ? titulo.trim() : "Agende sua visita";
  const fonteChamada = chamada.length > 50 ? 34 : 42;
  const veiculo = [dados.marca, dados.modelo].filter(Boolean).join(" ");
  const opacidade = opacidadeDe(modelo, ent, 0);
  const fontePreco = Math.min(tk.precoFechamento, caber(preco, 999, LARGURA_UTIL - 120));
  return (
    <>
      {veiculo !== "" && (
        <Painel
          tk={tk}
          style={{
            ...ancora(variante, "topo"),
            opacity: opacidade,
            translate: deslocar(modelo, ent, 0, "cheio", "topo"),
            maxHeight: m.alturaMax.fechamento,
            padding: modelo === "editorial" ? tk.padding : "20px 40px 22px 40px",
          }}
        >
          <div
            style={{
              fontSize: modelo === "editorial" ? 46 : 40,
              fontWeight: tk.pesoNumero,
              lineHeight: 1.1,
              color: tk.corTexto,
              textTransform: tk.maiusculas ? "uppercase" : "none",
            }}
          >
            {veiculo}
          </div>
        </Painel>
      )}
      <Painel
        tk={tk}
        style={{
          ...ancora(variante, "base"),
          opacity: opacidade,
          translate: deslocar(modelo, ent, 0, "cheio", "base"),
          maxHeight: m.alturaMax.fechamento,
          padding: modelo === "editorial" ? tk.padding : "28px 40px 32px 40px",
        }}
      >
        {preco !== "" && (
          <>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 6, color: tk.corSecundario }}>VALOR</div>
            <div
              style={{
                fontSize: fontePreco,
                fontWeight: tk.pesoNumero,
                lineHeight: 1.02,
                whiteSpace: "nowrap",
                color: modelo === "energico" ? tk.corTexto : paleta.destaque,
              }}
            >
              {formatarPreco(Math.round((dados.preco ?? 0) * contagem))}
            </div>
          </>
        )}
        <div
          style={{
            marginTop: preco !== "" ? 14 : 0,
            fontSize: fonteChamada,
            fontWeight: 700,
            lineHeight: 1.15,
            color: tk.corTexto,
          }}
        >
          {chamada}
          {dados.revenda ? ` · ${dados.revenda}` : ""}
        </div>
      </Painel>
    </>
  );
};

/** Barra de progresso fina no pé do quadro: dá sensação de ritmo. */
export const Progresso: React.FC<{ paleta: Paleta }> = ({ paleta }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: 0,
        height: 10,
        width: `${(frame / durationInFrames) * 100}%`,
        background: paleta.destaque,
      }}
    />
  );
};
