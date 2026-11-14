// Paper: the sizes a sheet can be, and the units they are shown in.
//
// The board is drawn at 100 px to the inch, so a tabloid sheet is 1700 x 1100
// and a sheet printed at 100% comes out at its paper size.

export const PX_PER_IN = 100;
const MM_PER_IN = 25.4;

export type Units = "in" | "mm";
export type Orientation = "landscape" | "portrait";

export type Paper = {
  id: string;
  name: string;
  group: string;
  /** portrait width and height, in inches */
  w: number;
  h: number;
};

const mm = (v: number) => v / MM_PER_IN;

export const PAPERS: Paper[] = [
  { id: "letter", name: "Letter", group: "US", w: 8.5, h: 11 },
  { id: "legal", name: "Legal", group: "US", w: 8.5, h: 14 },
  { id: "tabloid", name: "Tabloid", group: "US", w: 11, h: 17 },
  { id: "arch-a", name: "ARCH A", group: "Architectural", w: 9, h: 12 },
  { id: "arch-b", name: "ARCH B", group: "Architectural", w: 12, h: 18 },
  { id: "arch-c", name: "ARCH C", group: "Architectural", w: 18, h: 24 },
  { id: "arch-d", name: "ARCH D", group: "Architectural", w: 24, h: 36 },
  { id: "arch-e", name: "ARCH E", group: "Architectural", w: 36, h: 48 },
  { id: "a7", name: "A7", group: "ISO", w: mm(74), h: mm(105) },
  { id: "a6", name: "A6", group: "ISO", w: mm(105), h: mm(148) },
  { id: "a5", name: "A5", group: "ISO", w: mm(148), h: mm(210) },
  { id: "a4", name: "A4", group: "ISO", w: mm(210), h: mm(297) },
  { id: "a3", name: "A3", group: "ISO", w: mm(297), h: mm(420) },
  { id: "a2", name: "A2", group: "ISO", w: mm(420), h: mm(594) },
  { id: "a1", name: "A1", group: "ISO", w: mm(594), h: mm(841) },
  { id: "a0", name: "A0", group: "ISO", w: mm(841), h: mm(1189) },
  { id: "poster-s", name: "Poster 18×24", group: "Poster", w: 18, h: 24 },
  { id: "poster-m", name: "Poster 24×36", group: "Poster", w: 24, h: 36 },
  { id: "poster-l", name: "Poster 27×40", group: "Poster", w: 27, h: 40 },
];

export const DEFAULT_PAPER = "tabloid";

export const paperById = (id: string) =>
  PAPERS.find((p) => p.id === id) ??
  PAPERS.find((p) => p.id === DEFAULT_PAPER)!;

/** a paper's size on the board, in px */
export const paperPx = (id: string, orientation: Orientation) => {
  const p = paperById(id);
  const [w, h] = orientation === "landscape" ? [p.h, p.w] : [p.w, p.h];
  return { width: w * PX_PER_IN, height: h * PX_PER_IN };
};

/** px on the board to a length in the given units */
export const toUnits = (px: number, units: Units) =>
  units === "in" ? px / PX_PER_IN : (px / PX_PER_IN) * MM_PER_IN;

/** a length in the given units to px on the board */
export const fromUnits = (value: number, units: Units) =>
  units === "in" ? value * PX_PER_IN : (value / MM_PER_IN) * PX_PER_IN;

export const formatLength = (px: number, units: Units) => {
  const v = toUnits(px, units);
  return units === "in" ? `${Math.round(v * 100) / 100}` : `${Math.round(v)}`;
};

export const formatSize = (w: number, h: number, units: Units) =>
  `${formatLength(w, units)} × ${formatLength(h, units)} ${units}`;

/** the paper a size is, if it is one (either way round) */
export const matchPaper = (
  width: number,
  height: number,
): { paper: Paper; orientation: Orientation } | null => {
  const near = (a: number, b: number) => Math.abs(a - b) < 2;
  for (const paper of PAPERS) {
    const pw = paper.w * PX_PER_IN;
    const ph = paper.h * PX_PER_IN;
    if (near(width, pw) && near(height, ph)) {
      return { paper, orientation: "portrait" };
    }
    if (near(width, ph) && near(height, pw)) {
      return { paper, orientation: "landscape" };
    }
  }
  return null;
};

/** a paper's own label, in the units asked for: "Tabloid  11 × 17 in" */
export const paperLabel = (p: Paper, units: Units) =>
  `${p.name}  ${formatSize(p.w * PX_PER_IN, p.h * PX_PER_IN, units)}`;
