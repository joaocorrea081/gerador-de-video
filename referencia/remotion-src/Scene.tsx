import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONT_BODY, FONT_DISPLAY, type Brand, type PageShot } from "./theme";

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const Backdrop: React.FC<{ accent: string }> = ({ accent }) => (
  <>
    <AbsoluteFill style={{ backgroundColor: "#06080c" }} />
    <AbsoluteFill
      style={{
        background: `radial-gradient(90% 60% at 50% 0%, ${accent}26 0%, transparent 60%)`,
      }}
    />
  </>
);

const W = 1440;
const H = 810;

/** Uma página rolando. Aparece e some dentro da janela. */
const PageScroll: React.FC<{ page: PageShot; seconds: number }> = ({ page, seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = W / page.size[0];
  const scrolled = Math.max(0, page.size[1] * scale - H);

  // entra, desce, sai
  const IN = 0.35;
  const OUT = 0.35;

  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(
          frame,
          [0, IN * fps, (seconds - OUT) * fps, seconds * fps],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        ),
      }}
    >
      <Img
        src={staticFile(page.shot)}
        style={{
          width: W,
          display: "block",
          translate: `0px ${-interpolate(
            frame,
            [0.5 * fps, (seconds - 0.5) * fps],
            [0, scrolled],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.42, 0, 0.58, 1),
            },
          )}px`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Barra de endereço que troca junto com a página. */
const AddressBar: React.FC<{ pages: PageShot[]; each: number; accent: string }> = ({
  pages,
  each,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const i = Math.min(pages.length - 1, Math.floor(frame / (each * fps)));
  const local = frame - i * each * fps;

  return (
    <div
      style={{
        height: 46,
        display: "flex",
        alignItems: "center",
        gap: 10,
        paddingLeft: 20,
        backgroundColor: "#1b212c",
      }}
    >
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <span key={c} style={{ width: 13, height: 13, borderRadius: 7, backgroundColor: c }} />
      ))}
      <div
        style={{
          marginLeft: 20,
          flex: 1,
          marginRight: 20,
          height: 28,
          borderRadius: 8,
          backgroundColor: "#262f3d",
          display: "flex",
          alignItems: "center",
          paddingLeft: 16,
          overflow: "hidden",
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize: 16,
          color: "#8fa0b5",
        }}
      >
        <span
          style={{
            opacity: interpolate(local, [0, 0.3 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(local, [0, 0.35 * fps], ["0px 14px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          {pages[i].url}
        </span>
      </div>
      {pages.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginRight: 20 }}>
          {pages.map((_, k) => (
            <span
              key={k}
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: k === i ? accent : "#39445a",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Footline: React.FC<{
  kicker: string;
  title: string;
  accent: string;
  hold: number;
}> = ({ kicker, title, accent, hold }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = hold * fps;

  return (
    <div
      style={{
        position: "absolute",
        left: 230,
        bottom: 42,
        display: "flex",
        alignItems: "center",
        gap: 20,
        opacity: interpolate(
          frame,
          [0.4 * fps, 1.1 * fps, out - 0.9 * fps, out - 0.35 * fps],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
        ),
        translate: interpolate(frame, [0.4 * fps, 1.2 * fps], ["-36px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        }),
      }}
    >
      <div style={{ width: 5, height: 52, backgroundColor: accent, borderRadius: 3 }} />
      <div>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: 5,
            color: accent,
            marginBottom: 6,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 700,
            fontSize: 38,
            color: "#ffffff",
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
      </div>
    </div>
  );
};

/**
 * O site descendo dentro da janela.
 * Um site de uma página só usa uma entrada; um site com várias
 * passa por cada uma, e o endereço muda junto.
 * É imagem rolando, não vídeo: movimento exato e nitidez cheia.
 */
export const DesktopScene: React.FC<{
  kicker: string;
  title: string;
  brand: Brand;
  hold: number;
}> = ({ kicker, title, brand, hold }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const pages = brand.pages;
  const each = hold / pages.length;

  return (
    <AbsoluteFill>
      <Backdrop accent={brand.accent} />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 72 }}>
        <div
          style={{
            width: W,
            height: H + 46,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: "#141922",
            boxShadow: `0 50px 110px rgba(0,0,0,.65), 0 0 0 1px ${brand.accent}2e`,
            translate: interpolate(frame, [0, 0.9 * fps], ["0px 40px", "0px 0px"], {
              extrapolateRight: "clamp",
              easing: EASE,
            }),
            opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          <AddressBar pages={pages} each={each} accent={brand.accent} />
          <div style={{ width: W, height: H, overflow: "hidden", position: "relative" }}>
            {pages.map((p, i) => (
              <Sequence
                key={p.shot}
                from={Math.round(i * each * fps)}
                durationInFrames={Math.round(each * fps)}
                layout="none"
              >
                <PageScroll page={p} seconds={each} />
              </Sequence>
            ))}
          </div>
        </div>
      </AbsoluteFill>
      <Footline kicker={kicker} title={title} accent={brand.accent} hold={hold} />
    </AbsoluteFill>
  );
};
