// A cena de uma foto: fundo borrado da MESMA foto (cobre o quadro; aqui borrar
// esconde a ampliação) + janela com a foto nítida, que recebe pan e zoom
// CALCULADOS sobre a foto parada (nunca vídeo gravado). O tamanho da janela e
// o teto de escala dependem da variante (ver variantes.ts, com a conta).
// O texto (tags) é global, ver Composicao.tsx.
import { Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import type { FotoCarro } from "@gerador/core";
import type { ModeloEscolha } from "@gerador/core";
import { MODELOS } from "./modelos.js";
import type { Paleta } from "./theme.js";
import { enquadrar, LARGURA_QUADRO, type Variante } from "./variantes.js";

const Fundo: React.FC<{ foto: FotoCarro; overlay: string }> = ({ foto, overlay }) => (
  <>
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: `url(${staticFile(foto.caminho)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: "blur(44px) brightness(0.85) saturate(1.15)",
        transform: "scale(1.12)",
      }}
    />
    <div style={{ position: "absolute", inset: 0, background: overlay }} />
  </>
);

export const Cena: React.FC<{
  foto: FotoCarro;
  indice: number;
  duracaoFrames: number;
  variante: Variante;
  modelo: ModeloEscolha;
  paleta: Paleta;
}> = ({ foto, indice, duracaoFrames, variante, modelo, paleta }) => {
  const frame = useCurrentFrame();
  // Sentidos alternam entre fotos: zoom entra/sai a cada cena; o pan inverte
  // a cada 2 (4 combinações diferentes nas 4 primeiras).
  const zoomIn = indice % 2 === 0;
  const panAvanca = indice % 4 < 2;
  const progresso = interpolate(frame, [0, duracaoFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(...MODELOS[modelo].curvaCena),
  });
  const q = enquadrar(foto.largura, foto.altura, variante, progresso, zoomIn, panAvanca);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <Fundo foto={foto} overlay={paleta.overlayFundo} />
      <div
        style={{
          position: "absolute",
          top: q.topoJanela,
          left: (LARGURA_QUADRO - q.larguraJanela) / 2,
          width: q.larguraJanela,
          height: q.alturaJanela,
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        <img
          src={staticFile(foto.caminho)}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: foto.largura,
            height: foto.altura,
            transformOrigin: "0 0",
            transform: `translate(${q.x}px, ${q.y}px) scale(${q.escala})`,
            display: "block",
            maxWidth: "none",
          }}
        />
      </div>
    </div>
  );
};
