// Sheets: frames treated as drawing sheets, the way a sheet set works in
// architectural drawings. A frame's name is the sheet title; the rest of the
// sheet's data (number, discipline, revision, issue date) lives on the frame
// in `customData.sheet`, so it saves, undoes and exports with the board.
//
// A title block is a small group of locked elements inside the frame that is
// generated from that data. Nobody edits a title block directly: rename the
// frame or change the sheet in the panel and the title block is rebuilt.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  newElementWith,
} from "@excalidraw/excalidraw";
import { randomInteger } from "@excalidraw/common";

import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type Discipline = { code: string; name: string; color: string };

// Codes are the sheet number prefix (S-101). Edit this list to change the
// disciplines; a sheet whose code is no longer listed falls back to General.
export const DISCIPLINES: Discipline[] = [
  { code: "G", name: "General", color: "#868e96" },
  { code: "D", name: "Design", color: "#1971c2" },
  { code: "S", name: "Shop drawings", color: "#e8590c" },
  { code: "F", name: "Finishes", color: "#9c36b5" },
  { code: "I", name: "Install", color: "#2f9e44" },
  { code: "R", name: "Reference", color: "#0c8599" },
];

export const disciplineOf = (code: string) =>
  DISCIPLINES.find((d) => d.code === code) ?? DISCIPLINES[0];

export type SheetData = {
  number: string;
  discipline: string;
  revision: string;
  issued: string;
  titleBlock: boolean;
};

export type Sheet = {
  frame: ExcalidrawFrameElement;
  title: string;
  data: SheetData;
};

export const UNTITLED = "Untitled sheet";

/** a new frame is a tabloid sheet, landscape, at 100 px to the inch */
export const SHEET_SIZE = { width: 1700, height: 1100 };
const SHEET_GAP = 200;

const TB_KEY = "jobbookTitleBlock";

export const isSheetFrame = (
  el: ExcalidrawElement,
): el is ExcalidrawFrameElement => el.type === "frame" && !el.isDeleted;

const isTitleBlockPart = (el: ExcalidrawElement) =>
  !!(el.customData as any)?.[TB_KEY];

const titleBlockInfo = (el: ExcalidrawElement) =>
  (el.customData as any)?.[TB_KEY] as
    | { frameId: string; part: string; sig: string }
    | undefined;

export const readSheet = (frame: ExcalidrawFrameElement): SheetData => ({
  number: "",
  discipline: "G",
  revision: "0",
  issued: "",
  titleBlock: true,
  ...((frame.customData as any)?.sheet ?? {}),
});

export const getSheets = (elements: readonly ExcalidrawElement[]): Sheet[] =>
  elements.filter(isSheetFrame).map((frame) => ({
    frame,
    title: frame.name || UNTITLED,
    data: readSheet(frame),
  }));

const disciplineIndex = (code: string) => {
  const i = DISCIPLINES.findIndex((d) => d.code === code);
  return i === -1 ? 0 : i;
};

export const compareSheetNumbers = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export const sortSheets = (sheets: Sheet[]) =>
  [...sheets].sort(
    (a, b) =>
      disciplineIndex(a.data.discipline) - disciplineIndex(b.data.discipline) ||
      // unnumbered sheets go last in their discipline
      Number(!a.data.number) - Number(!b.data.number) ||
      compareSheetNumbers(a.data.number, b.data.number) ||
      a.title.localeCompare(b.title),
  );

export const numberFor = (code: string, index: number) =>
  `${code}-${101 + index}`;

export const nextNumber = (sheets: Sheet[], code: string) => {
  const used = new Set(sheets.map((s) => s.data.number));
  let i = 0;
  while (used.has(numberFor(code, i))) {
    i++;
  }
  return numberFor(code, i);
};

/** frames in reading order: rows top to bottom, then left to right */
export const byPosition = (sheets: Sheet[]) => {
  const rowHeight =
    Math.min(...sheets.map((s) => s.frame.height), SHEET_SIZE.height) / 2;
  return [...sheets].sort(
    (a, b) =>
      Math.round(a.frame.y / rowHeight) - Math.round(b.frame.y / rowHeight) ||
      a.frame.x - b.frame.x,
  );
};

// ---------------------------------------------------------------------------
// writing sheet data

const accentFor = (data: SheetData) => ({
  sheetColor: disciplineOf(data.discipline).color,
  sheetNumber: data.number,
});

/** a frame with new sheet data (and optionally a new title) */
const withSheet = (
  frame: ExcalidrawFrameElement,
  patch: Partial<SheetData>,
  title?: string,
) => {
  const data = { ...readSheet(frame), ...patch };
  return newElementWith(frame, {
    ...(title !== undefined ? { name: title } : {}),
    customData: {
      ...(frame.customData ?? {}),
      sheet: data,
      ...accentFor(data),
    },
  });
};

/** update many sheets in one undo step */
export const updateSheets = (
  api: ExcalidrawImperativeAPI,
  changes: Map<string, { patch: Partial<SheetData>; title?: string }>,
) => {
  if (!changes.size) {
    return;
  }
  const elements = api.getSceneElementsIncludingDeleted().map((el) => {
    const change = changes.get(el.id);
    return change && el.type === "frame"
      ? withSheet(el as ExcalidrawFrameElement, change.patch, change.title)
      : el;
  });
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
};

export const updateSheet = (
  api: ExcalidrawImperativeAPI,
  frameId: string,
  patch: Partial<SheetData>,
  title?: string,
) => updateSheets(api, new Map([[frameId, { patch, title }]]));

/** give every frame without sheet data a number, so the board is a set */
export const adoptFrames = (api: ExcalidrawImperativeAPI) => {
  const sheets = getSheets(api.getSceneElements());
  const changes = new Map<
    string,
    { patch: Partial<SheetData>; title?: string }
  >();
  const assigned: Sheet[] = [...sheets];
  for (const sheet of byPosition(sheets)) {
    if (!(sheet.frame.customData as any)?.sheet) {
      const number = nextNumber(assigned, "G");
      assigned.push({ ...sheet, data: { ...sheet.data, number } });
      changes.set(sheet.frame.id, {
        patch: { number, discipline: "G" },
        // the frame tool names a frame "Frame"; a sheet starts untitled
        title: sheet.frame.name ?? UNTITLED,
      });
    }
  }
  if (changes.size) {
    const elements = api.getSceneElementsIncludingDeleted().map((el) => {
      const change = changes.get(el.id);
      return change
        ? withSheet(el as ExcalidrawFrameElement, change.patch, change.title)
        : el;
    });
    // part of loading, not an edit to undo
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
  }
};

/** add a sheet to the right of the last one in its row */
export const addSheet = (
  api: ExcalidrawImperativeAPI,
  discipline: string,
): string => {
  const sheets = getSheets(api.getSceneElements());
  let x: number;
  let y: number;
  if (sheets.length) {
    // to the right of everything, level with the rightmost sheet, so a new
    // sheet never lands on top of another
    const rightmost = sheets.reduce((a, b) =>
      b.frame.x + b.frame.width > a.frame.x + a.frame.width ? b : a,
    ).frame;
    x = rightmost.x + rightmost.width + SHEET_GAP;
    y = rightmost.y;
  } else {
    const { scrollX, scrollY, width, height, zoom } = api.getAppState();
    x = width / 2 / zoom.value - scrollX - SHEET_SIZE.width / 2;
    y = height / 2 / zoom.value - scrollY - SHEET_SIZE.height / 2;
  }
  const data: SheetData = {
    number: nextNumber(sheets, discipline),
    discipline,
    revision: "0",
    issued: "",
    titleBlock: true,
  };
  const [frame] = convertToExcalidrawElements([
    {
      type: "frame",
      children: [],
      x,
      y,
      ...SHEET_SIZE,
      name: UNTITLED,
      customData: { sheet: data, ...accentFor(data) },
    } as any,
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), frame],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return frame.id;
};

/**
 * Room around a target when zooming to it: the docked sheet panel covers the
 * right of the canvas, so that side gets the panel's width.
 */
export const viewportOffsets = () => {
  const panel = document.querySelector(".jb-sidebar");
  const right = panel ? panel.getBoundingClientRect().width : 0;
  return { top: 80, left: 80, bottom: 80, right: right + 40 };
};

export const goToSheet = (api: ExcalidrawImperativeAPI, frameId: string) => {
  const frame = api
    .getSceneElements()
    .find((el) => el.id === frameId && isSheetFrame(el));
  if (!frame) {
    return;
  }
  api.setViewport({
    target: frame,
    fit: "contain",
    animation: { duration: 300 },
    offsets: viewportOffsets(),
  });
  api.selection.select([frame.id], {
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

// ---------------------------------------------------------------------------
// title blocks

const INK = "#1e1e1e";
const MUTED = "#868e96";

const truncate = (text: string, fontSize: number, width: number) => {
  // close enough for Helvetica: about half an em per character
  const max = Math.max(4, Math.floor(width / (fontSize * 0.55)));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const signature = (frame: ExcalidrawFrameElement, project: string) =>
  JSON.stringify([
    frame.name,
    readSheet(frame),
    project,
    Math.round(frame.x),
    Math.round(frame.y),
    Math.round(frame.width),
    Math.round(frame.height),
  ]);

/** the elements of one frame's title block, bottom right inside the frame */
const buildTitleBlock = (
  frame: ExcalidrawFrameElement,
  project: string,
  sig: string,
): ExcalidrawElement[] => {
  const data = readSheet(frame);
  const discipline = disciplineOf(data.discipline);
  const s = Math.min(Math.max(frame.width / SHEET_SIZE.width, 0.4), 4);
  const W = Math.min(440 * s, frame.width - 32 * s);
  const H = 112 * s;
  const numberCell = 128 * s;
  const x0 = frame.x + frame.width - W - 16 * s;
  const y0 = frame.y + frame.height - H - 16 * s;
  const left = x0 + 24 * s;
  const textWidth = W - numberCell - 36 * s;

  const box = (part: string, extra: Record<string, unknown>) => ({
    type: "rectangle",
    id: `${frame.id}:tb:${part}`,
    roughness: 0,
    strokeWidth: 1,
    strokeColor: INK,
    roundness: null,
    fillStyle: "solid",
    ...extra,
  });
  const text = (
    part: string,
    value: string,
    x: number,
    y: number,
    fontSize: number,
    strokeColor = INK,
  ) => ({
    type: "text",
    id: `${frame.id}:tb:${part}`,
    x,
    y,
    text: value,
    fontSize,
    fontFamily: FONT_FAMILY.Helvetica,
    strokeColor,
    roughness: 0,
  });

  const title = frame.name || UNTITLED;
  const meta = [
    discipline.name,
    `Rev ${data.revision || "0"}`,
    data.issued ? `Issued ${data.issued}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const skeletons = [
    box("frame", {
      x: x0,
      y: y0,
      width: W,
      height: H,
      backgroundColor: "#ffffff",
    }),
    box("band", {
      x: x0,
      y: y0,
      width: 10 * s,
      height: H,
      backgroundColor: discipline.color,
      strokeColor: discipline.color,
    }),
    box("number-cell", {
      x: x0 + W - numberCell,
      y: y0,
      width: numberCell,
      height: H,
      backgroundColor: "transparent",
    }),
    text(
      "project",
      truncate((project || "No project").toUpperCase(), 11 * s, textWidth),
      left,
      y0 + 14 * s,
      11 * s,
      MUTED,
    ),
    text(
      "title",
      truncate(title, 22 * s, textWidth),
      left,
      y0 + 36 * s,
      22 * s,
    ),
    text(
      "meta",
      truncate(meta, 11 * s, textWidth),
      left,
      y0 + H - 28 * s,
      11 * s,
      MUTED,
    ),
    text(
      "sheet-label",
      "SHEET",
      x0 + W - numberCell + 14 * s,
      y0 + 14 * s,
      10 * s,
      MUTED,
    ),
    text(
      "number",
      truncate(data.number || "—", 30 * s, numberCell - 24 * s),
      x0 + W - numberCell + 14 * s,
      y0 + 40 * s,
      30 * s,
      discipline.color,
    ),
  ];

  return convertToExcalidrawElements(skeletons as any, {
    regenerateIds: false,
  }).map((el) => ({
    ...el,
    frameId: frame.id,
    locked: true,
    customData: {
      [TB_KEY]: { frameId: frame.id, part: el.id.split(":tb:")[1], sig },
    },
  })) as ExcalidrawElement[];
};

/**
 * Bring every title block in line with its frame. Cheap when nothing changed
 * (it compares a signature per frame), so it can run on every change.
 * Returns whether it touched the scene.
 */
export const syncTitleBlocks = (
  api: ExcalidrawImperativeAPI,
  project: string,
): boolean => {
  const all = api.getSceneElementsIncludingDeleted();
  const byId = new Map(all.map((el) => [el.id, el]));
  const frames = all.filter(isSheetFrame) as ExcalidrawFrameElement[];
  const live = new Set(frames.map((f) => f.id));

  const parts = new Map<string, ExcalidrawElement[]>();
  for (const el of all) {
    const info = titleBlockInfo(el);
    if (info && !el.isDeleted) {
      parts.set(info.frameId, [...(parts.get(info.frameId) ?? []), el]);
    }
  }

  const replace = new Map<string, ExcalidrawElement>();
  const add: ExcalidrawElement[] = [];
  const remove = (el: ExcalidrawElement) =>
    replace.set(el.id, newElementWith(el, { isDeleted: true }));

  // title blocks whose frame is gone
  for (const [frameId, els] of parts) {
    if (!live.has(frameId)) {
      els.forEach(remove);
    }
  }

  for (const frame of frames) {
    const existing = parts.get(frame.id) ?? [];
    if (!readSheet(frame).titleBlock) {
      existing.forEach(remove);
      continue;
    }
    const sig = signature(frame, project);
    if (
      existing.length &&
      existing.every((el) => titleBlockInfo(el)?.sig === sig)
    ) {
      continue;
    }
    const fresh = buildTitleBlock(frame, project, sig);
    const freshIds = new Set(fresh.map((el) => el.id));
    for (const el of fresh) {
      const old = byId.get(el.id);
      if (old) {
        replace.set(el.id, {
          ...el,
          version: old.version + 1,
          versionNonce: randomInteger(),
          index: old.index,
        } as ExcalidrawElement);
      } else {
        add.push(el);
      }
    }
    existing.filter((el) => !freshIds.has(el.id)).forEach(remove);
  }

  if (!replace.size && !add.length) {
    return false;
  }
  api.updateScene({
    elements: [...all.map((el) => replace.get(el.id) ?? el), ...add],
    // derived from the frames, like a remote update: never its own undo step
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
};

export { isTitleBlockPart };
