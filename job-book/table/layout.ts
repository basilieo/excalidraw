// Where everything in a table goes: column edges, row heights, and each
// cell's text broken into lines that fit its column. Text wraps and the row
// grows to fit, as in Numbers, so nothing spills out of its cell. Numbers
// sit right, text sits left, unless a cell says otherwise.
//
// The canvas drawing (render.ts) and the click layer (TableLayer.tsx) both
// read this, so what you click is exactly where it is drawn.

import { isNumeric, styleKey, viewRows } from "./model";

import type { Align, CellStyle, Column, Row, TableData } from "./model";

export const FONT_SIZE = 15;
/** Helvetica's line height in Excalidraw */
export const LINE_HEIGHT = 1.15;
export const LINE_PX = FONT_SIZE * LINE_HEIGHT;
export const PAD_X = 8;
export const PAD_Y = 8;
export const MIN_ROW_H = LINE_PX + PAD_Y * 2;

let ctx: CanvasRenderingContext2D | null = null;
const measure = (text: string) => {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
    ctx!.font = `${FONT_SIZE}px Helvetica, Arial, sans-serif`;
  }
  return ctx!.measureText(text).width;
};

/** text broken into lines no wider than `max`, at spaces where it can */
export const wrap = (text: string, max: number): string[] => {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (measure(next) <= max || !line.trim()) {
        line = next;
        // a single word wider than the column breaks by letter
        while (measure(line) > max && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && measure(line.slice(0, cut)) > max) {
            cut--;
          }
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
};

export type CellLayout = {
  rowId: string;
  colId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shown: string;
  lines: string[];
  align: Align;
  style: CellStyle;
};

export type TableLayout = {
  width: number;
  height: number;
  headerHeight: number;
  columns: (Column & { x: number })[];
  rows: { row: Row; y: number; height: number }[];
  header: CellLayout[];
  cells: CellLayout[];
  /** rows the view hides (filters), for "3 of 10 rows" */
  hidden: number;
};

const HEADER_KEY = "__header";

export const layoutTable = (
  t: TableData,
  display: (rowId: string, colId: string) => string,
): TableLayout => {
  let x = 0;
  const columns = t.columns.map((c) => {
    const col = { ...c, x };
    x += c.width;
    return col;
  });
  const width = x;

  const cellFor = (
    rowId: string,
    col: Column & { x: number },
    y: number,
    shown: string,
    style: CellStyle,
  ): CellLayout => ({
    rowId,
    colId: col.id,
    x: col.x,
    y,
    width: col.width,
    height: 0,
    shown,
    lines: shown ? wrap(shown, col.width - PAD_X * 2) : [],
    align:
      style.align ??
      (isNumeric(shown) || shown.startsWith("#") ? "right" : "left"),
    style,
  });

  // header row: the column names
  const header = columns.map((c) =>
    cellFor(HEADER_KEY, c, 0, c.name, { bold: true, align: "left" }),
  );
  const headerHeight = Math.max(
    MIN_ROW_H,
    ...header.map((h) => h.lines.length * LINE_PX + PAD_Y * 2),
  );
  header.forEach((h) => (h.height = headerHeight));

  // the rows the view shows, each as tall as its tallest cell
  const shownRows = viewRows(t, display);
  let y = headerHeight;
  const rows: TableLayout["rows"] = [];
  const cells: CellLayout[] = [];
  for (const row of shownRows) {
    const rowCells = columns.map((c) =>
      cellFor(
        row.id,
        c,
        y,
        display(row.id, c.id),
        t.styles[styleKey(row.id, c.id)] ?? {},
      ),
    );
    const height = Math.max(
      MIN_ROW_H,
      ...rowCells.map((c) => c.lines.length * LINE_PX + PAD_Y * 2),
    );
    rowCells.forEach((c) => (c.height = height));
    rows.push({ row, y, height });
    cells.push(...rowCells);
    y += height;
  }

  return {
    width,
    height: y,
    headerHeight,
    columns,
    rows,
    header,
    cells,
    hidden: t.rows.length - shownRows.length,
  };
};

export const isHeader = (c: CellLayout) => c.rowId === HEADER_KEY;
