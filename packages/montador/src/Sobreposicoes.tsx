// Camada de texto global (fica FORA do TransitionSeries, senão duas cópias
// coexistem durante o fade). Tudo aqui vem do DADO LIDO, nunca de modelo de
// linguagem: modelo, ano, km e preço chegam por prop. Os únicos textos fixos
// são rótulos de template (ANO, KM, VALOR, chamada de fechamento).
//
// Este arquivo só DESENHA. Tamanho, posição e quebra de linha de cada bloco
// vêm de layout.ts (a mesma conta que os testes conferem). Regras e medidas
// em PADRAO-VIDEO.md. Tags ficam nas faixas acima e abaixo da janela da foto,
// centradas na faixa, nunca sobre o carro. A transição ENTRE FOTOS continua
// só fade().
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DadosVeiculo, ModeloEscolha } from "@gerador/core";
import type { JanelaTag } from "./cronograma.js";
import {
  blocoTag,
  blocosAbertura,
  blocosFechamento,
  MEDIDAS,
  montarTags,
  opacidadeBloco,
  posicionar,
  presenca,
  type Bloco,
  type TagDef,
} from "./layout.js";
import { formatarPreco } from "./formatacao.js";
import { MODELOS } from "./modelos.js";
import { FONT, SERIF, type Paleta } from "./theme.js";
import type { Variante } from "./variantes.js";

export { montarTags };

// --- Visual de cada modelo (fixo em código; o Claude só escolhe o id). As
// medidas (padding, fontes, inclinação) estão em layout.ts: aqui só cor e sombra. ---

interface Tokens {
  fonte: string;
  fundo: string;
  sombra: string;
  corTexto: string;
  corSecundario: string;
}

function tokens(modelo: ModeloEscolha, paleta: Paleta): Tokens {
  switch (modelo) {
    case "energico":
      return { fonte: FONT, fundo: paleta.destaque, sombra: "none", corTexto: paleta.textoSobreDestaque, corSecundario: paleta.textoSobreDestaque };
    case "numeros":
      return { fonte: FONT, fundo: paleta.faixa, sombra: "0 18px 50px rgba(0,0,0,0.35)", corTexto: paleta.textoPrincipal, corSecundario: paleta.textoSecundario };
    case "editorial":
      return {
        fonte: SERIF,
        fundo: `linear-gradient(180deg, transparent 0%, color-mix(in srgb, ${paleta.base} 80%, transparent) 28%, color-mix(in srgb, ${paleta.base} 80%, transparent) 72%, transparent 100%)`,
        sombra: "none",
        corTexto: paleta.textoPrincipal,
        corSecundario: paleta.textoSecundario,
      };
    default:
      return { fonte: FONT, fundo: paleta.faixa, sombra: "0 18px 50px rgba(0,0,0,0.35)", corTexto: paleta.textoPrincipal, corSecundario: paleta.textoSecundario };
  }
}

/** Deslocamento de entrada/saída de um bloco, conforme o eixo do modelo. */
function deslocar(modelo: ModeloEscolha, ent: number, sa: number, lado: "esq" | "dir" | "cheio", faixa: "topo" | "base"): string {
  const m = MODELOS[modelo].tag;
  const k = 1 - ent + sa;
  if (m.eixo === "lado") {
    const sentido = lado === "dir" ? 1 : -1;
    return `${sentido * k * m.deslocamento}px 0px`;
  }
  // vertical: vem da borda do quadro mais próxima, nunca atravessa a foto
  return `0px ${(faixa === "topo" ? -1 : 1) * k * m.deslocamento}px`;
}

/**
 * Desenha um bloco já calculado. `texto` troca o texto de uma linha (a contagem
 * do número) sem mudar a geometria, que vem do valor final.
 */
const Painel: React.FC<{
  bloco: Bloco;
  modelo: ModeloEscolha;
  paleta: Paleta;
  variante: Variante;
  ent: number;
  sa: number;
  trocas?: Record<number, string>;
  larguraFilete?: number;
}> = ({ bloco, modelo, paleta, variante, ent, sa, trocas = {}, larguraFilete = 96 }) => {
  const tk = tokens(modelo, paleta);
  const md = MEDIDAS[modelo];
  const pos = posicionar(bloco, variante);
  const S = bloco.inclinacao;
  const cores = { principal: tk.corTexto, secundario: tk.corSecundario, destaque: paleta.destaque };
  const lateral = bloco.alinha === "dir" ? { right: md.padding.r, textAlign: "right" as const } : { left: bloco.itens[0] && bloco.itens[0].tipo === "texto" ? bloco.itens[0].x : md.padding.l };
  return (
    <div
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: bloco.largura,
        height: bloco.altura,
        background: tk.fundo,
        clipPath: S > 0 ? `polygon(${S}px 0, 100% 0, calc(100% - ${S}px) 100%, 0 100%)` : undefined,
        borderRadius: md.raio,
        boxShadow: tk.sombra,
        fontFamily: tk.fonte,
        translate: deslocar(modelo, ent, sa, bloco.lado, bloco.faixa),
        opacity: opacidadeBloco(ent, sa),
        boxSizing: "border-box",
      }}
    >
      {bloco.itens.map((item, i) => {
        if (item.tipo === "texto") {
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: item.y,
                ...lateral,
                height: item.h,
                lineHeight: `${item.h}px`,
                fontSize: item.fonte,
                fontWeight: item.peso,
                letterSpacing: item.espaco,
                whiteSpace: "nowrap",
                textTransform: md.maiusculas ? "uppercase" : "none",
                color: item.cor === "numero" ? tk.corTexto : cores[item.cor],
                opacity: item.opacidade,
              }}
            >
              {trocas[i] ?? item.texto}
            </div>
          );
        }
        const largura = item.tipo === "barra" ? (bloco.largura - md.padding.l - md.padding.r) * ent : larguraFilete * ent;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: item.y,
              ...(bloco.alinha === "dir" ? { right: md.padding.r } : { left: md.padding.l }),
              height: item.h,
              width: largura,
              borderRadius: item.tipo === "barra" ? 4 : 0,
              background: paleta.destaque,
            }}
          />
        );
      })}
    </div>
  );
};

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
  const contagem = interpolate(t, [janela.entra + 0.15, janela.entra + 0.15 + m.tag.contagem], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const bloco = blocoTag(modelo, def);
  // O valor é sempre a ÚLTIMA linha de texto do bloco.
  const iValor = bloco.itens.map((x) => x.tipo).lastIndexOf("texto");
  return (
    <Painel bloco={bloco} modelo={modelo} paleta={paleta} variante={variante} ent={ent} sa={sa} trocas={{ [iValor]: def.valor(contagem) }} />
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
        return janela ? <Tag key={def.chave} def={def} janela={janela} variante={variante} modelo={modelo} paleta={paleta} /> : null;
      })}
    </>
  );
};

/** Abertura curta: revenda acima da foto, marca + modelo (manchete e versão) abaixo. */
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
  const { ent, sa, visivel } = presenca(t, 0.05, fim - m.tag.saida, m.tag.entrada, m.tag.saida);
  if (!visivel) return null;
  return (
    <>
      {blocosAbertura(modelo, dados).map((b) => (
        <Painel key={b.chave} bloco={b} modelo={modelo} paleta={paleta} variante={variante} ent={ent} sa={sa} larguraFilete={140} />
      ))}
    </>
  );
};

/** Fechamento: preço em destaque + chamada (título escrito, se houver). Fica até o fim do vídeo. */
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
  const { ent } = presenca(t, inicio, durationInFrames / fps + 10, m.tag.entrada, m.tag.saida);
  if (t < inicio) return null;
  const contagem = interpolate(t, [inicio + 0.2, inicio + 0.2 + m.tag.contagem], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <>
      {blocosFechamento(modelo, { dados, titulo }).map((b) => {
        // No bloco do preço, a linha do valor (2ª de texto) conta de zero até o dado.
        const iPreco = b.chave === "preco" && b.itens.length > 1 && formatarPreco(dados.preco) !== "" ? 1 : -1;
        const trocas = iPreco >= 0 ? { [iPreco]: formatarPreco(Math.round((dados.preco ?? 0) * contagem)) } : {};
        return <Painel key={b.chave} bloco={b} modelo={modelo} paleta={paleta} variante={variante} ent={ent} sa={0} trocas={trocas} />;
      })}
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
