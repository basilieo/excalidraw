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

// The phases of a job, which group and color the sheets (shown as "Phase";
// called disciplines in the code). They are NP's job book rows, in their Miro
// colors. Codes are the sheet number prefix (PR-101) and are what's stored,
// so a name or color can change freely; a code no longer listed falls back
// to the first. General and Reference come last, for anything else and for
// imported PDFs. The fab library reads the same list
// (catalog/backend/jobbook/sheets.py).
export const DISCIPLINES: Discipline[] = [
  { code: "OV", name: "Project Overview", color: "#f2b705" },
  { code: "PP", name: "Pre-Production", color: "#74c0fc" },
  { code: "PR", name: "Production", color: "#f03e3e" },
  { code: "LG", name: "Logistics", color: "#fd7e14" },
  { code: "PI", name: "Pre-Install", color: "#adb5bd" },
  { code: "IN", name: "Install", color: "#4263eb" },
  { code: "G", name: "General", color: "#868e96" },
  { code: "R", name: "Reference", color: "#0c8599" },
];

// Colors the board has changed from these defaults (BoardSettings.colors),
// by phase or status code. Set by the editor when a board loads or a color
// is picked in the sheet index.
let colorOverrides: Record<string, string> = {};
export const setColorOverrides = (colors?: Record<string, string>) => {
  colorOverrides = { ...(colors ?? {}) };
};
const withColor = <T extends { code: string; color: string }>(x: T): T =>
  colorOverrides[x.code] ? { ...x, color: colorOverrides[x.code] } : x;

// The board's own groups, once it has renamed, recoded or added any
// (BoardSettings.groups); these defaults otherwise.
let groupList: Discipline[] = DISCIPLINES;
export const setGroups = (list?: Discipline[]) => {
  groupList = list?.length ? list : DISCIPLINES;
};
/** the board's sheet groups, in order, with its colors */
export const getGroups = () => groupList.map(withColor);

export const disciplineOf = (code: string) =>
  withColor(groupList.find((d) => d.code === code) ?? groupList[0]);

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
  withColor(STATUSES.find((s) => s.code === code) ?? STATUSES[0]);

export type SheetData = {
  /** the page number: set for you, from the sheet's place in the set */
  number: string;
  /** the sheet code, its group's code and its place in the group (OV-101):
   * set for you too */
  code?: string;
  /** place within its phase, once sheets have been dragged into an order */
  order?: number;
  discipline: string;
  status: string;
  revision: string;
  issued: string;
  titleBlock: boolean;
  /** the sheet keeps its size: a resize springs back (enforceSheetSizes) */
  sizeLocked?: boolean;
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
/** in every title block part's id: a new layout gets new ids, so its parts
 * are laid in order over each other rather than taking the old ones' places */
const TB_LAYOUT = "tb3";

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
  const i = groupList.findIndex((d) => d.code === code);
  return i === -1 ? 0 : i;
};

/**
 * The set in page order: by phase, then the order sheets were dragged into
 * in the index, then their place on the board (rows top to bottom, left to
 * right). Page numbers count through this.
 */
export const sortSheets = (sheets: Sheet[]) => {
  const place = new Map(byPosition(sheets).map((s, i) => [s.frame.id, i]));
  return [...sheets].sort(
    (a, b) =>
      disciplineIndex(a.data.discipline) - disciplineIndex(b.data.discipline) ||
      (a.data.order ?? Infinity) - (b.data.order ?? Infinity) ||
      place.get(a.frame.id)! - place.get(b.frame.id)!,
  );
};

/** frames in reading order: rows top to bottom, then left to right */
export function byPosition(sheets: Sheet[]) {
  const rowHeight =
    Math.min(...sheets.map((s) => s.frame.height), REFERENCE_SHORT_SIDE) / 2;
  return [...sheets].sort(
    (a, b) =>
      Math.round(a.frame.y / rowHeight) - Math.round(b.frame.y / rowHeight) ||
      a.frame.x - b.frame.x,
  );
}

// ---------------------------------------------------------------------------
// writing sheet data

/** what the editor itself reads off a frame (getFrameSheetAccent in the fork) */
const accentFor = (data: SheetData, colorBy: ColorBy) => ({
  sheetColor: sheetColor(data, colorBy),
  sheetNumber: data.code || data.number,
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

/**
 * Every sheet's number is its page in the set, 1, 2, 3 ..., and its code is
 * its group's code and place in the group, OV-101, OV-102 ..., the way a
 * drawing set numbers sheets. Both are kept in step as sheets are added,
 * moved, reordered or change group. Never its own undo.
 */
export const syncPageNumbers = (
  api: ExcalidrawImperativeAPI,
  colorBy: ColorBy,
): boolean => {
  const changes = new Map<string, FrameChange>();
  const inGroup = new Map<string, number>();
  sortSheets(getSheets(api.getSceneElements())).forEach((s, i) => {
    const page = String(i + 1);
    const group = disciplineOf(s.data.discipline).code;
    const n = inGroup.get(group) ?? 0;
    inGroup.set(group, n + 1);
    const code = `${group}-${101 + n}`;
    if (s.data.number !== page || s.data.code !== code) {
      changes.set(s.frame.id, { patch: { number: page, code } });
    }
  });
  applyChanges(api, changes, colorBy, CaptureUpdateAction.NEVER);
  return changes.size > 0;
};

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
      const number = "";
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
  const orders = sheets
    .filter((s) => s.data.discipline === discipline)
    .map((s) => s.data.order)
    .filter((o): o is number => o !== undefined);
  const data: SheetData = {
    number: "",
    // after the sheets already put in order, if any have been
    ...(orders.length ? { order: Math.max(...orders) + 1 } : {}),
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
    "tb3",
    frame.name,
    readSheet(frame),
    sheetColor(readSheet(frame), colorBy),
    disciplineOf(readSheet(frame).discipline).name,
    project,
    colorBy,
    Math.round(frame.x),
    Math.round(frame.y),
    Math.round(frame.width),
    Math.round(frame.height),
  ]);

/** dark text on a light color, white on a dark one */
const inkOn = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    return INK;
  }
  const n = parseInt(m[1], 16);
  const lum =
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) /
    255;
  return lum > 0.6 ? INK : "#ffffff";
};

/**
 * One frame's title block, bottom right inside the frame, with no box
 * around it: the title, and under it a line of project, group, status,
 * revision and issue date, set against a pill in the group's color that
 * holds the page number and, under it, the sheet code. Sized to the sheet.
 */
const buildTitleBlock = (
  frame: ExcalidrawFrameElement,
  project: string,
  colorBy: ColorBy,
  sig: string,
): ExcalidrawElement[] => {
  const data = readSheet(frame);
  const color = sheetColor(data, colorBy);
  const ink = inkOn(color);
  const s = Math.min(
    Math.max(Math.min(frame.width, frame.height) / REFERENCE_SHORT_SIDE, 0.25),
    4,
  );
  const pill = { w: 64 * s, h: 46 * s, x: 0, y: 0 };
  pill.x = frame.x + frame.width - 16 * s - pill.w;
  pill.y = frame.y + frame.height - 16 * s - pill.h;
  const right = pill.x - 12 * s;
  const textWidth = Math.min(320 * s, frame.width - pill.w - 60 * s);

  const text = (
    part: string,
    value: string,
    y: number,
    fontSize: number,
    strokeColor = INK,
    textAlign = "right",
  ) => ({
    type: "text",
    id: `${frame.id}:${TB_LAYOUT}:${part}`,
    x: right,
    y,
    text: value,
    fontSize,
    fontFamily: FONT_FAMILY.Helvetica,
    textAlign,
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
    {
      type: "rectangle",
      id: `${frame.id}:${TB_LAYOUT}:pill`,
      x: pill.x,
      y: pill.y,
      width: pill.w,
      height: pill.h,
      roughness: 0,
      strokeWidth: 1,
      strokeColor: color,
      backgroundColor: color,
      fillStyle: "solid",
      roundness: { type: 3 },
    },
    text(
      "title",
      truncate(frame.name || UNTITLED, 16 * s, textWidth),
      pill.y + 4 * s,
      16 * s,
    ),
    text("meta", truncate(meta, 9 * s, textWidth), pill.y + 28 * s, 9 * s, MUTED),
    text("number", data.number || "—", pill.y + 6 * s, 20 * s, ink, "center"),
    text("code", data.code || "", pill.y + 29 * s, 9.5 * s, ink, "center"),
  ].filter((sk) => sk.type !== "text" || (sk as any).text);

  return convertToExcalidrawElements(skeletons as any, {
    regenerateIds: false,
  }).map((el) => {
    const part = el.id.split(`:${TB_LAYOUT}:`)[1];
    const x =
      part === "number" || part === "code"
        ? pill.x + (pill.w - el.width) / 2
        : part === "title" || part === "meta"
        ? right - el.width
        : el.x;
    return {
      ...el,
      x,
      frameId: frame.id,
      locked: true,
      customData: { [TB_KEY]: { frameId: frame.id, part, sig } },
    };
  }) as ExcalidrawElement[];
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
      existing.every(
        (el) =>
          titleBlockInfo(el)?.sig === sig &&
          el.id.includes(`:${TB_LAYOUT}:`),
      )
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

// ---------------------------------------------------------------------------
// locked sizes

type Rect = { x: number; y: number; width: number; height: number };

/**
 * A size-locked sheet that has been resized goes back to where and how big
 * it was. Excalidraw can't refuse a resize while it happens, so this puts it
 * right after: `lastGood` remembers each locked sheet's last rectangle at its
 * locked size (moving it is fine and is remembered too).
 */
export const enforceSheetSizes = (
  api: ExcalidrawImperativeAPI,
  lastGood: Map<string, Rect>,
): boolean => {
  const fixes = new Map<string, Rect>();
  for (const sheet of getSheets(api.getSceneElements())) {
    const f = sheet.frame;
    if (!sheet.data.sizeLocked) {
      lastGood.delete(f.id);
      continue;
    }
    const good = lastGood.get(f.id);
    const sameSize =
      good &&
      Math.abs(good.width - f.width) < 0.5 &&
      Math.abs(good.height - f.height) < 0.5;
    if (!good || sameSize) {
      lastGood.set(f.id, { x: f.x, y: f.y, width: f.width, height: f.height });
    } else {
      fixes.set(f.id, good);
    }
  }
  if (!fixes.size) {
    return false;
  }
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((el) => {
      const r = fixes.get(el.id);
      return r ? newElementWith(el, r) : el;
    }),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  api.setToast({ message: "That sheet's size is locked", duration: 1500 });
  return true;
};
