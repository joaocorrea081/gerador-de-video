// Carro sem foto nenhuma: cartão só de dado, sem estourar (ver
// ETAPA-1-CRITERIO.md, item 6). Sem foto não há o que borrar nem o que
// mover — só um fundo de cor do cardápio, com uma respiração leve pra não
// ficar uma imagem estática morta. A faixa de texto é global (ver
// Composicao.tsx), não é renderizada aqui.
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DadosVeiculo } from "@gerador/core";
import { FONT, type Paleta } from "./theme.js";

export const CartaoSemFoto: React.FC<{ dados: DadosVeiculo; paleta: Paleta }> = ({
  dados,
  paleta,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const respiracao = interpolate(
    frame,
    [0, durationInFrames / 2, durationInFrames],
    [1, 1.03, 1],
    { easing: Easing.inOut(Easing.ease) },
  );

  const titulo = [dados.marca, dados.modelo].filter(Boolean).join(" ");

  return (
    <div style={{ position: "absolute", inset: 0, background: paleta.base }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: paleta.overlayFundo,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 0.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            scale: String(respiracao),
            width: 420,
            height: 420,
            borderRadius: 24,
            border: `3px solid ${paleta.textoSecundario}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 700,
            color: paleta.textoSecundario,
            textAlign: "center",
            padding: 24,
          }}
        >
          {titulo !== "" ? titulo : "sem foto disponível"}
        </div>
      </div>
    </div>
  );
};
