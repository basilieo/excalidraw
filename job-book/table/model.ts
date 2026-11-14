// A table's data, as it is kept on the board.
//
// One element on the board (the table's "anchor", a white rectangle) carries
// the whole table in `customData.jbTable`: columns, rows, each cell's raw text
// (a formula is kept as typed, "=A1*B1"), cell styles, and the view (sort and
// filters, Airtable style: they change what is shown, not the stored order).
// Everything drawn on the canvas for it is generated from this (render.ts).

export type Align = "left" | "center" | "right";

/** how a column's cells read and are edited, as Numbers' cell formats */
export type ColumnFormat =
  | "auto"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "checkbox"
  | "select";

export const FORMATS: { format: ColumnFormat; label: string }[] = [
  { format: "auto", label: "Automatic" },
  { format: "number", label: "Number" },
  { format: "currency", label: "Currency" },
  { format: "percent", label: "Percentage" },
  { format: "date", label: "Date" },
  { format: "checkbox", label: "Checkbox" },
  { format: "select", label: "Pop-up menu" },
];

export type Column = {
  id: string;
  name: string;
  width: number;
  format?: ColumnFormat;
  /** the choices of a pop-up menu column */
  options?: string[];
};
export type Row = { id: string; cells: Record<string, string> };
export type CellStyle = {
  bold?: boolean;
  align?: Align;
  fill?: string;
  /** text color */
  color?: string;
};

export type FilterOp =
  | "contains"
  | "not-contains"
  | "="
  | "!="
  | ">"
  | "<"
  | "empty"
  | "not-empty";

export type Filter = { colId: string; op: FilterOp; value: string };
export type Sort = { colId: string; dir: "asc" | "desc" } | null;

export type TableData = {
  columns: Column[];
  rows: Row[];
  /** keyed `${rowId}:${colId}` */
  styles: Record<string, CellStyle>;
  sort: Sort;
  filters: Filter[];
};

export const TABLE_KEY = "jbTable";

export const DEFAULT_COL_WIDTH = 140;
export const MIN_COL_WIDTH = 40;

export const FILTER_OPS: {
  op: FilterOp;
  label: string;
  needsValue: boolean;
}[] = [
  { op: "contains", label: "contains", needsValue: true },
  { op: "not-contains", label: "does not contain", needsValue: true },
  { op: "=", label: "is", needsValue: true },
  { op: "!=", label: "is not", needsValue: true },
  { op: ">", label: ">", needsValue: true },
  { op: "<", label: "<", needsValue: true },
  { op: "empty", label: "is empty", needsValue: false },
  { op: "not-empty", label: "is not empty", needsValue: false },
];

export const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
    .replace(/-/g, "")
    .slice(0, 12);

/** A, B, ... Z, AA, AB ... */
export const columnLetter = (index: number) => {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export const newTable = (rows: number, cols: number): TableData => {
  const columns: Column[] = Array.from({ length: cols }, (_, i) => ({
    id: newId(),
    name: `Column ${i + 1}`,
    width: DEFAULT_COL_WIDTH,
  }));
  return {
    columns,
    rows: Array.from({ length: rows }, () => ({ id: newId(), cells: {} })),
    styles: {},
    sort: null,
    filters: [],
  };
};

/** a table from column names (and widths) and rows of cell text */
export const tableFrom = (
  columns: (string | { name: string; width?: number })[],
  rows: string[][] = [],
): TableData => {
  const cols: Column[] = columns.map((c) => {
    const { name, width } =
      typeof c === "string" ? { name: c, width: undefined } : c;
    return { id: newId(), name, width: width ?? DEFAULT_COL_WIDTH };
  });
  return {
    columns: cols,
    rows: rows.map((r) => ({
      id: newId(),
      cells: Object.fromEntries(
        r.map((v, i) => [cols[i]?.id, v]).filter(([id, v]) => id && v),
      ),
    })),
    styles: {},
    sort: null,
    filters: [],
  };
};

export const readTable = (raw: unknown): TableData | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const t = raw as Partial<TableData>;
  if (!Array.isArray(t.columns) || !Array.isArray(t.rows)) {
    return null;
  }
  return {
    columns: t.columns,
    rows: t.rows,
    styles: t.styles ?? {},
    sort: t.sort ?? null,
    filters: t.filters ?? [],
  };
};

export const styleKey = (rowId: string, colId: string) => `${rowId}:${colId}`;

// ---------------------------------------------------------------------------
// editing (each returns a new table; nothing is changed in place)

export const setCell = (
  t: TableData,
  rowId: string,
  colId: string,
  value: string,
): TableData => ({
  ...t,
  rows: t.rows.map((r) =>
    r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
  ),
});

export const setStyle = (
  t: TableData,
  rowId: string,
  colId: string,
  patch: CellStyle,
): TableData => {
  const key = styleKey(rowId, colId);
  return {
    ...t,
    styles: { ...t.styles, [key]: { ...t.styles[key], ...patch } },
  };
};

export const renameColumn = (t: TableData, colId: string, name: string) => ({
  ...t,
  columns: t.columns.map((c) => (c.id === colId ? { ...c, name } : c)),
});

export const addRow = (t: TableData, afterRowId?: string): TableData => {
  const row = { id: newId(), cells: {} };
  if (!afterRowId) {
    return { ...t, rows: [...t.rows, row] };
  }
  const i = t.rows.findIndex((r) => r.id === afterRowId);
  const rows = [...t.rows];
  rows.splice(i + 1, 0, row);
  return { ...t, rows };
};

export const deleteRow = (t: TableData, rowId: string): TableData =>
  t.rows.length <= 1 ? t : { ...t, rows: t.rows.filter((r) => r.id !== rowId) };

/** a new column after `afterColId`; at the start for null; at the end if left out */
export const addColumn = (
  t: TableData,
  afterColId?: string | null,
): TableData => {
  const col = {
    id: newId(),
    name: `Column ${t.columns.length + 1}`,
    width: DEFAULT_COL_WIDTH,
  };
  const columns = [...t.columns];
  const i =
    afterColId === null
      ? 0
      : afterColId
      ? columns.findIndex((c) => c.id === afterColId) + 1
      : columns.length;
  columns.splice(i, 0, col);
  return { ...t, columns };
};

export const deleteColumn = (t: TableData, colId: string): TableData =>
  t.columns.length <= 1
    ? t
    : {
        ...t,
        columns: t.columns.filter((c) => c.id !== colId),
        sort: t.sort?.colId === colId ? null : t.sort,
        filters: t.filters.filter((f) => f.colId !== colId),
      };

export const setColumnWidth = (t: TableData, colId: string, width: number) => ({
  ...t,
  columns: t.columns.map((c) =>
    c.id === colId ? { ...c, width: Math.max(MIN_COL_WIDTH, width) } : c,
  ),
});

/** every column scaled by the same factor (the table was resized) */
export const scaleColumns = (t: TableData, factor: number): TableData => ({
  ...t,
  columns: t.columns.map((c) => ({
    ...c,
    width: Math.max(MIN_COL_WIDTH, c.width * factor),
  })),
});

// ---------------------------------------------------------------------------
// the view: which rows show, in what order

const asNumber = (s: string) => {
  const t = s.replace(/[$,\s]/g, "");
  return t !== "" && !isNaN(Number(t)) ? Number(t) : null;
};

const matches = (shown: string, f: Filter) => {
  const v = shown.trim();
  const target = f.value.trim();
  const a = asNumber(v);
  const b = asNumber(target);
  switch (f.op) {
    case "contains":
      return v.toLowerCase().includes(target.toLowerCase());
    case "not-contains":
      return !v.toLowerCase().includes(target.toLowerCase());
    case "=":
      return a !== null && b !== null
        ? a === b
        : v.toLowerCase() === target.toLowerCase();
    case "!=":
      return a !== null && b !== null
        ? a !== b
        : v.toLowerCase() !== target.toLowerCase();
    // against a number, only numbers compare; text cells don't match
    case ">":
      return b !== null ? a !== null && a > b : v.localeCompare(target) > 0;
    case "<":
      return b !== null ? a !== null && a < b : v.localeCompare(target) < 0;
    case "empty":
      return v === "";
    case "not-empty":
      return v !== "";
  }
};

/**
 * The rows to show, filtered and sorted, judged on what each cell shows (a
 * formula by its result). `display(rowId, colId)` gives that.
 */
export const viewRows = (
  t: TableData,
  display: (rowId: string, colId: string) => string,
): Row[] => {
  let rows = t.rows.filter((r) =>
    t.filters.every(
      (f) =>
        !t.columns.some((c) => c.id === f.colId) ||
        matches(display(r.id, f.colId), f),
    ),
  );
  if (t.sort && t.columns.some((c) => c.id === t.sort!.colId)) {
    const { colId, dir } = t.sort;
    const sign = dir === "asc" ? 1 : -1;
    rows = [...rows].sort((x, y) => {
      const a = display(x.id, colId);
      const b = display(y.id, colId);
      // empty cells last either way, as Airtable does
      if (!a || !b) {
        return a ? -1 : b ? 1 : 0;
      }
      const na = asNumber(a);
      const nb = asNumber(b);
      // numbers before text either way; each compared as what it is
      if ((na === null) !== (nb === null)) {
        return na !== null ? -1 : 1;
      }
      const c =
        na !== null && nb !== null
          ? na - nb
          : a.localeCompare(b, undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return c * sign;
    });
  }
  return rows;
};

export const isNumeric = (s: string) => asNumber(s) !== null;

export const setColumn = (
  t: TableData,
  colId: string,
  patch: Partial<Column>,
): TableData => ({
  ...t,
  columns: t.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
});

/** the same style change on many cells */
export const setStyles = (
  t: TableData,
  cells: { rowId: string; colId: string }[],
  patch: CellStyle,
): TableData => {
  const styles = { ...t.styles };
  for (const { rowId, colId } of cells) {
    const key = styleKey(rowId, colId);
    styles[key] = { ...styles[key], ...patch };
  }
  return { ...t, styles };
};

/** the same value in many cells (empty clears them) */
export const setCells = (
  t: TableData,
  cells: { rowId: string; colId: string; value: string }[],
): TableData => {
  const byRow = new Map<string, Record<string, string>>();
  for (const { rowId, colId, value } of cells) {
    byRow.set(rowId, { ...(byRow.get(rowId) ?? {}), [colId]: value });
  }
  return {
    ...t,
    rows: t.rows.map((r) =>
      byRow.has(r.id) ? { ...r, cells: { ...r.cells, ...byRow.get(r.id) } } : r,
    ),
  };
};

export const deleteRows = (t: TableData, rowIds: string[]): TableData => {
  const rows = t.rows.filter((r) => !rowIds.includes(r.id));
  return rows.length ? { ...t, rows } : t;
};

/** a new row above `beforeRowId` */
export const addRowBefore = (t: TableData, beforeRowId: string): TableData => {
  const i = t.rows.findIndex((r) => r.id === beforeRowId);
  const rows = [...t.rows];
  rows.splice(Math.max(i, 0), 0, { id: newId(), cells: {} });
  return { ...t, rows };
};

export const isChecked = (v: string) =>
  /^(true|yes|y|1|x|✓|☑|checked)$/i.test(v.trim());
