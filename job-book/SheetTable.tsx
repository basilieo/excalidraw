// The sheet index as a table: every sheet a row, its title block data in
// columns, edited like a spreadsheet.
//
// Click a cell; shift-click or drag to select a block; arrows move and
// shift-arrows extend. Type (or Enter) to edit, and what you commit goes into
// every selected cell of the block, so ten sheets go to "Issued" or "Rev 2"
// at once. Paste a column or block from a spreadsheet; copy one out. ⌘D fills
// the top row of the selection down; Delete clears. Each change is one undo.

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { formatSize, matchPaper, paperPx, PAPERS } from "./paper";
import { useSettings } from "./settings";
import {
  getGroups,
  disciplineOf,
  goToSheet,
  sheetColor,
  sortSheets,
  STATUSES,
  statusOf,
  updateSheets,
} from "./sheets";
import { useSheets } from "./useSheets";

import type { Orientation, Units } from "./paper";
import type { Sheet, SheetData } from "./sheets";

type Change = {
  patch?: Partial<SheetData>;
  title?: string;
  size?: { width: number; height: number };
};

type Col = {
  key: string;
  label: string;
  width: number;
  kind: "text" | "date" | "select";
  options?: { value: string; label: string }[];
  /** what the cell shows */
  show: (s: Sheet, units: Units) => string;
  /** what editing starts from, and what copying gives */
  raw: (s: Sheet) => string;
  /** a value typed or pasted into this cell, as a change; null if it can't be */
  parse: (v: string, s: Sheet) => Change | null;
};

const yes = (v: string) => /^(y|yes|true|1|x|✓|on)$/i.test(v.trim());
const no = (v: string) => /^(n|no|false|0|off|)$/i.test(v.trim());
const bool = (v: string) => (yes(v) ? true : no(v) ? false : null);

const orientationOf = (s: Sheet): Orientation =>
  s.frame.width >= s.frame.height ? "landscape" : "portrait";

const pick = <T extends { code: string; name: string }>(
  list: T[],
  v: string,
) => {
  const t = v.trim().toLowerCase();
  return list.find(
    (x) =>
      x.code.toLowerCase() === t ||
      x.name.toLowerCase() === t ||
      `${x.code} · ${x.name}`.toLowerCase() === t,
  );
};

const COLUMNS: Col[] = [
  {
    key: "number",
    label: "Page",
    width: 60,
    kind: "text",
    show: (s) => s.data.number,
    raw: (s) => s.data.number,
    // pages are numbered for you, from each sheet's place in the set
    parse: () => null,
  },
  {
    key: "title",
    label: "Title",
    width: 240,
    kind: "text",
    show: (s) => s.frame.name ?? "",
    raw: (s) => s.frame.name ?? "",
    parse: (v) => ({ title: v }),
  },
  {
    key: "discipline",
    label: "Phase",
    width: 140,
    kind: "select",
    get options() {
      return getGroups().map((d) => ({
        value: d.code,
        label: `${d.code} · ${d.name}`,
      }));
    },
    show: (s) => disciplineOf(s.data.discipline).name,
    raw: (s) => s.data.discipline,
    parse: (v) => {
      const d = pick(getGroups(), v);
      return d ? { patch: { discipline: d.code } } : null;
    },
  },
  {
    key: "status",
    label: "Status",
    width: 110,
    kind: "select",
    options: STATUSES.map((s) => ({ value: s.code, label: s.name })),
    show: (s) => statusOf(s.data.status).name,
    raw: (s) => s.data.status,
    parse: (v) => {
      const st = pick(STATUSES, v);
      return st ? { patch: { status: st.code } } : null;
    },
  },
  {
    key: "revision",
    label: "Rev",
    width: 56,
    kind: "text",
    show: (s) => s.data.revision,
    raw: (s) => s.data.revision,
    parse: (v) => ({ patch: { revision: v.trim() } }),
  },
  {
    key: "issued",
    label: "Issued",
    width: 130,
    kind: "date",
    show: (s) => s.data.issued,
    raw: (s) => s.data.issued,
    parse: (v) => {
      const t = v.trim();
      return t === "" || /^\d{4}-\d{2}-\d{2}$/.test(t)
        ? { patch: { issued: t } }
        : null;
    },
  },
  {
    key: "paper",
    label: "Paper",
    width: 150,
    kind: "select",
    options: PAPERS.map((p) => ({ value: p.id, label: p.name })),
    show: (s, units) =>
      matchPaper(s.frame.width, s.frame.height)?.paper.name ??
      formatSize(s.frame.width, s.frame.height, units),
    raw: (s) => matchPaper(s.frame.width, s.frame.height)?.paper.id ?? "",
    parse: (v, s) => {
      if (s.data.sizeLocked) {
        return null;
      }
      const t = v.trim().toLowerCase();
      const p = PAPERS.find((x) => x.id === t || x.name.toLowerCase() === t);
      return p ? { size: paperPx(p.id, orientationOf(s)) } : null;
    },
  },
  {
    key: "orientation",
    label: "Orientation",
    width: 100,
    kind: "select",
    options: [
      { value: "landscape", label: "landscape" },
      { value: "portrait", label: "portrait" },
    ],
    show: (s) => orientationOf(s),
    raw: (s) => orientationOf(s),
    parse: (v, s) => {
      const t = v.trim().toLowerCase();
      if (s.data.sizeLocked || (t !== "landscape" && t !== "portrait")) {
        return null;
      }
      if (t === orientationOf(s)) {
        return {};
      }
      return { size: { width: s.frame.height, height: s.frame.width } };
    },
  },
  {
    key: "titleBlock",
    label: "Title block",
    width: 90,
    kind: "select",
    options: [
      { value: "yes", label: "yes" },
      { value: "no", label: "no" },
    ],
    show: (s) => (s.data.titleBlock ? "yes" : "no"),
    raw: (s) => (s.data.titleBlock ? "yes" : "no"),
    parse: (v) => {
      const b = bool(v);
      return b === null ? null : { patch: { titleBlock: b } };
    },
  },
  {
    key: "sizeLocked",
    label: "Size lock",
    width: 80,
    kind: "select",
    options: [
      { value: "yes", label: "yes" },
      { value: "no", label: "no" },
    ],
    show: (s) => (s.data.sizeLocked ? "🔒" : ""),
    raw: (s) => (s.data.sizeLocked ? "yes" : "no"),
    parse: (v) => {
      const b = bool(v);
      return b === null ? null : { patch: { sizeLocked: b } };
    },
  },
];

/** whether the sheet index shows as a table; held above the side panel so
 * the table stays open when the panel closes */
export const SheetTableViewContext = createContext<{
  tableView: boolean;
  setTableView: (on: boolean) => void;
}>({ tableView: false, setTableView: () => {} });
export const useSheetTableView = () => useContext(SheetTableViewContext);

type Pos = { r: number; c: number };
type Sel = { anchor: Pos; focus: Pos };

const rectOf = (sel: Sel) => ({
  r0: Math.min(sel.anchor.r, sel.focus.r),
  r1: Math.max(sel.anchor.r, sel.focus.r),
  c0: Math.min(sel.anchor.c, sel.focus.c),
  c1: Math.max(sel.anchor.c, sel.focus.c),
});

const merge = (a: Change | undefined, b: Change): Change => ({
  ...a,
  ...b,
  patch: { ...a?.patch, ...b.patch },
});

export const SheetTable = ({ onClose }: { onClose: () => void }) => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const { sheets: unsorted } = useSheets();
  const sheets = useMemo(() => sortSheets(unsorted), [unsorted]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [editing, setEditing] = useState<{ pos: Pos; value: string } | null>(
    null,
  );
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);
  const [skipped, setSkipped] = useState(0);

  useEffect(() => {
    box.current?.focus();
    const up = () => (dragging.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  if (!api) {
    return null;
  }
  const theme = api.getAppState().theme;
  const last = { r: sheets.length - 1, c: COLUMNS.length - 1 };
  const clamp = (p: Pos): Pos => ({
    r: Math.min(Math.max(p.r, 0), last.r),
    c: Math.min(Math.max(p.c, 0), last.c),
  });
  const rect = sel ? rectOf(sel) : null;
  const inSel = (r: number, c: number) =>
    !!rect && r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;

  /** apply values to cells; one undo step; cells that can't take it are skipped */
  const apply = (cells: { r: number; c: number; v: string }[]) => {
    const changes = new Map<string, Change>();
    let refused = 0;
    for (const { r, c, v } of cells) {
      const sheet = sheets[r];
      const col = COLUMNS[c];
      if (!sheet || !col) {
        continue;
      }
      const change = col.parse(v, sheet);
      if (!change) {
        refused++;
        continue;
      }
      changes.set(sheet.frame.id, merge(changes.get(sheet.frame.id), change));
    }
    setSkipped(refused);
    if (changes.size) {
      updateSheets(api, changes, settings.colorBy);
    }
  };

  const fillSelection = (v: string) => {
    if (!rect) {
      return;
    }
    const cells = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      for (let c = rect.c0; c <= rect.c1; c++) {
        cells.push({ r, c, v });
      }
    }
    apply(cells);
  };

  const commit = (value: string) => {
    setEditing(null);
    fillSelection(value);
    box.current?.focus();
  };

  const startEdit = (seed?: string) => {
    if (!sel) {
      return;
    }
    const pos = sel.focus;
    setEditing({
      pos,
      value: seed ?? COLUMNS[pos.c].raw(sheets[pos.r]),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // undo and redo are the board's, and undo a bulk change in one step
    if (
      (e.metaKey || e.ctrlKey) &&
      ["z", "y"].includes(e.key.toLowerCase()) &&
      !editing
    ) {
      return;
    }
    // nothing else typed here reaches the board's shortcuts
    e.stopPropagation();
    if (editing) {
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (sel) {
        setSel(null);
      } else {
        onClose();
      }
      return;
    }
    if (!sel) {
      if (e.key.startsWith("Arrow") && sheets.length) {
        setSel({ anchor: { r: 0, c: 0 }, focus: { r: 0, c: 0 } });
        e.preventDefault();
      }
      return;
    }
    const moves: Record<string, Pos> = {
      ArrowUp: { r: -1, c: 0 },
      ArrowDown: { r: 1, c: 0 },
      ArrowLeft: { r: 0, c: -1 },
      ArrowRight: { r: 0, c: 1 },
      Tab: { r: 0, c: e.shiftKey ? -1 : 1 },
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      const focus = clamp({ r: sel.focus.r + m.r, c: sel.focus.c + m.c });
      setSel(
        e.shiftKey && e.key !== "Tab"
          ? { ...sel, focus }
          : { anchor: focus, focus },
      );
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      // fill down: the top row of the selection into the rows under it
      e.preventDefault();
      if (rect) {
        const cells = [];
        for (let c = rect.c0; c <= rect.c1; c++) {
          const v = COLUMNS[c].raw(sheets[rect.r0]);
          for (let r = rect.r0 + 1; r <= rect.r1; r++) {
            cells.push({ r, c, v });
          }
        }
        apply(cells);
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSel({ anchor: { r: 0, c: 0 }, focus: last });
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return; // copy, paste and undo come as their own events
    }
    if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      startEdit();
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      fillSelection("");
    } else if (e.key.length === 1) {
      e.preventDefault();
      startEdit(e.key);
    }
  };

  const onCopy = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    if (!rect || editing) {
      return;
    }
    e.preventDefault();
    const lines = [];
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = [];
      for (let c = rect.c0; c <= rect.c1; c++) {
        row.push(COLUMNS[c].raw(sheets[r]));
      }
      lines.push(row.join("\t"));
    }
    e.clipboardData.setData("text/plain", lines.join("\n"));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    if (!rect || editing) {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r/g, "");
    const grid = text
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.split("\t"));
    if (grid.length === 1 && grid[0].length === 1) {
      // one value pasted over a block fills the block
      fillSelection(grid[0][0]);
      return;
    }
    const cells = [];
    for (let i = 0; i < grid.length; i++) {
      for (let j = 0; j < grid[i].length; j++) {
        const r = rect.r0 + i;
        const c = rect.c0 + j;
        if (r <= last.r && c <= last.c) {
          cells.push({ r, c, v: grid[i][j] });
        }
      }
    }
    apply(cells);
    setSel({
      anchor: { r: rect.r0, c: rect.c0 },
      focus: clamp({
        r: rect.r0 + grid.length - 1,
        c: rect.c0 + grid[0].length - 1,
      }),
    });
  };

  const selCount = rect ? (rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1) : 0;

  return createPortal(
    <div
      className={`jb-sheet-table-wrap${theme === "dark" ? " is-dark" : ""}`}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={box}
        className="jb-sheet-table"
        style={{
          right:
            (document.querySelector(".jb-sidebar")?.getBoundingClientRect()
              .width ?? 0) + 24,
        }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        data-ref="sheet-table"
      >
        <div className="jb-st-head">
          <b title="Select cells (click, shift-click, drag) and type, pick or paste to change them all. ⌘D fills down.">
            Sheets
          </b>
          <span className="jb-st-note">
            {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
            {selCount > 1 ? ` · ${selCount} cells selected` : ""}
            {skipped > 0
              ? ` · ${skipped} cell${
                  skipped === 1 ? "" : "s"
                } couldn't take that value`
              : ""}
          </span>
          <button type="button" className="jb-st-close" onClick={onClose}>
            List view
          </button>
        </div>
        <div className="jb-st-scroll">
          <table>
            <thead>
              <tr>
                <th className="jb-st-gutter" />
                {COLUMNS.map((col, c) => (
                  <th
                    key={col.key}
                    style={{ width: col.width, minWidth: col.width }}
                    onPointerDown={(e) => {
                      // a header selects its whole column
                      e.preventDefault();
                      if (sheets.length) {
                        setSel({
                          anchor: { r: 0, c },
                          focus: { r: last.r, c },
                        });
                      }
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheets.map((sheet, r) => (
                <tr key={sheet.frame.id}>
                  <td className="jb-st-gutter">
                    <span
                      className="jb-chip"
                      style={{
                        background: sheetColor(sheet.data, settings.colorBy),
                      }}
                    />
                    <button
                      type="button"
                      title="Go to this sheet"
                      onClick={() => {
                        onClose();
                        goToSheet(api, sheet.frame.id);
                      }}
                    >
                      →
                    </button>
                  </td>
                  {COLUMNS.map((col, c) => {
                    const isEditing =
                      editing && editing.pos.r === r && editing.pos.c === c;
                    const isFocus =
                      sel && sel.focus.r === r && sel.focus.c === c;
                    return (
                      <td
                        key={col.key}
                        className={`${inSel(r, c) ? "is-sel" : ""}${
                          isFocus ? " is-focus" : ""
                        }${
                          col.key === "paper" || col.key === "orientation"
                            ? sheet.data.sizeLocked
                              ? " is-locked"
                              : ""
                            : ""
                        }`}
                        onPointerDown={(e) => {
                          if (e.button !== 0 || isEditing) {
                            return;
                          }
                          e.preventDefault();
                          box.current?.focus();
                          dragging.current = true;
                          setEditing(null);
                          setSel((s) =>
                            e.shiftKey && s
                              ? { ...s, focus: { r, c } }
                              : { anchor: { r, c }, focus: { r, c } },
                          );
                        }}
                        onPointerEnter={() => {
                          if (dragging.current) {
                            setSel((s) => (s ? { ...s, focus: { r, c } } : s));
                          }
                        }}
                        onDoubleClick={() => startEdit()}
                      >
                        {isEditing ? (
                          <CellInput
                            col={col}
                            value={editing!.value}
                            onCommit={commit}
                            onCancel={() => {
                              setEditing(null);
                              box.current?.focus();
                            }}
                          />
                        ) : (
                          <span
                            className="jb-st-value"
                            style={
                              col.key === "status"
                                ? { color: statusOf(sheet.data.status).color }
                                : undefined
                            }
                          >
                            {col.show(sheet, settings.units)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!sheets.length && <p className="jb-st-empty">No sheets yet.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** the editor inside a cell: a text box, a date, or a pick list */
const CellInput = ({
  col,
  value,
  onCommit,
  onCancel,
}: {
  col: Col;
  value: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const finish = (v: string) => {
    if (!done.current) {
      done.current = true;
      onCommit(v);
    }
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(draft);
    } else if (e.key === "Escape") {
      e.preventDefault();
      done.current = true;
      onCancel();
    }
  };
  if (col.kind === "select") {
    return (
      <select
        autoFocus
        value={draft}
        onChange={(e) => finish(e.target.value)}
        onBlur={() => finish(draft)}
        onKeyDown={keys}
      >
        {!col.options!.some((o) => o.value === draft) && (
          <option value={draft}>{draft}</option>
        )}
        {col.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      type={col.kind === "date" ? "date" : "text"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={keys}
    />
  );
};
