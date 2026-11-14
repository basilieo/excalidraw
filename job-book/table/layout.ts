// Where everything in a table goes: column edges, row heights, and each
// cell's text broken into lines that fit its column. Text wraps and the row
// grows to fit, as in Numbers, so nothing spills out of its cell. Numbers
// sit right, text sits left, unless a cell says otherwise.
//
// The canvas drawing (render.ts) and the click layer (TableLayer.tsx) both
// read this, so what you click is exactly where it is drawn.

import { formatCell } from "./format";
import { isChecked, isNumeric, lookOf, styleKey, viewRows } from "./model";

import type { Align, CellStyle, Column, Row, TableData } from "./model";

export const FONT_SIZE = 15;
/** Helvetica's line height in Excalidraw */
export const LINE_HEIGHT = 1.15;
export const LINE_PX = FONT_SIZE * LINE_HEIGHT;
export const PAD_X = 8;
export const PAD_Y = 8;
export const MIN_ROW_H = LINE_PX + PAD_Y * 2;

let ctx: CanvasRenderingContext2D | null = null;
let size = FONT_SIZE;
const measure = (text: string) => {
  if (!ctx) {
    ctx = document.createElement("canvas").getContext("2d");
  }
  ctx!.font = `${size}px Helvetica, Arial, sans-serif`;
  return ctx!.measureText(text).width;
};

/** a line cut to fit `max`, with an ellipsis */
const cut = (text: string, max: number) => {
  const one = text.replace(/\n/g, " ");
  if (measure(one) <= max) {
    return one;
  }
  let t = one;
  while (t.length > 1 && measure(`${t}…`) > max) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
};

/** the width a column needs to show its widest cell on one line */
export const fitWidth = (texts: string[], fontSize = FONT_SIZE) => {
  size = fontSize;
  return Math.ceil(
    Math.max(40, ...texts.flatMap((t) => t.split("\n")).map((l) => measure(l))) +
      PAD_X * 2 +
      2,
  );
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
  /** a checkbox column's cell: drawn as a box, ticked or not */
  checkbox?: boolean;
  checked?: boolean;
  /** where the text starts, down from the cell's top (vertical alignment) */
  textY: number;
  /** a header cell: the header row, or the header column */
  head?: boolean;
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
  fontSize: number;
  lineHeight: number;
};

const HEADER_KEY = "__header";

export const layoutTable = (
  t: TableData,
  display: (rowId: string, colId: string) => string,
): TableLayout => {
  const look = lookOf(t);
  size = look.fontSize;
  const linePx = look.fontSize * LINE_HEIGHT;
  const minRow = Math.max(linePx + PAD_Y * 2, look.rowHeight);
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
  ): CellLayout => {
    const isHead = rowId === HEADER_KEY;
    const headCol = !isHead && look.headerColumn && col.x === 0;
    const checkbox = !isHead && col.format === "checkbox";
    const text = isHead || checkbox ? (checkbox ? "" : shown) : formatCell(col, shown);
    const inner = col.width - PAD_X * 2;
    return {
      rowId,
      colId: col.id,
      x: col.x,
      y,
      width: col.width,
      height: 0,
      shown: text,
      lines: !text ? [] : style.wrap === false ? [cut(text, inner)] : wrap(text, inner),
      align: checkbox
        ? "center"
        : style.align ??
          (isNumeric(shown) || shown.startsWith("#") ? "right" : "left"),
      style: headCol ? { ...style, bold: true } : style,
      checkbox,
      checked: checkbox ? isChecked(shown) : undefined,
      textY: PAD_Y,
      head: isHead || headCol,
    };
  };
  /** the text placed in a cell of its final height */
  const place = (c: CellLayout) => {
    const h = c.lines.length * linePx;
    const v = c.style.valign ?? "top";
    c.textY =
      v === "middle"
        ? (c.height - h) / 2
        : v === "bottom"
        ? c.height - h - PAD_Y
        : PAD_Y;
  };

  // header row: the column names
  const header = columns.map((c) =>
    // bold unless the header cell says otherwise
    cellFor(HEADER_KEY, c, 0, c.name, {
      bold: true,
      align: "left",
      ...(t.styles[styleKey(HEADER_KEY, c.id)] ?? {}),
    }),
  );
  const headerHeight = Math.max(
    minRow,
    ...header.map((h) => h.lines.length * linePx + PAD_Y * 2),
  );
  header.forEach((h) => {
    h.height = headerHeight;
    place(h);
  });

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
      minRow,
      ...rowCells.map((c) => c.lines.length * linePx + PAD_Y * 2),
    );
    rowCells.forEach((c) => {
      c.height = height;
      place(c);
    });
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
    fontSize: look.fontSize,
    lineHeight: LINE_HEIGHT,
  };
};

export const isHeader = (c: CellLayout) => c.rowId === HEADER_KEY;
