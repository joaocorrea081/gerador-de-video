import { staticFile } from "remotion";

export const FONT_DISPLAY = "Plus Jakarta Sans";
export const FONT_BODY = "Inter";

export const loadFonts = () => {
  const faces = [
    { family: FONT_DISPLAY, file: "fonts/PlusJakartaSans-Bold.ttf", weight: "700" },
    { family: FONT_BODY, file: "fonts/Inter-Medium.ttf", weight: "500" },
    { family: FONT_BODY, file: "fonts/Inter-SemiBold.ttf", weight: "600" },
  ];
  for (const f of faces) {
    const face = new FontFace(f.family, `url(${staticFile(f.file)})`, { weight: f.weight });
    face.load().then(() => document.fonts.add(face));
  }
};

export type PageShot = {
  shot: string;
  size: [number, number];
  url: string;
};

export type Brand = {
  name: string;
  tagline: string;
  url: string;
  accent: string;
  stack: string[];
  scrollTitle: string;
  pagesTitle: string;
  pagesList: string[];
  pages: PageShot[];
  shots: string[];
  mobShots: string[];
  tabShot: string;
};
