// Monta a composição: uma cena por foto (ou um cartão, se não houver foto
// nenhuma), ligadas só por fade() — slide() está proibido (RESTRICOES.md:
// "pisca preto").
//
// O texto (abertura, tags, corpo, fechamento) é renderizado UMA VEZ, por cima
// de tudo, fora do TransitionSeries. Não é elemento de cena: colocá-lo dentro de
// cada `TransitionSeries.Sequence` fazia duas cópias dela coexistirem
// durante o crossfade (uma por cena), e como a entrada animava de novo em
// cada cena, as duas ficavam fora de sincronia — texto fantasma duplicado
// visível em qualquer quadro dentro de uma transição.
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Fragment } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import type { ModeloEscolha, RitmoEscolha } from "@gerador/core";
import { Cena } from "./Cena.js";
import { CartaoSemFoto } from "./CartaoSemFoto.js";
import { CorpoAnuncio } from "./CorpoAnuncio.js";
import { montarCronograma } from "./cronograma.js";
import { Abertura, Fechamento, montarTags, Progresso, Tags } from "./Sobreposicoes.js";
import { MODELO_PADRAO, MODELOS } from "./modelos.js";
import { montarPaleta } from "./theme.js";
import { corParaRgb } from "./cor.js";
import type { VideoCarroPropsMontador } from "./variantes.js";

export const FPS = 30;

/**
 * Duração "alvo" por ritmo — não é a duração final exata, que vem de
 * `calcularDuracaoFrames` (arredondada por cena, ver função abaixo). Com
 * margem de 1s pra dentro de cada ponta de 28-32s (critério #2), porque o
 * arredondamento por cena pode empurrar o total um pouco pra cima ou pra
 * baixo dependendo do número de fotos.
 */
const DURACAO_TOTAL_SEGUNDOS: Record<RitmoEscolha, number> = {
  rapido: 29,
  calmo: 31,
};

/** Duração do fade entre cenas do modelo (cada modelo tem a sua; o padrão é 0,6 s). */
export function transicaoSegundos(modelo: ModeloEscolha = MODELO_PADRAO): number {
  return MODELOS[modelo].transicaoSegundos;
}

/**
 * Duração de cada cena, em segundos, dado o número de fotos e o ritmo.
 * Com N cenas de duração D ligadas por (N-1) fades de T segundos, a
 * duração total é `N*D - (N-1)*T`. Isolando D:
 *   D = (total + (N-1)*T) / N
 * Com 0 fotos há uma única cena (o cartão), sem transição.
 */
export function calcularDuracaoCena(
  numeroFotos: number,
  ritmo: RitmoEscolha,
  modelo: ModeloEscolha = MODELO_PADRAO,
): number {
  const total = DURACAO_TOTAL_SEGUNDOS[ritmo];
  const n = Math.max(1, numeroFotos);
  return (total + (n - 1) * transicaoSegundos(modelo)) / n;
}

/** Frames de uma cena — a MESMA conta (com o MESMO `Math.round`) que monta o TransitionSeries. */
export function calcularFramesPorCena(
  numeroFotos: number,
  ritmo: RitmoEscolha,
  modelo: ModeloEscolha = MODELO_PADRAO,
): number {
  return Math.round(calcularDuracaoCena(numeroFotos, ritmo, modelo) * FPS);
}

export function calcularFramesTransicao(modelo: ModeloEscolha = MODELO_PADRAO): number {
  return Math.round(transicaoSegundos(modelo) * FPS);
}

/**
 * Duração total do vídeo em frames, para `durationInFrames`/`calculateMetadata`.
 * Derivada da MESMA aritmética usada para montar o `TransitionSeries` abaixo
 * (frames por cena arredondados vezes N, menos as transições) — nunca de
 * uma constante paralela, senão a duração declarada pode não bater com a
 * série de verdade por causa do arredondamento por cena.
 */
export function calcularDuracaoFrames(
  numeroFotos: number,
  ritmo: RitmoEscolha,
  modelo: ModeloEscolha = MODELO_PADRAO,
): number {
  const n = Math.max(1, numeroFotos);
  const framesPorCena = calcularFramesPorCena(numeroFotos, ritmo, modelo);
  const framesTransicao = calcularFramesTransicao(modelo);
  return n * framesPorCena - (n - 1) * framesTransicao;
}

export const VideoCarro: React.FC<VideoCarroPropsMontador> = ({
  dados,
  fotos,
  cardapio,
  anuncio,
  variante: varianteProp,
  destaqueAutomatico,
}) => {
  const modelo = cardapio.modelo ?? MODELO_PADRAO;
  const variante = varianteProp ?? cardapio.enquadramento ?? "nitida";
  const paleta = montarPaleta(cardapio.fundo, cardapio.cor ?? "ambar", corParaRgb(destaqueAutomatico));
  const framesPorCena = calcularFramesPorCena(fotos.length, cardapio.ritmo, modelo);
  const { durationInFrames } = useVideoConfig();
  const temCorpo = (anuncio?.corpo?.trim() ?? "") !== "";
  const cron = montarCronograma(
    durationInFrames / FPS,
    montarTags(dados).length,
    temCorpo,
    cardapio.ritmo,
    modelo,
  );
  const framesTransicao = calcularFramesTransicao(modelo);
  const timing = linearTiming({ durationInFrames: framesTransicao });

  return (
    <AbsoluteFill style={{ backgroundColor: paleta.base }}>
      {fotos.length === 0 ? (
        <CartaoSemFoto dados={dados} paleta={paleta} />
      ) : (
        <TransitionSeries>
          {fotos.map((foto, indice) => (
            <Fragment key={`cena-${indice}`}>
              {indice > 0 && (
                <TransitionSeries.Transition
                  key={`t-${indice}`}
                  presentation={fade()}
                  timing={timing}
                />
              )}
              <TransitionSeries.Sequence key={`s-${indice}`} durationInFrames={framesPorCena}>
                <Cena
                  foto={foto}
                  indice={indice}
                  duracaoFrames={framesPorCena}
                  variante={variante}
                  modelo={modelo}
                  paleta={paleta}
                />
              </TransitionSeries.Sequence>
            </Fragment>
          ))}
        </TransitionSeries>
      )}
      <CorpoAnuncio corpo={anuncio?.corpo} paleta={paleta} inicio={cron.corpoInicio} fim={cron.corpoFim} />
      <Abertura dados={dados} fim={cron.aberturaFim} variante={variante} modelo={modelo} paleta={paleta} />
      <Tags dados={dados} janelas={cron.tags} variante={variante} modelo={modelo} paleta={paleta} />
      <Fechamento
        dados={dados}
        titulo={anuncio?.titulo}
        inicio={cron.fechamentoInicio}
        variante={variante}
        modelo={modelo}
        paleta={paleta}
      />
      <Progresso paleta={paleta} />
    </AbsoluteFill>
  );
};
