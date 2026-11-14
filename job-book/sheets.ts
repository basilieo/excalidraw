// Sheets: frames treated as drawing sheets, the way a sheet set works in
// architectural drawings. A frame's name is the sheet title; the rest of the
// sheet's data (number, discipline, status, revision, issue date) lives on
// the frame in `customData.sheet`, so it saves, undoes and exports with the
// board.
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

import { paperPx } from "./paper";

import type { BoardSettings, ColorBy } from "./settings";
import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type Discipline = { code: string; name: string; color: string };

// Codes are the sheet number prefix (S-101). Edit this list to change the
// disciplines; a sheet whose code is no longer listed falls back to General.
// The fab library reads the same list (catalog/backend/jobbook/sheets.py).
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

export type Status = { code: string; name: string; color: string };

// Where a sheet is in its life. The board can be colored by these instead of
// by discipline (BoardSettings.colorBy).
export const STATUSES: Status[] = [
  { code: "draft", name: "Draft", color: "#868e96" },
  { code: "review", name: "In review", color: "#f08c00" },
  { code: "issued", name: "Issued", color: "#2f9e44" },
  { code: "hold", name: "On hold", color: "#9c36b5" },
  { code: "superseded", name: "Superseded", color: "#e03131" },
];

export const statusOf = (code: string) =>
  STATUSES.find((s) => s.code === code) ?? STATUSES[0];

export type SheetData = {
  number: string;
  discipline: string;
  status: string;
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

/** tabloid landscape at 100 px to the inch: what the title block is sized for */
const REFERENCE_SHORT_SIDE = 1100;
const SHEET_GAP = 200;

const TB_KEY = "jobbookTitleBlock";

export const isSheetFrame = (
  el: ExcalidrawElement,
): el is ExcalidrawFrameElement => el.type === "frame" && !el.isDeleted;

export const isTitleBlockPart = (el: ExcalidrawElement) =>
  !!(el.customData as any)?.[TB_KEY];

const titleBlockInfo = (el: ExcalidrawElement) =>
  (el.customData as any)?.[TB_KEY] as
    | { frameId: string; part: string; sig: string }
    | undefined;

export const readSheet = (frame: ExcalidrawFrameElement): SheetData => ({
  number: "",
  discipline: "G",
  status: "draft",
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

/** the color a sheet shows, by the board's scheme */
export const sheetColor = (data: SheetData, colorBy: ColorBy) =>
  colorBy === "status"
    ? statusOf(data.status).color
    : disciplineOf(data.discipline).color;

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
    Math.min(...sheets.map((s) => s.frame.height), REFERENCE_SHORT_SIDE) / 2;
  return [...sheets].sort(
    (a, b) =>
      Math.round(a.frame.y / rowHeight) - Math.round(b.frame.y / rowHeight) ||
      a.frame.x - b.frame.x,
  );
};

// ---------------------------------------------------------------------------
// writing sheet data

/** what the editor itself reads off a frame (getFrameSheetAccent in the fork) */
const accentFor = (data: SheetData, colorBy: ColorBy) => ({
  sheetColor: sheetColor(data, colorBy),
  sheetNumber: data.number,
});

type FrameChange = {
  patch?: Partial<SheetData>;
  title?: string;
  size?: { width: number; height: number };
};

/** a frame with new sheet data, title or size */
const withSheet = (
  frame: ExcalidrawFrameElement,
  change: FrameChange,
  colorBy: ColorBy,
) => {
  const data = { ...readSheet(frame), ...(change.patch ?? {}) };
  return newElementWith(frame, {
    ...(change.title !== undefined ? { name: change.title } : {}),
    ...(change.size ?? {}),
    customData: {
      ...(frame.customData ?? {}),
      sheet: data,
      ...accentFor(data, colorBy),
    },
  });
};

const applyChanges = (
  api: ExcalidrawImperativeAPI,
  changes: Map<string, FrameChange>,
  colorBy: ColorBy,
  captureUpdate: typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction],
) => {
  if (!changes.size) {
    return;
  }
  const elements = api.getSceneElementsIncludingDeleted().map((el) => {
    const change = changes.get(el.id);
    return change && el.type === "frame"
      ? withSheet(el as ExcalidrawFrameElement, change, colorBy)
      : el;
  });
  api.updateScene({ elements, captureUpdate });
};

/** update many sheets in one undo step */
export const updateSheets = (
  api: ExcalidrawImperativeAPI,
  changes: Map<string, FrameChange>,
  colorBy: ColorBy,
) => applyChanges(api, changes, colorBy, CaptureUpdateAction.IMMEDIATELY);

export const updateSheet = (
  api: ExcalidrawImperativeAPI,
  frameId: string,
  change: FrameChange,
  colorBy: ColorBy,
) => updateSheets(api, new Map([[frameId, change]]), colorBy);

/** recolor every sheet after the board's color scheme changes */
export const recolorSheets = (
  api: ExcalidrawImperativeAPI,
  colorBy: ColorBy,
) => {
  const changes = new Map<string, FrameChange>(
    getSheets(api.getSceneElements()).map((s) => [s.frame.id, {}]),
  );
  applyChanges(api, changes, colorBy, CaptureUpdateAction.EVENTUALLY);
};

/**
 * Give every frame without sheet data a number, so the board is a set. A
 * frame just drawn with the frame tool also snaps to the board's paper size
 * (when the board asks for that), landscape or portrait as it was drawn.
 */
export const adoptFrames = (
  api: ExcalidrawImperativeAPI,
  settings: BoardSettings,
  { snap }: { snap: boolean },
) => {
  const sheets = getSheets(api.getSceneElements());
  const changes = new Map<string, FrameChange>();
  const assigned: Sheet[] = [...sheets];
  for (const sheet of byPosition(sheets)) {
    if (!(sheet.frame.customData as any)?.sheet) {
      const number = nextNumber(assigned, "G");
      assigned.push({ ...sheet, data: { ...sheet.data, number } });
      const f = sheet.frame;
      changes.set(f.id, {
        patch: { number, discipline: "G" },
        // the frame tool names a frame "Frame"; a sheet starts untitled
        title: f.name ?? UNTITLED,
        size:
          snap && settings.snapFrames
            ? paperPx(
                settings.paper,
                f.width >= f.height ? "landscape" : "portrait",
              )
            : undefined,
      });
    }
  }
  // part of drawing the frame, not an edit of its own to undo
  applyChanges(api, changes, settings.colorBy, CaptureUpdateAction.NEVER);
};

/** add a sheet to the right of everything, at the board's paper size */
export const addSheet = (
  api: ExcalidrawImperativeAPI,
  discipline: string,
  settings: BoardSettings,
): string => {
  const sheets = getSheets(api.getSceneElements());
  const size = paperPx(settings.paper, settings.orientation);
  let x: number;
  let y: number;
  if (sheets.length) {
    // level with the rightmost sheet, so a new sheet never lands on another
    const rightmost = sheets.reduce((a, b) =>
      b.frame.x + b.frame.width > a.frame.x + a.frame.width ? b : a,
    ).frame;
    x = rightmost.x + rightmost.width + SHEET_GAP;
    y = rightmost.y;
  } else {
    const { scrollX, scrollY, width, height, zoom } = api.getAppState();
    x = width / 2 / zoom.value - scrollX - size.width / 2;
    y = height / 2 / zoom.value - scrollY - size.height / 2;
  }
  const data: SheetData = {
    number: nextNumber(sheets, discipline),
    discipline,
    status: "draft",
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
      ...size,
      name: UNTITLED,
      customData: { sheet: data, ...accentFor(data, settings.colorBy) },
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

const signature = (
  frame: ExcalidrawFrameElement,
  project: string,
  colorBy: ColorBy,
) =>
  JSON.stringify([
    frame.name,
    readSheet(frame),
    project,
    colorBy,
    Math.round(frame.x),
    Math.round(frame.y),
    Math.round(frame.width),
    Math.round(frame.height),
  ]);

/**
 * One frame's title block: a single strip, bottom right inside the frame.
 * Title, then a line of project, discipline, status, revision and issue date,
 * and the sheet number in its own cell. Sized to the sheet: on tabloid it is
 * 3.6 x 0.56 in.
 */
const buildTitleBlock = (
  frame: ExcalidrawFrameElement,
  project: string,
  colorBy: ColorBy,
  sig: string,
): ExcalidrawElement[] => {
  const data = readSheet(frame);
  const color = sheetColor(data, colorBy);
  const s = Math.min(
    Math.max(Math.min(frame.width, frame.height) / REFERENCE_SHORT_SIDE, 0.25),
    4,
  );
  const W = Math.min(360 * s, frame.width - 24 * s);
  const H = 56 * s;
  const numberCell = 96 * s;
  const x0 = frame.x + frame.width - W - 12 * s;
  const y0 = frame.y + frame.height - H - 12 * s;
  const left = x0 + 16 * s;
  const textWidth = W - numberCell - 24 * s;

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

  const meta = [
    project ? project.toUpperCase() : null,
    disciplineOf(data.discipline).name,
    statusOf(data.status).name,
    `Rev ${data.revision || "0"}`,
    data.issued || null,
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
      width: 6 * s,
      height: H,
      backgroundColor: color,
      strokeColor: color,
    }),
    box("number-cell", {
      x: x0 + W - numberCell,
      y: y0,
      width: numberCell,
      height: H,
      backgroundColor: "transparent",
    }),
    text(
      "title",
      truncate(frame.name || UNTITLED, 16 * s, textWidth),
      left,
      y0 + 9 * s,
      16 * s,
    ),
    text(
      "meta",
      truncate(meta, 9 * s, textWidth),
      left,
      y0 + 34 * s,
      9 * s,
      MUTED,
    ),
    text(
      "number",
      truncate(data.number || "—", 20 * s, numberCell - 20 * s),
      x0 + W - numberCell + 10 * s,
      y0 + 16 * s,
      20 * s,
      color,
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
  colorBy: ColorBy,
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
    const sig = signature(frame, project, colorBy);
    if (
      existing.length &&
      existing.every((el) => titleBlockInfo(el)?.sig === sig)
    ) {
      continue;
    }
    const fresh = buildTitleBlock(frame, project, colorBy, sig);
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
    // parts the new layout no longer has (the old "project" and "SHEET"
    // labels) go too
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
