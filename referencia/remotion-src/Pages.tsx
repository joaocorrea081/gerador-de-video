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

/** Uma coluna de páginas inteiras deslizando devagar. */
const Column: React.FC<{
  shots: string[];
  width: number;
  speed: number;
  offset: number;
  accent: string;
  delay: number;
}> = ({ shots, width, speed, offset, accent, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div
      style={{
        width,
        display: "flex",
        flexDirection: "column",
        gap: 26,
        translate: `0px ${offset - frame * speed}px`,
        opacity: interpolate(frame, [delay, delay + 0.8 * fps], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    >
      {[...shots, ...shots].map((s, i) => (
        <Img
          key={i}
          src={staticFile(s)}
          style={{
            width,
            borderRadius: 10,
            display: "block",
            boxShadow: `0 24px 60px rgba(0,0,0,.55), 0 0 0 1px ${accent}22`,
          }}
        />
      ))}
    </div>
  );
};

export const PagesScene: React.FC<{ brand: Brand; hold: number }> = ({ brand, hold }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const COL = 430;

  const cols = [
    { shots: [brand.shots[0], brand.shots[3]], speed: 1.75, offset: -150, delay: 0 },
    { shots: [brand.shots[1], brand.shots[4]], speed: 2.5, offset: -900, delay: 4 },
    { shots: [brand.shots[2], brand.shots[5]], speed: 1.3, offset: -450, delay: 8 },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: "#06080c" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(80% 60% at 78% 50%, ${brand.accent}22 0%, transparent 62%)`,
        }}
      />

      {/* colunas à direita */}
      <div
        style={{
          position: "absolute",
          right: 70,
          top: 0,
          height: 1080,
          display: "flex",
          gap: 26,
          overflow: "hidden",
          width: COL * 3 + 52,
        }}
      >
        {cols.map((c, i) => (
          <Column
            key={i}
            shots={c.shots}
            width={COL}
            speed={c.speed}
            offset={c.offset}
            accent={brand.accent}
            delay={c.delay}
          />
        ))}
      </div>

      {/* véu para o texto respirar */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, #06080c 0%, #06080cf2 33%, #06080c00 50%)",
        }}
      />
      {/* topo e base esmaecidos */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, #06080c 0%, transparent 16%, transparent 84%, #06080c 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 120,
          top: "50%",
          translate: "0px -50%",
          width: 560,
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
          THE WHOLE SITE
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 66,
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
          {brand.pagesTitle}
        </div>
        {brand.pagesList.map((item, i) => (
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
