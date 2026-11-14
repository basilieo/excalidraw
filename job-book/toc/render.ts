// A table of contents on the board: the sheet index as an object, grouped
// and colored the same way, each sheet with its code, title, status and
// revision. It keeps itself up to date: rename a sheet, change its status
// or add one, and the contents follow.
//
// Like tables and documents, its anchor is a rectangle (`customData.jbToc`)
// and what you read on it is generated as locked elements, so it prints.
// Its width is yours to set; its height follows the sheets.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  newElementWith,
} from "@excalidraw/excalidraw";
import { randomInteger } from "@excalidraw/common";

import { disciplineOf, getGroups, getSheets, sortSheets, statusOf } from "../sheets";
import { followAnchors } from "../table/render";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export const TOC_KEY = "jbToc";
const PART_KEY = "jbTocPart";

const INK = "#1e1e1e";
const MUTED = "#868e96";
const HEAD = "#495057";
const EDGE = "#dee2e6";

const PAD = 24;
const GROUP_H = 38;
const ROW_H = 27;
const MIN_WIDTH = 380;
const NEW_WIDTH = 760;

export const isToc = (el: ExcalidrawElement) =>
  !el.isDeleted && !!(el.customData as any)?.[TOC_KEY];

const partInfo = (el: ExcalidrawElement) =>
  (el.customData as any)?.[PART_KEY] as
    | { anchorId: string; sig: string; ax: number; ay: number }
    | undefined;

type Row =
  | { kind: "group"; name: string; code: string; color: string; count: number }
  | {
      kind: "sheet";
      code: string;
      title: string;
      color: string;
      status: string;
      statusColor: string;
      rev: string;
    };

/** what the contents list: the sheets in page order, by group */
const rowsFor = (elements: readonly ExcalidrawElement[]): Row[] => {
  const sheets = sortSheets(getSheets(elements));
  const rows: Row[] = [];
  for (const g of getGroups()) {
    const mine = sheets.filter((s) => disciplineOf(s.data.discipline).code === g.code);
    if (!mine.length) {
      continue;
    }
    rows.push({ kind: "group", name: g.name, code: g.code, color: g.color, count: mine.length });
    for (const s of mine) {
      const st = statusOf(s.data.status);
      rows.push({
        kind: "sheet",
        code: s.data.code || s.data.number,
        title: s.title,
        color: g.color,
        status: st.name,
        statusColor: st.color,
        rev: s.data.revision || "0",
      });
    }
  }
  return rows;
};

const heightFor = (rows: Row[]) =>
  PAD * 2 +
  rows.reduce((h, r, i) => h + (r.kind === "group" ? GROUP_H + (i ? 8 : 0) : ROW_H), 0);

let ctx: CanvasRenderingContext2D | null = null;
const fit = (text: string, size: number, max: number) => {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  ctx!.font = `${size}px Helvetica, Arial, sans-serif`;
  if (ctx!.measureText(text).width <= max) {
    return text;
  }
  let t = text;
  while (t.length > 1 && ctx!.measureText(`${t}…`).width > max) {
    t = t.slice(0, -1);
  }
  return `${t.trimEnd()}…`;
};

/** a contents object in the middle of the view */
export const createToc = (api: ExcalidrawImperativeAPI): string => {
  const rows = rowsFor(api.getSceneElements());
  const height = heightFor(rows);
  const { scrollX, scrollY, width, height: vh, zoom } = api.getAppState();
  const [anchor] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: width / 2 / zoom.value - scrollX - NEW_WIDTH / 2,
      y: vh / 2 / zoom.value - scrollY - height / 2,
      width: NEW_WIDTH,
      height,
      strokeColor: EDGE,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3, value: 8 },
      customData: { [TOC_KEY]: { v: 1 } },
    } as any,
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), anchor],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  syncTocs(api);
  return anchor.id;
};

/** a contents anchor for the template builder, at a place in a frame */
export const tocAnchor = (
  x: number,
  y: number,
  width: number,
  frameId: string | null,
): ExcalidrawElement => {
  const [anchor] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width,
      height: 200,
      strokeColor: EDGE,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3, value: 8 },
      customData: { [TOC_KEY]: { v: 1 } },
    } as any,
  ]);
  return { ...anchor, frameId } as ExcalidrawElement;
};

const buildParts = (anchor: ExcalidrawElement, rows: Row[], sig: string) => {
  const ox = anchor.x;
  const oy = anchor.y;
  const W = anchor.width;
  const id = (part: string) => `${anchor.id}:c:${part}`;
  const sk: any[] = [];
  const bold = new Set<string>();
  const text = (
    part: string,
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    mono = false,
  ) =>
    sk.push({
      type: "text",
      id: id(part),
      x: ox + x,
      y: oy + y,
      text: value,
      fontSize: size,
      fontFamily: mono ? FONT_FAMILY.Cascadia : FONT_FAMILY.Helvetica,
      lineHeight: 1.2,
      strokeColor: color,
      roughness: 0,
    });

  const revX = W - PAD - 52;
  const statusX = revX - 108;
  const codeX = PAD + 14;
  const titleX = PAD + 96;
  let y = PAD;
  rows.forEach((r, i) => {
    if (r.kind === "group") {
      y += i ? 8 : 0;
      const mid = y + GROUP_H / 2;
      sk.push({
        type: "rectangle",
        id: id(`chip:${i}`),
        x: ox + PAD,
        y: oy + mid - 6,
        width: 12,
        height: 12,
        strokeColor: r.color,
        backgroundColor: r.color,
        fillStyle: "solid",
        roughness: 0,
        roundness: { type: 3, value: 2 },
      });
      const name = r.name.toUpperCase();
      text(`gname:${i}`, name, PAD + 22, mid - 8, 13, HEAD);
      text(`gname:${i}:b`, name, PAD + 22.5, mid - 8, 13, HEAD);
      bold.add(id(`gname:${i}`));
      text(`gcode:${i}`, `${r.code}  ${r.count}`, PAD + 22, mid - 8, 13, MUTED, true);
      y += GROUP_H;
      return;
    }
    const mid = y + ROW_H / 2;
    sk.push({
      type: "line",
      id: id(`bar:${i}`),
      x: ox + PAD + 4,
      y: oy + mid - 9,
      width: 0,
      height: 18,
      points: [
        [0, 0],
        [0, 18],
      ],
      strokeColor: r.color,
      strokeWidth: 3,
      roughness: 0,
      roundness: null,
    });
    text(`code:${i}`, r.code, codeX, mid - 8, 13, MUTED, true);
    text(`title:${i}`, fit(r.title, 15, statusX - titleX - 12), titleX, mid - 9, 15, INK);
    text(`status:${i}`, r.status, statusX, mid - 8, 13, r.statusColor);
    text(`rev:${i}`, `Rev ${r.rev}`, revX, mid - 8, 13, MUTED);
    y += ROW_H;
  });

  const els = convertToExcalidrawElements(sk, { regenerateIds: false });
  // the group code sits after its name, wherever the name ends
  const nameEnd = new Map<string, number>();
  for (const el of els) {
    const m = /:c:gname:(\d+)$/.exec(el.id);
    if (m) {
      nameEnd.set(m[1], el.x + el.width);
    }
  }
  return els.map((el) => {
    const m = /:c:gcode:(\d+)$/.exec(el.id);
    const x = m && nameEnd.has(m[1]) ? nameEnd.get(m[1])! + 10 : el.x;
    return {
      ...el,
      x,
      frameId: anchor.frameId,
      opacity: anchor.opacity,
      locked: true,
      customData: {
        [PART_KEY]: { anchorId: anchor.id, sig, ax: anchor.x, ay: anchor.y },
      },
    } as ExcalidrawElement;
  });
};

/** bring every contents object in line with the sheets */
export const syncTocs = (
  api: ExcalidrawImperativeAPI,
  { moving = false }: { moving?: boolean } = {},
): boolean => {
  const all = api.getSceneElementsIncludingDeleted();
  if (moving) {
    return followAnchors(api, all, PART_KEY, isToc);
  }
  const anchors = all.filter(isToc);
  const parts = new Map<string, ExcalidrawElement[]>();
  for (const el of all) {
    const info = partInfo(el);
    if (info && !el.isDeleted) {
      parts.set(info.anchorId, [...(parts.get(info.anchorId) ?? []), el]);
    }
  }
  if (!anchors.length && !parts.size) {
    return false;
  }
  const byId = new Map(all.map((el) => [el.id, el]));
  const live = new Set(anchors.map((a) => a.id));
  const replace = new Map<string, ExcalidrawElement>();
  const add: ExcalidrawElement[] = [];
  const remove = (el: ExcalidrawElement) =>
    replace.set(el.id, newElementWith(el, { isDeleted: true }));
  for (const [anchorId, els] of parts) {
    if (!live.has(anchorId)) {
      els.forEach(remove);
    }
  }

  const rows = anchors.length ? rowsFor(all.filter((e) => !e.isDeleted)) : [];
  const height = heightFor(rows);
  for (let anchor of anchors) {
    const width = Math.max(MIN_WIDTH, anchor.width);
    if (Math.abs(anchor.width - width) > 0.5 || Math.abs(anchor.height - height) > 0.5) {
      anchor = newElementWith(anchor, { width, height });
      replace.set(anchor.id, anchor);
    }
    const sig = JSON.stringify([
      "c1",
      rows,
      Math.round(anchor.width),
      Math.round(anchor.x * 10),
      Math.round(anchor.y * 10),
      anchor.frameId,
      anchor.opacity,
    ]);
    const existing = parts.get(anchor.id) ?? [];
    if (existing.length && existing.every((el) => partInfo(el)?.sig === sig)) {
      continue;
    }
    const fresh = buildParts(anchor, rows, sig);
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
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
};
