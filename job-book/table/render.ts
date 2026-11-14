// Tables on the canvas. The table's anchor is an ordinary white rectangle
// that holds the data; everything you see in it (grid, header shading, cell
// fills, text) is generated from that data as locked elements, the same way
// title blocks are. So a table prints, exports and zooms with the board, and
// nobody can knock a cell's text out of its cell.
//
// Resizing the anchor's width scales the columns; its height always follows
// the rows.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  newElementWith,
} from "@excalidraw/excalidraw";
import { randomInteger } from "@excalidraw/common";

import { tableDisplay } from "./formula";
import {
  LINE_HEIGHT,
  FONT_SIZE,
  PAD_X,
  PAD_Y,
  isHeader,
  layoutTable,
} from "./layout";
import { newTable, readTable, scaleColumns, TABLE_KEY } from "./model";

import type { TableLayout } from "./layout";
import type { TableData } from "./model";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const PART_KEY = "jbTablePart";
const LAID_KEY = "jbTableLaidWidth";

const INK = "#1e1e1e";
const ERROR = "#e03131";
const HEADER_FILL = "#f1f3f5";
// mid greys, so the grid still shows when dark mode inverts the board
const LINE = "#ced4da";
const EDGE = "#868e96";

export const isTableAnchor = (el: ExcalidrawElement) =>
  !el.isDeleted && !!(el.customData as any)?.[TABLE_KEY];

export const isTablePart = (el: ExcalidrawElement) =>
  !!(el.customData as any)?.[PART_KEY];

const partInfo = (el: ExcalidrawElement) =>
  (el.customData as any)?.[PART_KEY] as
    | { anchorId: string; sig: string; ax: number; ay: number }
    | undefined;

export const tableOf = (anchor: ExcalidrawElement): TableData | null =>
  readTable((anchor.customData as any)?.[TABLE_KEY]);

/** a table's data and layout, as drawn */
export const describeTable = (anchor: ExcalidrawElement) => {
  const data = tableOf(anchor);
  if (!data) {
    return null;
  }
  const display = tableDisplay(data);
  return { data, display, layout: layoutTable(data, display) };
};

/** the anchor element for a table: a white rectangle holding its data */
export const tableAnchor = (
  data: TableData,
  x: number,
  y: number,
  frameId: string | null = null,
): ExcalidrawElement => {
  const layout = layoutTable(data, tableDisplay(data));
  const [anchor] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x,
      y,
      width: layout.width,
      height: layout.height,
      strokeColor: "transparent",
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: null,
      customData: { [TABLE_KEY]: data, [LAID_KEY]: layout.width },
    } as any,
  ]);
  return { ...anchor, frameId } as ExcalidrawElement;
};

/** put a new table in the middle of the view */
export const createTable = (
  api: ExcalidrawImperativeAPI,
  rows: number,
  cols: number,
): string => {
  const data = newTable(
    Math.min(Math.max(rows, 1), 200),
    Math.min(Math.max(cols, 1), 26),
  );
  const layout = layoutTable(data, tableDisplay(data));
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const anchor = tableAnchor(
    data,
    width / 2 / zoom.value - scrollX - layout.width / 2,
    height / 2 / zoom.value - scrollY - layout.height / 2,
  );
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), anchor],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  syncTables(api);
  return anchor.id;
};

/** change one table's data, as one undo step */
export const updateTable = (
  api: ExcalidrawImperativeAPI,
  anchorId: string,
  change: (t: TableData) => TableData,
) => {
  const elements = api.getSceneElementsIncludingDeleted().map((el) => {
    if (el.id !== anchorId || !isTableAnchor(el)) {
      return el;
    }
    const before = tableOf(el)!;
    const after = change(before);
    if (after === before) {
      return el;
    }
    return newElementWith(el, {
      customData: { ...el.customData, [TABLE_KEY]: after },
    });
  });
  api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
};

const signature = (anchor: ExcalidrawElement, t: TableData) =>
  JSON.stringify([
    t,
    Math.round(anchor.x * 10),
    Math.round(anchor.y * 10),
    anchor.frameId,
    anchor.opacity,
  ]);

/** the locked elements that draw one table */
const buildParts = (
  anchor: ExcalidrawElement,
  layout: TableLayout,
  sig: string,
): ExcalidrawElement[] => {
  const ox = anchor.x;
  const oy = anchor.y;
  const id = (part: string) => `${anchor.id}:t:${part}`;
  const skeletons: any[] = [];

  const rect = (
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string,
  ) =>
    skeletons.push({
      type: "rectangle",
      id: id(part),
      x: ox + x,
      y: oy + y,
      width: w,
      height: h,
      strokeColor: "transparent",
      backgroundColor: fill,
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: null,
    });
  const line = (
    part: string,
    x: number,
    y: number,
    dx: number,
    dy: number,
    color: string,
  ) =>
    skeletons.push({
      type: "line",
      id: id(part),
      x: ox + x,
      y: oy + y,
      width: Math.abs(dx),
      height: Math.abs(dy),
      points: [
        [0, 0],
        [dx, dy],
      ],
      strokeColor: color,
      strokeWidth: 1,
      roughness: 0,
      roundness: null,
    });

  rect("header", 0, 0, layout.width, layout.headerHeight, HEADER_FILL);
  for (const c of layout.cells) {
    if (c.style.fill) {
      rect(
        `fill:${c.rowId}:${c.colId}`,
        c.x,
        c.y,
        c.width,
        c.height,
        c.style.fill,
      );
    }
  }

  // the grid: outer edge and the header's underline a shade darker
  line("h:top", 0, 0, layout.width, 0, EDGE);
  line("h:header", 0, layout.headerHeight, layout.width, 0, EDGE);
  layout.rows.forEach((r, i) => {
    const last = i === layout.rows.length - 1;
    line(
      `h:${r.row.id}`,
      0,
      r.y + r.height,
      layout.width,
      0,
      last ? EDGE : LINE,
    );
  });
  layout.columns.forEach((c, i) => {
    line(`v:${c.id}`, c.x, 0, 0, layout.height, i === 0 ? EDGE : LINE);
  });
  line("v:end", layout.width, 0, 0, layout.height, EDGE);

  const texts: {
    part: string;
    cell: typeof layout.cells[number];
    bold: boolean;
  }[] = [];
  for (const c of [...layout.header, ...layout.cells]) {
    if (!c.lines.length || !c.lines.join("").trim()) {
      continue;
    }
    const part = `${isHeader(c) ? "head" : "cell"}:${c.rowId}:${c.colId}`;
    texts.push({ part, cell: c, bold: !!c.style.bold || isHeader(c) });
    const text = {
      type: "text",
      x: ox + c.x + PAD_X,
      y: oy + c.y + PAD_Y,
      text: c.lines.join("\n"),
      fontSize: FONT_SIZE,
      fontFamily: FONT_FAMILY.Helvetica,
      lineHeight: LINE_HEIGHT,
      textAlign: c.align,
      strokeColor: c.shown.startsWith("#") && !isHeader(c) ? ERROR : INK,
      roughness: 0,
    };
    skeletons.push({ ...text, id: id(part) });
    // Excalidraw text has no bold; a second pass a hair to the right reads as one
    if (c.style.bold || isHeader(c)) {
      skeletons.push({ ...text, id: id(`${part}:b`) });
    }
  }

  const els = convertToExcalidrawElements(skeletons, { regenerateIds: false });
  const byId = new Map(texts.map((t) => [id(t.part), t]));
  const boldIds = new Map(
    texts.filter((t) => t.bold).map((t) => [id(`${t.part}:b`), t]),
  );

  return els.map((el) => {
    let x = el.x;
    const t = byId.get(el.id) ?? boldIds.get(el.id);
    if (t && el.type === "text") {
      // align the measured text inside its cell
      const { cell } = t;
      if (cell.align === "right") {
        x = ox + cell.x + cell.width - PAD_X - el.width;
      } else if (cell.align === "center") {
        x = ox + cell.x + (cell.width - el.width) / 2;
      }
      if (boldIds.has(el.id)) {
        x += 0.55;
      }
    }
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

/**
 * Bring every table's drawing in line with its data, and its anchor in line
 * with its layout. Cheap when nothing changed (a signature per table).
 */
export const syncTables = (
  api: ExcalidrawImperativeAPI,
  { moving = false }: { moving?: boolean } = {},
): boolean => {
  const all = api.getSceneElementsIncludingDeleted();
  if (moving) {
    return followDrag(api, all);
  }
  const byId = new Map(all.map((el) => [el.id, el]));
  const anchors = all.filter(isTableAnchor);
  const live = new Set(anchors.map((a) => a.id));

  const parts = new Map<string, ExcalidrawElement[]>();
  for (const el of all) {
    const info = partInfo(el);
    if (info && !el.isDeleted) {
      parts.set(info.anchorId, [...(parts.get(info.anchorId) ?? []), el]);
    }
  }

  const replace = new Map<string, ExcalidrawElement>();
  const add: ExcalidrawElement[] = [];
  const remove = (el: ExcalidrawElement) =>
    replace.set(el.id, newElementWith(el, { isDeleted: true }));

  for (const [anchorId, els] of parts) {
    if (!live.has(anchorId)) {
      els.forEach(remove);
    }
  }

  for (let anchor of anchors) {
    let data = tableOf(anchor)!;
    const laid = (anchor.customData as any)?.[LAID_KEY] as number | undefined;
    // the anchor was resized by hand: columns scale to the new width
    const scaled = !!laid && Math.abs(anchor.width - laid) > 0.5;
    if (scaled) {
      data = scaleColumns(data, anchor.width / laid!);
    }
    const layout = layoutTable(data, tableDisplay(data));
    if (
      scaled ||
      Math.abs(anchor.width - layout.width) > 0.5 ||
      Math.abs(anchor.height - layout.height) > 0.5 ||
      laid === undefined ||
      Math.abs(laid - layout.width) > 0.5
    ) {
      anchor = newElementWith(anchor, {
        width: layout.width,
        height: layout.height,
        customData: {
          ...anchor.customData,
          [TABLE_KEY]: data,
          [LAID_KEY]: layout.width,
        },
      });
      replace.set(anchor.id, anchor);
    }

    const existing = parts.get(anchor.id) ?? [];
    const sig = signature(anchor, data);
    if (existing.length && existing.every((el) => partInfo(el)?.sig === sig)) {
      continue;
    }
    const fresh = buildParts(anchor, layout, sig);
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

/**
 * While a table is being dragged, only carry its drawing along with it. The
 * anchor itself is the editor's to move; everything else waits for the drop.
 */
const followDrag = (
  api: ExcalidrawImperativeAPI,
  all: readonly ExcalidrawElement[],
): boolean => {
  const anchors = new Map(all.filter(isTableAnchor).map((a) => [a.id, a]));
  const moved = new Map<string, ExcalidrawElement>();
  for (const el of all) {
    const info = partInfo(el);
    const anchor = info && !el.isDeleted ? anchors.get(info.anchorId) : null;
    if (!info || !anchor) {
      continue;
    }
    const dx = anchor.x - info.ax;
    const dy = anchor.y - info.ay;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
      continue;
    }
    moved.set(
      el.id,
      newElementWith(el, {
        x: el.x + dx,
        y: el.y + dy,
        customData: {
          ...el.customData,
          [PART_KEY]: { ...info, ax: anchor.x, ay: anchor.y },
        },
      }),
    );
  }
  if (!moved.size) {
    return false;
  }
  api.updateScene({
    elements: all.map((el) => moved.get(el.id) ?? el),
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
};
