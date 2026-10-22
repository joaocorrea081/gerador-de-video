import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { FONT_BODY, FONT_DISPLAY, type Brand } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const Outro: React.FC<{ brand: Brand }> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#06080c" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(110% 80% at 50% 50%, ${brand.accent}30 0%, transparent 68%)`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 26 }}>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 500,
            fontSize: 30,
            letterSpacing: 4,
            color: "#8fa0b5",
            opacity: interpolate(frame, [0.1 * fps, 0.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          LIVE AT
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 92,
            color: "#fff",
            opacity: interpolate(frame, [0.25 * fps, 0.95 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0.25 * fps, 0.95 * fps], ["0px 30px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          {brand.url}
        </div>
        <div
          style={{
            height: 3,
            width: 300,
            backgroundColor: brand.accent,
            marginTop: 8,
            scale: interpolate(frame, [0.7 * fps, 1.4 * fps], [0, 1], {
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
            fontWeight: 600,
            fontSize: 32,
            color: "#9fb0c4",
            marginTop: 26,
            opacity: interpolate(frame, [1.0 * fps, 1.7 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [1.0 * fps, 1.7 * fps], ["0px 22px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          Built by João Batista · joaobatista.tech
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
