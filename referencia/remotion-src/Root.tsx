import { Composition } from "remotion";
import { SiteReel, TOTAL } from "./Composition";
import type { Brand } from "./theme";

const FPS = 30;

const sulivam: Brand = {
  name: "SULIVAM",
  tagline: "Custom systems for business",
  url: "sulivam.com",
  accent: "#2f6bff",
  stack: ["Responsive on every screen", "Lead form built in", "Fast on mobile data"],
  pagesTitle: "Built page by page",
  pagesList: ["Home, blog and careers", "Articles with category pages", "Multi-language: EN and PT"],
  scrollTitle: "Top to bottom",
  pages: [
    { shot: "shots/sulivam-desk-01.jpg", size: [1600, 5200], url: "sulivam.com" },
  ],
  shots: [
    "shots/sulivam-desk-01.jpg",
    "shots/sulivam-desk-02.jpg",
    "shots/sulivam-desk-03.jpg",
    "shots/sulivam-desk-04.jpg",
    "shots/sulivam-desk-05.jpg",
    "shots/sulivam-desk-06.jpg",
  ],
  mobShots: [
    "shots/sulivam-mob-01.jpg",
    "shots/sulivam-mob-02.jpg",
    "shots/sulivam-mob-03.jpg",
  ],
  tabShot: "shots/sulivam-tab-01.jpg",
};


const fragoso: Brand = {
  name: "FRAGOSO",
  tagline: "Criminal law firm since 1950",
  url: "fragoso.com.br",
  accent: "#c9a227",
  stack: ["Responsive on every screen", "News and articles", "Portuguese and English"],
  pagesTitle: "Twelve pages, one system",
  pagesList: [
    "The firm, history and recognitions",
    "Practice areas and professionals",
    "News, articles, bulletins and books",
  ],
  shots: [
    "shots/fragoso-desk-01.jpg",
    "shots/fragoso-desk-02.jpg",
    "shots/fragoso-desk-03.jpg",
    "shots/fragoso-desk-04.jpg",
    "shots/fragoso-desk-05.jpg",
    "shots/fragoso-desk-06.jpg",
  ],
  scrollTitle: "Page after page",
  pages: [
    { shot: "shots/fragoso-desk-01.jpg", size: [1600, 5200], url: "fragoso.com.br/en" },
    { shot: "shots/fragoso-desk-03.jpg", size: [1600, 4272], url: "fragoso.com.br/en/our-practice" },
    { shot: "shots/fragoso-desk-04.jpg", size: [1600, 3622], url: "fragoso.com.br/en/professionals" },
  ],
  mobShots: [
    "shots/fragoso-mob-01.jpg",
    "shots/fragoso-mob-02.jpg",
    "shots/fragoso-mob-03.jpg",
  ],
  tabShot: "shots/fragoso-tab-01.jpg",
};


const strobel: Brand = {
  name: "STROBEL",
  tagline: "Residency and tax structures abroad",
  url: "strobelcapitalista.com",
  accent: "#13b57f",
  stack: ["Responsive on every screen", "Lead capture built in", "Portuguese and English"],
  scrollTitle: "Page after page",
  pages: [
    { shot: "shots/strobel-desk-01.jpg", size: [1600, 2852], url: "strobelcapitalista.com/en" },
    { shot: "shots/strobel-desk-02.jpg", size: [1600, 3942], url: "strobelcapitalista.com/en/usa" },
    { shot: "shots/strobel-desk-03.jpg", size: [1600, 3926], url: "strobelcapitalista.com/en/llc-americana" },
  ],
  pagesTitle: "One offer per page",
  pagesList: [
    "Green Card and US residency",
    "US and Uruguay tax structures",
    "Seen on CNN, Band and Record",
  ],
  shots: [
    "shots/strobel-desk-01.jpg",
    "shots/strobel-desk-02.jpg",
    "shots/strobel-desk-03.jpg",
    "shots/strobel-desk-01.jpg",
    "shots/strobel-desk-02.jpg",
    "shots/strobel-desk-03.jpg",
  ],
  mobShots: [
    "shots/strobel-mob-01.jpg",
    "shots/strobel-mob-02.jpg",
    "shots/strobel-mob-03.jpg",
  ],
  tabShot: "shots/strobel-tab-01.jpg",
};

const avhub: Brand = {
  name: "AVHUB",
  tagline: "Professional audio and video technology",
  url: "avhubtech.com",
  accent: "#5fe6e7",
  stack: ["Responsive on every screen", "Brand and product catalogue", "Four languages"],
  scrollTitle: "Page after page",
  pages: [
    { shot: "shots/avhubtech-desk-01.jpg", size: [1600, 4676], url: "avhubtech.com" },
    { shot: "shots/avhubtech-desk-03.jpg", size: [1600, 4283], url: "avhubtech.com/brands" },
    { shot: "shots/avhubtech-desk-04.jpg", size: [1600, 5200], url: "avhubtech.com/services" },
  ],
  pagesTitle: "A catalogue that scales",
  pagesList: [
    "Brands, solutions and services",
    "News and events",
    "EN, PT, ES and PL",
  ],
  shots: [
    "shots/avhubtech-desk-01.jpg",
    "shots/avhubtech-desk-02.jpg",
    "shots/avhubtech-desk-03.jpg",
    "shots/avhubtech-desk-04.jpg",
    "shots/avhubtech-desk-05.jpg",
    "shots/avhubtech-desk-01.jpg",
  ],
  mobShots: [
    "shots/avhubtech-mob-01.jpg",
    "shots/avhubtech-mob-02.jpg",
    "shots/avhubtech-mob-03.jpg",
  ],
  tabShot: "shots/avhubtech-tab-01.jpg",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Sulivam"
      component={SiteReel}
      durationInFrames={Math.round(TOTAL * FPS)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ brand: sulivam }}
      />
      <Composition
        id="Fragoso"
        component={SiteReel}
        durationInFrames={Math.round(TOTAL * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ brand: fragoso }}
      />
      <Composition
        id="Strobel"
        component={SiteReel}
        durationInFrames={Math.round(TOTAL * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ brand: strobel }}
      />
      <Composition
        id="AVhub"
        component={SiteReel}
        durationInFrames={Math.round(TOTAL * FPS)}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ brand: avhub }}
      />
    </>
  );
};
