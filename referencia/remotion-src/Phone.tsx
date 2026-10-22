import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_BODY, FONT_DISPLAY, type Brand } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Tela flutuante sem moldura de aparelho: canto arredondado e sombra. */
const Screen: React.FC<{
  shot: string;
  width: number;
  height: number;
  radius: number;
  scrollBy: number;
  delay: number;
  z: number;
  dim?: number;
}> = ({ shot, width, height, radius, scrollBy, delay, z, dim = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = interpolate(frame, [delay, delay + 1.0 * fps], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        backgroundColor: "#fff",
        border: "1px solid rgba(255,255,255,.14)",
        boxShadow: "0 40px 90px rgba(0,0,0,.55), 0 6px 18px rgba(0,0,0,.3)",
        translate: `0px ${enter * 90}px`,
        opacity: 1 - enter,
        zIndex: z,
      }}
    >
      <Img
        src={staticFile(shot)}
        style={{
          width,
          display: "block",
          translate: `0px ${-interpolate(
            frame,
            [delay + 1.2 * fps, delay + 7.4 * fps],
            [0, scrollBy],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )}px`,
        }}
      />
      {dim > 0 && <AbsoluteFill style={{ backgroundColor: `rgba(6,8,12,${dim})` }} />}
    </div>
  );
};

export const MobileScene: React.FC<{ brand: Brand; hold: number }> = ({ brand, hold }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#06080c" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(78% 62% at 66% 52%, ${brand.accent}26 0%, transparent 64%)`,
        }}
      />

      {/* tablet atrás, celular na frente */}
      <div
        style={{
          position: "absolute",
          right: 96,
          top: "50%",
          translate: "0px -50%",
          display: "flex",
          alignItems: "center",
        }}
      >
        <div style={{ marginRight: -118, marginTop: -48 }}>
          <Screen
            shot={brand.tabShot}
            width={640}
            height={856}
            radius={20}
            scrollBy={1500}
            delay={8}
            z={1}
            dim={0.3}
          />
        </div>
        <div style={{ marginTop: 76 }}>
          <Screen
            shot={brand.mobShots[0]}
            width={408}
            height={860}
            radius={22}
            scrollBy={2300}
            delay={0}
            z={3}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 110,
          top: "50%",
          translate: "0px -50%",
          width: 470,
        }}
      >
        <div
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: 5,
            color: brand.accent,
            marginBottom: 16,
            opacity: interpolate(frame, [0.2 * fps, 0.8 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          EVERY SCREEN
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 62,
            color: "#fff",
            lineHeight: 1.06,
            marginBottom: 34,
            opacity: interpolate(frame, [0.3 * fps, 1.0 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [0.3 * fps, 1.0 * fps], ["-34px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          Phone, tablet, desktop
        </div>
        {brand.stack.map((item, i) => (
          <div
            key={item}
            style={{
              fontFamily: FONT_BODY,
              fontWeight: 500,
              fontSize: 26,
              color: "#9db0c6",
              display: "flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 15,
              opacity: interpolate(
                frame,
                [0.7 * fps + i * 5, 1.25 * fps + i * 5],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              ),
              translate: interpolate(
                frame,
                [0.7 * fps + i * 5, 1.25 * fps + i * 5],
                ["-24px 0px", "0px 0px"],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
              ),
            }}
          >
            <span
              style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: brand.accent }}
            />
            {item}
          </div>
        ))}
      </div>
      <div style={{ opacity: 0 }}>{hold}</div>
    </AbsoluteFill>
  );
};
