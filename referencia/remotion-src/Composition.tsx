import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { Intro } from "./Intro";
import { Outro } from "./Outro";
import { PagesScene } from "./Pages";
import { MobileScene } from "./Phone";
import { DesktopScene } from "./Scene";
import { loadFonts, type Brand } from "./theme";

loadFonts();

export const SCENES = {
  intro: 3.2,
  scroll: 20,
  pages: 7.5,
  mobile: 7.5,
  outro: 3.4,
};
export const TRANSITION = 0.6;
export const TOTAL =
  Object.values(SCENES).reduce((a, b) => a + b, 0) - 4 * TRANSITION;

export const SiteReel: React.FC<{ brand: Brand }> = ({ brand }) => {
  const { fps } = useVideoConfig();
  const T = linearTiming({ durationInFrames: Math.round(TRANSITION * fps) });
  const f = (s: number) => Math.round(s * fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#06080c" }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={f(SCENES.intro)}>
          <Intro brand={brand} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={f(SCENES.scroll)}>
          <DesktopScene
            kicker="THE SITE"
            title={brand.scrollTitle}
            brand={brand}
            hold={SCENES.scroll}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={f(SCENES.pages)}>
          <PagesScene brand={brand} hold={SCENES.pages} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={f(SCENES.mobile)}>
          <MobileScene brand={brand} hold={SCENES.mobile} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={T} />

        <TransitionSeries.Sequence durationInFrames={f(SCENES.outro)}>
          <Outro brand={brand} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
