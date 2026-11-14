// How you work in a table, the way Numbers does it.
//
// Every table on screen gets a transparent layer over its drawing, laid out
// in screen pixels (not scaled), so the cell editor's text is as sharp as
// the rest of the page. Click a cell to select it; drag or shift-click to
// select a range; double-click, Enter or just typing edits it. A checkbox
// cell toggles on click. Click the dot at the table's top left and the whole
// table is selected: move it, size it (the columns scale). The format panel
// on the left (FormatPanel) does the rest: rows and columns, the grid,
// formats, text, fills, sort and filter.
//
// The wheel and the middle button pass through to the board, so zooming and
// panning work the same over a table as anywhere else.

import {
  CaptureUpdateAction,
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { FormatPanel } from "./FormatPanel";
import { cellName, tableDisplay } from "./formula";
import { isHeader, LINE_HEIGHT, PAD_X, PAD_Y } from "./layout";
import {
  addColumn,
  addRow,
  columnLetter,
  isChecked,
  renameColumn,
  setCell,
  setCells,
  setColumnWidth,
  setStyles,
} from "./model";
import { describeTable, isTableAnchor, updateTable } from "./render";

import type { Selection } from "./FormatPanel";
import type { TableLayout } from "./layout";
import type { Column, TableData } from "./model";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const HEADER = "__header";

type Cell = { r: string; c: string };
type Sel = {
  anchorId: string;
  /** where the selection started */
  a: Cell;
  /** where it ends, and the cell that is edited */
  f: Cell;
  editing: boolean;
  /** what typing started the edit with */
  seed?: string;
} | null;

const canvasEl = () =>
  document.querySelector<HTMLCanvasElement>(".excalidraw__canvas.interactive");

/** the wheel over a table zooms and pans the board, as anywhere else */
const passWheel = (e: React.WheelEvent) => {
  canvasEl()?.dispatchEvent(
    new WheelEvent("wheel", {
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      clientX: e.clientX,
      clientY: e.clientY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      buttons: e.buttons,
      bubbles: true,
      cancelable: true,
    }),
  );
};

/** the middle button goes to the board, so it pans over a table too */
const passPointer = (e: React.PointerEvent) => {
  e.preventDefault();
  canvasEl()?.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: e.clientX,
      clientY: e.clientY,
      button: e.button,
      buttons: e.buttons,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
    }),
  );
};

const rawOf = (t: TableData, r: string, c: string) =>
  r === HEADER
    ? t.columns.find((x) => x.id === c)?.name ?? ""
    : t.rows.find((x) => x.id === r)?.cells[c] ?? "";

const PlusIcon = (
  <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
    <path
      d="M6 1.5v9M1.5 6h9"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

// ---------------------------------------------------------------------------

export const TableLayer = ({ canEdit }: { canEdit: boolean }) => {
  const api = useExcalidrawAPI();
  const [, setTick] = useState(0);
  const [sel, setSel] = useState<Sel>(null);

  // re-render when a table, the view or the table selection changes; not on
  // every pointer move
  useEffect(() => {
    if (!api) {
      return;
    }
    let last = "";
    const check = () => {
      const s = api.getAppState();
      const anchors = api.getSceneElements().filter(isTableAnchor);
      const key = [
        anchors.map((a) => `${a.id}.${a.version}`).join(","),
        s.scrollX,
        s.scrollY,
        s.zoom.value,
        s.width,
        s.height,
        s.offsetLeft,
        s.offsetTop,
        s.theme,
        s.selectedElementsAreBeingDragged,
        s.isResizing,
        Object.keys(s.selectedElementIds).join(),
      ].join("|");
      if (key !== last) {
        last = key;
        setTick((n) => n + 1);
      }
    };
    const off1 = api.onChange(check);
    const off2 = api.onScrollChange(check);
    // a click anywhere on the board leaves the table
    const off3 = api.onPointerDown(() => setSel(null));
    return () => {
      off1();
      off2();
      off3();
    };
  }, [api]);

  // Excalidraw's own shape panel (stroke, edges, opacity) means nothing for
  // a table; the table's format panel takes its place
  const appState = api?.getAppState();
  const anchors = api ? api.getSceneElements().filter(isTableAnchor) : [];
  const selectedAnchor = appState
    ? anchors.find(
        (a) =>
          appState.selectedElementIds[a.id] &&
          Object.keys(appState.selectedElementIds).length === 1,
      )
    : undefined;
  const panelFor =
    (sel && anchors.find((a) => a.id === sel.anchorId)) || selectedAnchor;
  const hideShapePanel = !!selectedAnchor;
  useEffect(() => {
    document.body.classList.toggle("jb-table-format", hideShapePanel);
    return () => document.body.classList.remove("jb-table-format");
  }, [hideShapePanel]);

  if (!api || !appState || !canEdit) {
    return null;
  }

  return (
    <div className={`jb-tables${appState.theme === "dark" ? " is-dark" : ""}`}>
      {anchors.map((anchor) => (
        <TableOverlay
          key={anchor.id}
          api={api}
          anchor={anchor}
          appState={appState}
          sel={sel?.anchorId === anchor.id ? sel : null}
          setSel={setSel}
          showPanel={panelFor?.id === anchor.id}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------

type Grid = {
  rows: string[];
  cols: string[];
  layout: TableLayout;
};

const indexOf = (g: Grid, cell: Cell) => ({
  ri: g.rows.indexOf(cell.r),
  ci: g.cols.indexOf(cell.c),
});

const range = (g: Grid, sel: NonNullable<Sel>) => {
  const a = indexOf(g, sel.a);
  const f = indexOf(g, sel.f);
  if (a.ri < 0 || a.ci < 0 || f.ri < 0 || f.ci < 0) {
    return null;
  }
  return {
    r0: Math.min(a.ri, f.ri),
    r1: Math.max(a.ri, f.ri),
    c0: Math.min(a.ci, f.ci),
    c1: Math.max(a.ci, f.ci),
  };
};

const TableOverlay = ({
  api,
  anchor,
  appState,
  sel,
  setSel,
  showPanel,
}: {
  api: ExcalidrawImperativeAPI;
  anchor: ExcalidrawElement;
  appState: AppState;
  sel: Sel;
  setSel: React.Dispatch<React.SetStateAction<Sel>>;
  showPanel: boolean;
}) => {
  const described = useMemo(
    () => describeTable(anchor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anchor.version],
  );
  const [resizing, setResizing] = useState<{
    colId: string;
    startX: number;
    startW: number;
    w: number;
  } | null>(null);
  const dragging = useRef(false);

  const update = useCallback(
    (change: (t: TableData) => TableData) =>
      updateTable(api, anchor.id, change),
    [api, anchor.id],
  );

  const data = described?.data;
  const layout = described?.layout;
  const grid: Grid | null = useMemo(
    () =>
      layout
        ? {
            layout,
            rows: [HEADER, ...layout.rows.map((r) => r.row.id)],
            cols: layout.columns.map((c) => c.id),
          }
        : null,
    [layout],
  );
  const rng = sel && grid ? range(grid, sel) : null;

  // the selection's cells, for the format panel
  const selection: Selection | null = useMemo(() => {
    if (!sel || !rng || !grid) {
      return null;
    }
    const rowIds = grid.rows.slice(rng.r0, rng.r1 + 1).filter((r) => r !== HEADER);
    const colIds = grid.cols.slice(rng.c0, rng.c1 + 1);
    return {
      rowIds,
      colIds,
      cells: rowIds.flatMap((rowId) => colIds.map((colId) => ({ rowId, colId }))),
      colId: sel.f.c,
      rowId: sel.f.r === HEADER ? null : sel.f.r,
    };
  }, [sel, rng?.r0, rng?.r1, rng?.c0, rng?.c1, grid]);

  const z = appState.zoom.value;
  const pos = sceneCoordsToViewportCoords(
    { sceneX: anchor.x, sceneY: anchor.y },
    appState,
  );
  const selected = !!appState.selectedElementIds[anchor.id];
  const moving =
    selected &&
    (appState.selectedElementsAreBeingDragged || appState.isResizing);

  // -- keys, copy and paste, while cells are selected -----------------------
  const live = useRef({ sel, grid, data, rng });
  live.current = { sel, grid, data, rng };
  useEffect(() => {
    if (!sel) {
      return;
    }
    const typingElsewhere = (t: EventTarget | null) =>
      !!(t as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable]",
      );

    const onKey = (e: KeyboardEvent) => {
      const { sel, grid, data, rng } = live.current;
      if (!sel || !grid || !data || !rng || typingElsewhere(e.target)) {
        return;
      }
      if (sel.editing) {
        // keys typed before the editor has the keyboard still count
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          e.stopImmediatePropagation();
          setSel((s) => (s ? { ...s, seed: (s.seed ?? "") + e.key } : s));
        }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      const stop = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
      if (mod) {
        if (e.key === "a") {
          stop();
          setSel({
            ...sel,
            a: { r: grid.rows[1] ?? HEADER, c: grid.cols[0] },
            f: { r: grid.rows[grid.rows.length - 1], c: grid.cols[grid.cols.length - 1] },
          });
        } else if (e.key === "b" && selection?.cells.length) {
          stop();
          const first = selection.cells[0];
          const bold = !data.styles[`${first.rowId}:${first.colId}`]?.bold;
          update((t) => setStyles(t, selection.cells, { bold }));
        }
        // undo, copy, paste, zoom: the board's or the events below
        return;
      }
      const f = indexOf(grid, sel.f);
      const to = (ri: number, ci: number, extend: boolean) => {
        const r = grid.rows[Math.max(0, Math.min(grid.rows.length - 1, ri))];
        const c = grid.cols[Math.max(0, Math.min(grid.cols.length - 1, ci))];
        setSel({ ...sel, a: extend ? sel.a : { r, c }, f: { r, c } });
      };
      const col = data.columns.find((c) => c.id === sel.f.c);
      switch (e.key) {
        case "ArrowDown":
          stop();
          return to(f.ri + 1, f.ci, e.shiftKey);
        case "ArrowUp":
          stop();
          return to(f.ri - 1, f.ci, e.shiftKey);
        case "ArrowRight":
          stop();
          return to(f.ri, f.ci + 1, e.shiftKey);
        case "ArrowLeft":
          stop();
          return to(f.ri, f.ci - 1, e.shiftKey);
        case "Tab": {
          stop();
          let ci = f.ci + (e.shiftKey ? -1 : 1);
          let ri = f.ri;
          if (ci >= grid.cols.length) {
            ci = 0;
            ri++;
          } else if (ci < 0) {
            ci = grid.cols.length - 1;
            ri--;
          }
          return to(ri, ci, false);
        }
        case "Enter":
        case "F2":
          stop();
          if (col?.format === "checkbox" && sel.f.r !== HEADER) {
            return toggle();
          }
          return setSel({ ...sel, editing: true, seed: undefined });
        case "Backspace":
        case "Delete":
          stop();
          return update((t) =>
            setCells(
              t,
              (selection?.cells ?? []).map((x) => ({ ...x, value: "" })),
            ),
          );
        case "Escape":
          stop();
          return setSel(null);
        case " ":
          if (col?.format === "checkbox" && sel.f.r !== HEADER) {
            stop();
            return toggle();
          }
      }
      if (e.key.length === 1 && !e.altKey) {
        stop();
        // typing replaces the cell, as in Numbers
        if (col?.format === "checkbox" && sel.f.r !== HEADER) {
          return;
        }
        setSel({ ...sel, a: sel.f, editing: true, seed: e.key });
      }
    };

    // copy and paste as tab-separated text, so cells go to and from Numbers,
    // Excel and Google Sheets
    const onCopy = (e: ClipboardEvent) => {
      const { sel, grid, data, rng } = live.current;
      if (!sel || sel.editing || !grid || !data || !rng || typingElsewhere(e.target)) {
        return;
      }
      const text = grid.rows
        .slice(rng.r0, rng.r1 + 1)
        .map((r) =>
          grid.cols
            .slice(rng.c0, rng.c1 + 1)
            .map((c) => rawOf(data, r, c).replace(/[\t\n]/g, " "))
            .join("\t"),
        )
        .join("\n");
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onPaste = (e: ClipboardEvent) => {
      const { sel, grid, rng } = live.current;
      if (!sel || sel.editing || !grid || !rng || typingElsewhere(e.target)) {
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (!text) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n");
      const block = lines.map((l) => l.split("\t"));
      // one value into a range fills the range
      const fill = block.length === 1 && block[0].length === 1;
      const height = fill ? rng.r1 - rng.r0 + 1 : block.length;
      const width = fill ? rng.c1 - rng.c0 + 1 : Math.max(...block.map((b) => b.length));
      update((t0) => {
        let t = t0;
        // pasting past the last row or column adds them
        const viewRows = grid.rows.slice(1);
        const need = rng.r0 - 1 + height - viewRows.length;
        const newRowIds: string[] = [];
        for (let i = 0; i < need; i++) {
          const before = new Set(t.rows.map((r) => r.id));
          t = addRow(t);
          newRowIds.push(t.rows.find((r) => !before.has(r.id))!.id);
        }
        const cols = [...grid.cols];
        while (cols.length < rng.c0 + width) {
          const before = new Set(t.columns.map((c) => c.id));
          t = addColumn(t);
          cols.push(t.columns.find((c) => !before.has(c.id))!.id);
        }
        const rows = [...grid.rows, ...newRowIds];
        const cells: { rowId: string; colId: string; value: string }[] = [];
        for (let i = 0; i < height; i++) {
          for (let j = 0; j < width; j++) {
            const value = fill ? block[0][0] : block[i]?.[j] ?? "";
            const r = rows[rng.r0 + i];
            const c = cols[rng.c0 + j];
            if (r === HEADER) {
              t = renameColumn(t, c, value);
            } else if (r && c) {
              cells.push({ rowId: r, colId: c, value });
            }
          }
        }
        return setCells(t, cells);
      });
    };

    const toggle = () => {
      const { sel, data } = live.current;
      if (!sel || !data || !selection) {
        return;
      }
      const on = !isChecked(rawOf(data, sel.f.r, sel.f.c));
      update((t) =>
        setCells(
          t,
          selection.cells
            .filter((x) => t.columns.find((c) => c.id === x.colId)?.format === "checkbox")
            .map((x) => ({ ...x, value: on ? "true" : "" })),
        ),
      );
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("copy", onCopy, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("copy", onCopy, true);
      window.removeEventListener("paste", onPaste, true);
    };
  }, [!!sel, selection, update, setSel]);

  if (!described || !data || !layout || !grid) {
    return null;
  }
  const w = layout.width * z;
  const h = layout.height * z;
  // off screen, or too small to click into: nothing to lay over it
  const offScreen =
    pos.x > appState.offsetLeft + appState.width ||
    pos.y > appState.offsetTop + appState.height ||
    pos.x + w < appState.offsetLeft ||
    pos.y + h < appState.offsetTop ||
    z < 0.15;

  // inside the editor's own element, so it takes the editor's theme and font
  const panel =
    showPanel &&
    !moving &&
    createPortal(
      <FormatPanel
        api={api}
        anchor={anchor}
        data={data}
        selection={selection}
        onSelectionGone={() => setSel(null)}
      />,
      document.querySelector(".excalidraw") ?? document.body,
    );
  if (offScreen || moving) {
    return panel || null;
  }

  /** the cell under a point on screen, held inside the table while dragging */
  const cellAt = (clientX: number, clientY: number, clamp = false): Cell | null => {
    const sx = (clientX - pos.x) / z;
    const sy = (clientY - pos.y) / z;
    let ci = layout.columns.findIndex((c) => sx >= c.x && sx < c.x + c.width);
    let ri =
      sy < layout.headerHeight
        ? 0
        : layout.rows.findIndex((r) => sy >= r.y && sy < r.y + r.height) + 1;
    if (clamp) {
      if (ci < 0) {
        ci = sx < 0 ? 0 : grid.cols.length - 1;
      }
      if (ri <= 0 && sy >= layout.headerHeight) {
        ri = grid.rows.length - 1;
      }
      if (sy < 0) {
        ri = 0;
      }
    } else if (ci < 0 || ri < 0 || sy < 0) {
      return null;
    }
    return { r: grid.rows[ri], c: grid.cols[ci] };
  };

  const cellBox = (r: string, c: string) => {
    const col = layout.columns.find((x) => x.id === c)!;
    const row = r === HEADER ? null : layout.rows.find((x) => x.row.id === r)!;
    return {
      x: pos.x + col.x * z,
      y: pos.y + (row ? row.y : 0) * z,
      w: col.width * z,
      h: (row ? row.height : layout.headerHeight) * z,
    };
  };

  const select = (a: Cell, f: Cell = a, editing = false) => {
    if (Object.keys(api.getAppState().selectedElementIds).length) {
      api.selection.clear({ captureUpdate: CaptureUpdateAction.NEVER });
    }
    setSel({ anchorId: anchor.id, a, f, editing });
  };

  const selectTable = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSel(null);
    api.selection.select([anchor.id], {
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const colOf = (c: string) => data.columns.find((x) => x.id === c);
  const toggleOne = (cell: Cell) =>
    update((t) =>
      setCell(t, cell.r, cell.c, isChecked(rawOf(t, cell.r, cell.c)) ? "" : "true"),
    );

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1) {
      passPointer(e);
      return;
    }
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) {
      return;
    }
    if (e.shiftKey && sel) {
      setSel({ ...sel, f: cell, editing: false });
      return;
    }
    select(cell);
    // a checkbox toggles on click, as in Numbers
    if (cell.r !== HEADER && colOf(cell.c)?.format === "checkbox") {
      const b = cellBox(cell.r, cell.c);
      const box = Math.max(12, 14 * z);
      if (
        Math.abs(e.clientX - (b.x + b.w / 2)) <= box &&
        Math.abs(e.clientY - (b.y + b.h / 2)) <= box
      ) {
        toggleOne(cell);
        return;
      }
    }
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current || !sel) {
      return;
    }
    const cell = cellAt(e.clientX, e.clientY, true);
    if (cell && (cell.r !== sel.f.r || cell.c !== sel.f.c)) {
      setSel({ ...sel, f: cell });
    }
  };
  const onUp = () => {
    dragging.current = false;
  };
  const onDouble = (e: React.MouseEvent) => {
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell || (cell.r !== HEADER && colOf(cell.c)?.format === "checkbox")) {
      return;
    }
    select(cell, cell, true);
  };

  const rangeBox = rng && (() => {
    const tl = cellBox(grid.rows[rng.r0], grid.cols[rng.c0]);
    const br = cellBox(grid.rows[rng.r1], grid.cols[rng.c1]);
    return { x: tl.x, y: tl.y, w: br.x + br.w - tl.x, h: br.y + br.h - tl.y };
  })();
  const focus = sel && rng ? cellBox(sel.f.r, sel.f.c) : null;
  const single = rng && rng.r0 === rng.r1 && rng.c0 === rng.c1;
  const showRefs = !!sel || selected;
  const dot = Math.max(8, Math.min(14, 28 * z));

  return (
    <>
      <div
        className={`jb-table${selected ? " is-selected" : ""}${sel ? " has-cells" : ""}`}
        style={{ left: pos.x, top: pos.y, width: w, height: h }}
        onWheel={passWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={onDouble}
        onContextMenu={(e) => e.preventDefault()}
      />

      {rangeBox && !sel?.editing && (
        <div
          className={`jb-range${single ? " is-single" : ""}`}
          style={{ left: rangeBox.x, top: rangeBox.y, width: rangeBox.w, height: rangeBox.h }}
        />
      )}
      {focus && !single && !sel?.editing && (
        <div
          className="jb-focus"
          style={{ left: focus.x, top: focus.y, width: focus.w, height: focus.h }}
        />
      )}

      {showRefs && (
        <Refs
          data={data}
          layout={layout}
          pos={pos}
          z={z}
          rng={rng}
          onColumn={(ci) =>
            select(
              { r: HEADER, c: grid.cols[ci] },
              { r: grid.rows[grid.rows.length - 1], c: grid.cols[ci] },
            )
          }
          onRow={(ri) =>
            select(
              { r: grid.rows[ri], c: grid.cols[0] },
              { r: grid.rows[ri], c: grid.cols[grid.cols.length - 1] },
            )
          }
        />
      )}

      {!selected &&
        layout.columns.map((col) => (
          <div
            key={`grip:${col.id}`}
            className="jb-col-grip"
            style={{
              left: pos.x + (col.x + col.width) * z - 4,
              top: pos.y,
              height: Math.max(layout.headerHeight * z, 10),
            }}
            title="Drag to size the column"
            onPointerDown={(e) => {
              if (e.button !== 0) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setResizing({ colId: col.id, startX: e.clientX, startW: col.width, w: col.width });
            }}
            onPointerMove={(e) => {
              if (resizing?.colId === col.id) {
                setResizing({
                  ...resizing,
                  w: Math.max(40, resizing.startW + (e.clientX - resizing.startX) / z),
                });
              }
            }}
            onPointerUp={() => {
              if (resizing?.colId === col.id) {
                const width = resizing.w;
                setResizing(null);
                update((t) => setColumnWidth(t, col.id, width));
              }
            }}
          />
        ))}
      {resizing && (
        <div
          className="jb-col-guide"
          style={{
            left: pos.x + (layout.columns.find((c) => c.id === resizing.colId)!.x + resizing.w) * z,
            top: pos.y,
            height: h,
          }}
        />
      )}

      {sel?.editing && focus && (
        <CellEditor
          key={`${sel.f.r}:${sel.f.c}`}
          box={focus}
          z={z}
          fontSize={layout.fontSize}
          data={data}
          col={colOf(sel.f.c)!}
          cell={sel.f}
          align={
            [...layout.header, ...layout.cells].find(
              (x) => x.rowId === sel.f.r && x.colId === sel.f.c,
            )?.align ?? "left"
          }
          seed={sel.seed}
          onSave={(value) => {
            if (value !== rawOf(data, sel.f.r, sel.f.c)) {
              update((t) =>
                sel.f.r === HEADER
                  ? renameColumn(t, sel.f.c, value)
                  : setCell(t, sel.f.r, sel.f.c, value),
              );
            }
          }}
          onDone={(move) => {
            const { ri, ci } = indexOf(grid, sel.f);
            let r = ri;
            let c = ci;
            if (move === "down") {
              r++;
            } else if (move === "right" || move === "left") {
              c += move === "right" ? 1 : -1;
              if (c >= grid.cols.length) {
                c = 0;
                r++;
              } else if (c < 0) {
                c = grid.cols.length - 1;
                r--;
              }
            }
            r = Math.max(0, Math.min(grid.rows.length - 1, r));
            const next = { r: grid.rows[r], c: grid.cols[c] };
            setSel((s) => (s ? { ...s, a: next, f: next, editing: false, seed: undefined } : s));
          }}
          onCancel={() =>
            setSel((s) => (s ? { ...s, editing: false, seed: undefined } : s))
          }
        />
      )}

      {/* the handle, and the bars that add a row or a column */}
      <button
        type="button"
        className={`jb-table-handle${selected ? " is-on" : ""}`}
        style={{
          left: pos.x - dot / 2 - 3,
          top: pos.y - dot / 2 - 3,
          width: dot,
          height: dot,
          borderWidth: dot < 11 ? 1.5 : 2,
        }}
        title="Select the table"
        onPointerDown={selectTable}
      />
      <button
        type="button"
        className={`jb-add-row${sel || selected ? " is-shown" : ""}`}
        style={{ left: pos.x, top: pos.y + h + 4, width: w }}
        title="Add a row"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          let id = "";
          update((t) => {
            const next = addRow(t);
            id = next.rows[next.rows.length - 1].id;
            return next;
          });
          if (id) {
            select({ r: id, c: grid.cols[0] });
          }
        }}
      >
        {PlusIcon}
      </button>
      <button
        type="button"
        className={`jb-add-col${sel || selected ? " is-shown" : ""}`}
        style={{ left: pos.x + w + 4, top: pos.y, height: h }}
        title="Add a column"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          update((t) => addColumn(t));
        }}
      >
        {PlusIcon}
      </button>
      {panel}
    </>
  );
};

// ---------------------------------------------------------------------------

/** column letters above, row numbers to the left: what formulas call them */
const Refs = ({
  data,
  layout,
  pos,
  z,
  rng,
  onColumn,
  onRow,
}: {
  data: TableData;
  layout: TableLayout;
  pos: { x: number; y: number };
  z: number;
  rng: { r0: number; r1: number; c0: number; c1: number } | null;
  onColumn: (ci: number) => void;
  onRow: (ri: number) => void;
}) => (
  <>
    {layout.columns.map((c, i) => (
      <button
        type="button"
        key={`l:${c.id}`}
        className={`jb-ref jb-ref-col${rng && i >= rng.c0 && i <= rng.c1 ? " is-on" : ""}`}
        style={{ left: pos.x + c.x * z, top: pos.y - 17, width: c.width * z }}
        title={`Select column ${columnLetter(i)}`}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onColumn(i);
        }}
      >
        {columnLetter(i)}
      </button>
    ))}
    {layout.rows.map((r, i) => (
      <button
        type="button"
        key={`n:${r.row.id}`}
        className={`jb-ref jb-ref-row${rng && i + 1 >= rng.r0 && i + 1 <= rng.r1 ? " is-on" : ""}`}
        style={{ left: pos.x - 26, top: pos.y + r.y * z, height: r.height * z }}
        title="Select this row"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRow(i + 1);
        }}
      >
        {data.rows.findIndex((x) => x.id === r.row.id) + 1}
      </button>
    ))}
  </>
);

type Move = "down" | "right" | "left" | "stay";

const CellEditor = ({
  box,
  z,
  fontSize,
  data,
  col,
  cell,
  align,
  seed,
  onSave,
  onDone,
  onCancel,
}: {
  box: { x: number; y: number; w: number; h: number };
  z: number;
  fontSize: number;
  data: TableData;
  col: Column;
  cell: Cell;
  align: string;
  seed?: string;
  onSave: (value: string) => void;
  onDone: (move: Move) => void;
  onCancel: () => void;
}) => {
  const header = cell.r === HEADER;
  const raw = rawOf(data, cell.r, cell.c);
  const kind = header
    ? "text"
    : col.format === "select"
    ? "select"
    : col.format === "date" && seed === undefined
    ? "date"
    : "text";
  const [value, setValue] = useState(seed ?? raw);
  const latest = useRef(value);
  latest.current = value;
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement & HTMLSelectElement>(null);
  const save = useRef(onSave);
  save.current = onSave;

  // seeds typed before the editor took the keyboard
  useEffect(() => {
    if (seed !== undefined && seed !== latest.current && seed.startsWith(latest.current)) {
      setValue(seed);
    }
  }, [seed]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      if (kind === "text") {
        el.setSelectionRange(el.value.length, el.value.length);
      } else if (kind === "select") {
        (el as any).showPicker?.();
      }
    }
    // clicking straight into another cell removes this editor without a
    // blur: what was typed is saved all the same
    return () => {
      if (!done.current) {
        done.current = true;
        save.current(latest.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el && kind === "text") {
      el.style.height = "auto";
      el.style.height = `${Math.max(box.h, el.scrollHeight)}px`;
    }
  }, [value, box.h, kind]);

  const finish = (move: Move, v = value) => {
    if (!done.current) {
      done.current = true;
      // let go of the keyboard now, so keys typed next reach the table
      ref.current?.blur();
      onSave(v);
      onDone(move);
    }
  };

  // what a formula comes to, while typing it
  const preview = useMemo(() => {
    if (!value.startsWith("=") || header) {
      return null;
    }
    const show = tableDisplay(setCell(data, cell.r, cell.c, value));
    return show(cell.r, cell.c);
  }, [value, data, cell, header]);

  const style = data.styles[`${cell.r}:${cell.c}`] ?? {};
  const css: React.CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    minHeight: box.h,
    height: kind === "text" ? undefined : box.h,
    fontSize: fontSize * z,
    lineHeight: LINE_HEIGHT,
    padding: `${PAD_Y * z - 2}px ${PAD_X * z - 2}px`,
    textAlign: value.startsWith("=") ? "left" : (align as any),
    fontWeight: header || style.bold ? 700 : 400,
    color: style.color || undefined,
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      finish("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      finish(e.shiftKey ? "left" : "right");
    } else if (e.key === "Escape") {
      e.preventDefault();
      done.current = true;
      onCancel();
    }
  };

  return (
    <>
      {kind === "select" ? (
        <select
          ref={ref}
          className="jb-cell-editor"
          style={{ ...css, padding: `0 ${PAD_X * z - 2}px` }}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            finish("stay", e.target.value);
          }}
          onBlur={() => finish("stay")}
          onKeyDown={keys}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <option value="">—</option>
          {(col.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          {value && !(col.options ?? []).includes(value) && (
            <option value={value}>{value}</option>
          )}
        </select>
      ) : kind === "date" ? (
        <input
          ref={ref}
          type="date"
          className="jb-cell-editor"
          style={{ ...css, padding: `0 ${PAD_X * z - 2}px` }}
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => finish("stay")}
          onKeyDown={keys}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <textarea
          ref={ref}
          className="jb-cell-editor"
          style={css}
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => finish("stay")}
          onKeyDown={keys}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}
      {preview !== null && (
        <div className="jb-cell-hint" style={{ left: box.x, top: box.y - 24 }}>
          <b>{cellName(data, cell.r, cell.c)}</b>
          <span> = {preview || "…"}</span>
        </div>
      )}
    </>
  );
};
