// Corpo escrito (até 400 caracteres) sobre a foto, com véu TRANSLÚCIDO (o
// carro continua visível atrás; nunca o cartão preto opaco). Aparece entre
// `inicio` e `fim` (segundos), por fade de opacidade, e sai antes do
// fechamento com o preço.
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT, type Paleta } from "./theme.js";

export const CorpoAnuncio: React.FC<{
  corpo?: string | undefined;
  paleta: Paleta;
  inicio: number;
  fim: number;
}> = ({ corpo, paleta, inicio, fim }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const texto = corpo?.trim() ?? "";
  if (texto === "") return null;

  const t = frame / fps;
  const opacidade = interpolate(t, [inicio, inicio + 0.6, fim - 0.5, fim], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacidade <= 0) return null;

  const fonte = texto.length > 250 ? 34 : texto.length > 120 ? 38 : 44;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        // Véu (scrim) translúcido da cor base: o texto lê bem e o carro
        // continua visível atrás. Antes era opaco e os últimos 7s ficavam
        // sem carro nenhum. A faixa, renderizada depois, segue por cima.
        padding: "0 72px",
        background: `linear-gradient(180deg, color-mix(in srgb, ${paleta.base} 35%, transparent) 0%, color-mix(in srgb, ${paleta.base} 76%, transparent) 40%, color-mix(in srgb, ${paleta.base} 76%, transparent) 70%, color-mix(in srgb, ${paleta.base} 35%, transparent) 100%)`,
        opacity: opacidade,
        fontFamily: FONT,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: fonte,
          fontWeight: 700,
          lineHeight: 1.35,
          color: paleta.textoPrincipal,
          overflowWrap: "anywhere",
          maxHeight: "100%",
          overflow: "hidden",
        }}
      >
        {texto}
      </div>
    </div>
  );
};
