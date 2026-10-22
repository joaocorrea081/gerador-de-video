import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_BODY, FONT_DISPLAY, type Brand } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const Intro: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const letters = brand.name.split("");

  return (
    <AbsoluteFill style={{ backgroundColor: "#06080c" }}>
      {/* brilho da cor da marca subindo do rodape */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 70% at 50% 118%, ${brand.accent}55 0%, transparent 62%)`,
          opacity: 1,
        }}
      />

      {/* grade sutil ao fundo */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(#ffffff09 1px, transparent 1px), linear-gradient(90deg, #ffffff09 1px, transparent 1px)",
          backgroundSize: "88px 88px",
          opacity: 0.6,
          translate: interpolate(frame, [0, 3 * fps], ["0px 0px", "-44px -22px"], {
            extrapolateRight: "clamp",
          }),
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          gap: 34,
        }}
      >
        {/* etiqueta */}
        <div
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 26,
            letterSpacing: 7,
            color: brand.accent,
            opacity: interpolate(frame, [0.15 * fps, 0.75 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
            translate: interpolate(frame, [0.15 * fps, 0.75 * fps], ["0px 22px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          WORDPRESS
        </div>

        {/* nome, letra por letra */}
        <div style={{ display: "flex", overflow: "hidden", paddingBottom: 14 }}>
          {letters.map((ch, i) => (
            <span
              key={i}
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: 700,
                fontSize: 136,
                lineHeight: 1,
                color: "#ffffff",
                letterSpacing: -2,
                translate: interpolate(
                  frame,
                  [0.3 * fps + i * 1.6, 1.15 * fps + i * 1.6],
                  ["0px 150px", "0px 0px"],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
                ),
                opacity: interpolate(
                  frame,
                  [0.3 * fps + i * 1.6, 0.9 * fps + i * 1.6],
                  [0, 1],
                  { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
                ),
              }}
            >
              {ch}
            </span>
          ))}
        </div>

        {/* risco que cresce */}
        <div
          style={{
            height: 3,
            width: 420,
            backgroundColor: brand.accent,
            scale: interpolate(frame, [0.9 * fps, 1.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
              output: "perceptual-scale",
            }),
          }}
        />

        <div
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 34,
            color: "#93a1b4",
            opacity: interpolate(frame, [1.1 * fps, 1.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
            translate: interpolate(frame, [1.1 * fps, 1.7 * fps], ["0px 18px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          {brand.tagline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
