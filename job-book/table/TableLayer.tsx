// How you work in a table, the way Numbers does it.
//
// Every table on screen gets a transparent layer exactly over its drawing.
// Click a cell and you are typing in it; the cell toolbar (bold, alignment,
// fill, rows) sits above the table. Click the dot at the table's top left
// and the whole table is selected: move it, resize it (the columns scale),
// add rows and columns, sort and filter. The "+" bar under a table adds a
// row; the "+" at its right adds a column. Drag a header's right edge to
// size its column.
//
// The wheel and the middle button pass through to the board, so zooming and
// panning work the same over a table as anywhere else.

import {
  CaptureUpdateAction,
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cellName, tableDisplay } from "./formula";
import { FONT_SIZE, isHeader, LINE_HEIGHT, PAD_X, PAD_Y } from "./layout";
import {
  addColumn,
  addRow,
  columnLetter,
  deleteColumn,
  deleteRow,
  FILTER_OPS,
  renameColumn,
  setCell,
  setColumnWidth,
  setStyle,
  styleKey,
} from "./model";
import { describeTable, isTableAnchor, updateTable } from "./render";

import type { CellLayout, TableLayout } from "./layout";
import type { Align, FilterOp, TableData } from "./model";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const HEADER = "__header";

type Active = {
  anchorId: string;
  rowId: string;
  colId: string;
  editing: boolean;
  /** what typing started the edit with, if it was a key on a selected cell */
  seed?: string;
} | null;

type Panel = { anchorId: string; kind: "sort" | "filter" } | null;

const FILLS = ["", "#fff3bf", "#d3f9d8", "#d0ebff", "#ffe3e3", "#e9ecef"];

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

const rawOf = (t: TableData, rowId: string, colId: string) =>
  rowId === HEADER
    ? t.columns.find((c) => c.id === colId)?.name ?? ""
    : t.rows.find((r) => r.id === rowId)?.cells[colId] ?? "";

// ---------------------------------------------------------------------------

export const TableLayer = ({ canEdit }: { canEdit: boolean }) => {
  const api = useExcalidrawAPI();
  const [, setTick] = useState(0);
  const [active, setActive] = useState<Active>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const activeRef = useRef<Active>(null);
  activeRef.current = active;

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
        anchors
          .filter((a) => s.selectedElementIds[a.id])
          .map((a) => a.id)
          .join(),
      ].join("|");
      if (key !== last) {
        last = key;
        setTick((n) => n + 1);
      }
    };
    const off1 = api.onChange(check);
    const off2 = api.onScrollChange(check);
    // a click anywhere on the board leaves the cell
    const off3 = api.onPointerDown(() => {
      if (activeRef.current) {
        setActive(null);
      }
      setPanel(null);
    });
    return () => {
      off1();
      off2();
      off3();
    };
  }, [api]);

  if (!api || !canEdit) {
    return null;
  }
  const appState = api.getAppState();
  const anchors = api.getSceneElements().filter(isTableAnchor);

  return (
    <div className={`jb-tables${appState.theme === "dark" ? " is-dark" : ""}`}>
      {anchors.map((anchor) => (
        <TableOverlay
          key={anchor.id}
          api={api}
          anchor={anchor}
          appState={appState}
          active={active?.anchorId === anchor.id ? active : null}
          setActive={setActive}
          panel={panel?.anchorId === anchor.id ? panel : null}
          setPanel={setPanel}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------

const TableOverlay = ({
  api,
  anchor,
  appState,
  active,
  setActive,
  panel,
  setPanel,
}: {
  api: ExcalidrawImperativeAPI;
  anchor: ExcalidrawElement;
  appState: AppState;
  active: Active;
  setActive: React.Dispatch<React.SetStateAction<Active>>;
  panel: Panel;
  setPanel: (p: Panel) => void;
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

  const update = useCallback(
    (change: (t: TableData) => TableData) =>
      updateTable(api, anchor.id, change),
    [api, anchor.id],
  );

  if (!described) {
    return null;
  }
  const { data, layout } = described;
  const z = appState.zoom.value;
  const pos = sceneCoordsToViewportCoords(
    { sceneX: anchor.x, sceneY: anchor.y },
    appState,
  );
  const selected = !!appState.selectedElementIds[anchor.id];
  const moving =
    selected &&
    (appState.selectedElementsAreBeingDragged || appState.isResizing);
  const w = layout.width * z;
  const h = layout.height * z;
  // off screen, or too small to click into: nothing to lay over it
  if (
    pos.x > appState.offsetLeft + appState.width ||
    pos.y > appState.offsetTop + appState.height ||
    pos.x + w < appState.offsetLeft ||
    pos.y + h < appState.offsetTop ||
    z < 0.15
  ) {
    return null;
  }

  const allCells = [...layout.header, ...layout.cells];
  const activeCell = active
    ? allCells.find((c) => c.rowId === active.rowId && c.colId === active.colId)
    : undefined;
  const showRefs = !!activeCell || selected;

  const selectTable = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(null);
    setPanel(null);
    api.selection.select([anchor.id], {
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  };

  const goTo = (rowId: string, colId: string, editing = false) => {
    api.selection.clear({ captureUpdate: CaptureUpdateAction.NEVER });
    setPanel(null);
    setActive({ anchorId: anchor.id, rowId, colId, editing });
  };

  const addRowAndEdit = (after?: string) => {
    let newRowId = "";
    update((t) => {
      const next = addRow(t, after);
      newRowId = next.rows.find((r) => !t.rows.some((x) => x.id === r.id))!.id;
      return next;
    });
    if (newRowId) {
      goTo(newRowId, data.columns[0].id, true);
    }
  };

  return (
    <>
      {/* the table itself, in board units, scaled with the zoom */}
      {!moving && (
        <div
          className={`jb-table${selected ? " is-selected" : ""}`}
          style={{
            left: pos.x,
            top: pos.y,
            width: layout.width,
            height: layout.height,
            transform: `scale(${z})`,
          }}
          onWheel={passWheel}
        >
          {showRefs && <Refs data={data} layout={layout} />}
          {allCells.map((c) => (
            <div
              key={`${c.rowId}:${c.colId}`}
              className={`jb-cell${isHeader(c) ? " is-header" : ""}${
                activeCell === c ? " is-active" : ""
              }`}
              style={{ left: c.x, top: c.y, width: c.width, height: c.height }}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => {
                if (e.button === 1) {
                  passPointer(e);
                  return;
                }
                if (e.button !== 0) {
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                // click and you're in the cell
                goTo(c.rowId, c.colId, true);
              }}
            />
          ))}
          {layout.columns.map((col) => (
            <div
              key={`grip:${col.id}`}
              className="jb-col-grip"
              style={{
                left: col.x + col.width - 4,
                height: layout.headerHeight,
              }}
              title="Drag to size the column"
              onPointerDown={(e) => {
                if (e.button !== 0) {
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                setResizing({
                  colId: col.id,
                  startX: e.clientX,
                  startW: col.width,
                  w: col.width,
                });
              }}
              onPointerMove={(e) => {
                if (resizing?.colId === col.id) {
                  setResizing({
                    ...resizing,
                    w: Math.max(
                      40,
                      resizing.startW + (e.clientX - resizing.startX) / z,
                    ),
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
                left:
                  layout.columns.find((c) => c.id === resizing.colId)!.x +
                  resizing.w,
                height: layout.height,
              }}
            />
          )}
          {activeCell && active?.editing && (
            <CellEditor
              key={`${active.rowId}:${active.colId}`}
              cell={activeCell}
              data={data}
              layout={layout}
              seed={active.seed}
              onSave={(value) => {
                if (value !== rawOf(data, activeCell.rowId, activeCell.colId)) {
                  update((t) =>
                    isHeader(activeCell)
                      ? renameColumn(t, activeCell.colId, value)
                      : setCell(t, activeCell.rowId, activeCell.colId, value),
                  );
                }
              }}
              onMove={(move) => {
                const next = neighbour(layout, activeCell, move);
                setActive(
                  next
                    ? { anchorId: anchor.id, ...next, editing: false }
                    : { ...active, editing: false, seed: undefined },
                );
              }}
              onCancel={() =>
                setActive({ ...active, editing: false, seed: undefined })
              }
            />
          )}
          {activeCell && !active?.editing && (
            <SelectedCellKeys
              cell={activeCell}
              layout={layout}
              onEdit={(key) =>
                // keys typed faster than the editor opens all count
                setActive((a) =>
                  a
                    ? {
                        ...a,
                        editing: true,
                        seed:
                          key === undefined
                            ? undefined
                            : (a.editing ? a.seed ?? "" : "") + key,
                      }
                    : a,
                )
              }
              onClear={() =>
                !isHeader(activeCell) &&
                update((t) =>
                  setCell(t, activeCell.rowId, activeCell.colId, ""),
                )
              }
              onMove={(next) =>
                setActive({
                  anchorId: anchor.id,
                  rowId: next.rowId,
                  colId: next.colId,
                  editing: false,
                })
              }
              onLeave={() => setActive(null)}
            />
          )}
        </div>
      )}

      {/* chrome at screen size: handle, add bars, toolbars */}
      {!moving && (
        <>
          <button
            type="button"
            className={`jb-table-handle${selected ? " is-on" : ""}`}
            style={{ left: pos.x - 9, top: pos.y - 9 }}
            title="Select the table: move it, size it, add rows and columns, sort and filter"
            onPointerDown={selectTable}
          />
          <button
            type="button"
            className="jb-add-row"
            style={{ left: pos.x, top: pos.y + h + 3, width: w }}
            title="New row"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              addRowAndEdit();
            }}
          >
            +
          </button>
          <button
            type="button"
            className="jb-add-col"
            style={{
              left: pos.x + w + 3,
              top: pos.y,
              height: Math.max(layout.headerHeight * z, 18),
            }}
            title="New column"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              update((t) => addColumn(t));
            }}
          >
            +
          </button>

          {(selected || activeCell) && (
            <div
              className="jb-table-bar"
              style={{ left: pos.x, top: pos.y - 42 }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {activeCell && !isHeader(activeCell) ? (
                <CellTools
                  data={data}
                  cell={activeCell}
                  update={update}
                  onAddRow={() => addRowAndEdit(activeCell.rowId)}
                  onDeleteRow={() => {
                    setActive(null);
                    update((t) => deleteRow(t, activeCell.rowId));
                  }}
                />
              ) : activeCell ? (
                <ColumnTools
                  data={data}
                  colId={activeCell.colId}
                  update={update}
                  onFilter={() =>
                    setPanel({ anchorId: anchor.id, kind: "filter" })
                  }
                  onDelete={() => {
                    setActive(null);
                    update((t) => deleteColumn(t, activeCell.colId));
                  }}
                />
              ) : (
                <TableTools
                  data={data}
                  layout={layout}
                  panel={panel}
                  onAddRow={() => update((t) => addRow(t))}
                  onAddColumn={() => update((t) => addColumn(t))}
                  onPanel={(kind) =>
                    setPanel(
                      panel?.kind === kind
                        ? null
                        : { anchorId: anchor.id, kind },
                    )
                  }
                />
              )}
            </div>
          )}
          {panel && (
            <div
              className="jb-table-panel"
              style={{ left: pos.x, top: pos.y - 42 + 38 }}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {panel.kind === "sort" ? (
                <SortPanel data={data} update={update} />
              ) : (
                <FilterPanel data={data} update={update} />
              )}
            </div>
          )}
        </>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------

type Move = "down" | "up" | "right" | "left" | "stay";

/** the cell next to this one in the view, in a direction */
const neighbour = (layout: TableLayout, cell: CellLayout, move: Move) => {
  if (move === "stay") {
    return null;
  }
  const cols = layout.columns.map((c) => c.id);
  const rows = [HEADER, ...layout.rows.map((r) => r.row.id)];
  let ci = cols.indexOf(cell.colId);
  let ri = rows.indexOf(cell.rowId);
  if (move === "down") {
    ri++;
  } else if (move === "up") {
    ri--;
  } else if (move === "right") {
    ci++;
    if (ci >= cols.length) {
      ci = 0;
      ri++;
    }
  } else if (move === "left") {
    ci--;
    if (ci < 0) {
      ci = cols.length - 1;
      ri--;
    }
  }
  if (ri < 0 || ri >= rows.length) {
    return null;
  }
  return { rowId: rows[ri], colId: cols[ci] };
};

/** column letters above, row numbers to the left: what formulas call them */
const Refs = ({ data, layout }: { data: TableData; layout: TableLayout }) => (
  <>
    {layout.columns.map((c, i) => (
      <div
        key={`l:${c.id}`}
        className="jb-ref jb-ref-col"
        style={{ left: c.x, width: c.width }}
      >
        {columnLetter(i)}
      </div>
    ))}
    {layout.rows.map((r) => (
      <div
        key={`n:${r.row.id}`}
        className="jb-ref jb-ref-row"
        style={{ top: r.y, height: r.height }}
      >
        {data.rows.findIndex((x) => x.id === r.row.id) + 1}
      </div>
    ))}
  </>
);

const CellEditor = ({
  cell,
  data,
  layout,
  seed,
  onSave,
  onMove,
  onCancel,
}: {
  cell: CellLayout;
  data: TableData;
  layout: TableLayout;
  seed?: string;
  onSave: (value: string) => void;
  /** where to go after saving; "stay" keeps this cell selected */
  onMove: (move: Move) => void;
  onCancel: () => void;
}) => {
  const raw = rawOf(data, cell.rowId, cell.colId);
  const [value, setValue] = useState(seed ?? raw);
  const latest = useRef(value);
  latest.current = value;
  const done = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const save = useRef(onSave);
  save.current = onSave;

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // clicking straight into another cell removes this editor without a
    // blur: what was typed is saved all the same
    return () => {
      if (!done.current) {
        done.current = true;
        save.current(latest.current);
      }
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.max(cell.height, el.scrollHeight)}px`;
    }
  }, [value, cell.height]);

  const finish = (move: Move) => {
    if (!done.current) {
      done.current = true;
      // let go of the keyboard now, so keys typed next reach the next cell
      // rather than this editor on its way out
      ref.current?.blur();
      onSave(value);
      onMove(move);
    }
  };

  // what a formula comes to, while typing it
  const preview = useMemo(() => {
    if (!value.startsWith("=") || isHeader(cell)) {
      return null;
    }
    const show = tableDisplay(setCell(data, cell.rowId, cell.colId, value));
    return show(cell.rowId, cell.colId);
  }, [value, data, cell]);

  return (
    <>
      <textarea
        ref={ref}
        className={`jb-cell-editor${isHeader(cell) ? " is-header" : ""}`}
        style={{
          left: cell.x,
          top: cell.y,
          width: cell.width,
          minHeight: cell.height,
          fontSize: FONT_SIZE,
          lineHeight: LINE_HEIGHT,
          padding: `${PAD_Y}px ${PAD_X}px`,
          textAlign: value.startsWith("=") ? "left" : cell.align,
        }}
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        // focus going to the toolbar (bold, fill) keeps the cell selected
        onBlur={() => finish("stay")}
        onKeyDown={(e) => {
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
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
      <div className="jb-cell-hint" style={{ left: cell.x, top: cell.y - 22 }}>
        <b>
          {isHeader(cell)
            ? "column name"
            : cellName(data, cell.rowId, cell.colId)}
        </b>
        {preview !== null ? (
          <span> = {preview || "…"}</span>
        ) : !isHeader(cell) && layout.rows.length ? (
          <span> type = for a formula</span>
        ) : null}
      </div>
    </>
  );
};

/** a selected cell listens for keys the way a spreadsheet does */
const SelectedCellKeys = ({
  cell,
  layout,
  onEdit,
  onClear,
  onMove,
  onLeave,
}: {
  cell: CellLayout;
  layout: TableLayout;
  onEdit: (seed?: string) => void;
  onClear: () => void;
  onMove: (next: { rowId: string; colId: string }) => void;
  onLeave: () => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        return; // undo, copy, zoom: the board's
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable]")) {
        return; // typing somewhere else (the sheet search, a filter)
      }
      const moves: Record<string, Move> = {
        ArrowDown: "down",
        ArrowUp: "up",
        ArrowRight: "right",
        ArrowLeft: "left",
        Tab: e.shiftKey ? "left" : "right",
      };
      let handled = true;
      if (moves[e.key]) {
        const next = neighbour(layout, cell, moves[e.key]);
        if (next) {
          onMove(next);
        }
      } else if (e.key === "Enter" || e.key === "F2") {
        onEdit();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        onClear();
      } else if (e.key === "Escape") {
        onLeave();
      } else if (e.key.length === 1) {
        // typing replaces the cell, as in Numbers
        onEdit(e.key);
      } else {
        handled = false;
      }
      if (handled) {
        // before the board's own shortcuts see it (a letter would pick a tool)
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cell, layout, onEdit, onClear, onMove, onLeave]);
  return null;
};

// ---------------------------------------------------------------------------
// toolbars

const CellTools = ({
  data,
  cell,
  update,
  onAddRow,
  onDeleteRow,
}: {
  data: TableData;
  cell: CellLayout;
  update: (f: (t: TableData) => TableData) => void;
  onAddRow: () => void;
  onDeleteRow: () => void;
}) => {
  const style = data.styles[styleKey(cell.rowId, cell.colId)] ?? {};
  const set = (patch: Parameters<typeof setStyle>[3]) =>
    update((t) => setStyle(t, cell.rowId, cell.colId, patch));
  const aligns: [Align, string][] = [
    ["left", "⇤"],
    ["center", "↔"],
    ["right", "⇥"],
  ];
  return (
    <>
      <span className="jb-bar-label">
        {cellName(data, cell.rowId, cell.colId)}
      </span>
      <button
        type="button"
        className={style.bold ? "is-on" : ""}
        title="Bold"
        onClick={() => set({ bold: !style.bold })}
      >
        <b>B</b>
      </button>
      {aligns.map(([a, icon]) => (
        <button
          key={a}
          type="button"
          className={cell.align === a ? "is-on" : ""}
          title={`Align ${a}`}
          onClick={() => set({ align: a })}
        >
          {icon}
        </button>
      ))}
      <span className="jb-bar-sep" />
      {FILLS.map((f) => (
        <button
          key={f || "none"}
          type="button"
          className={`jb-swatch${(style.fill ?? "") === f ? " is-on" : ""}`}
          style={{ background: f || "transparent" }}
          title={f ? "Fill" : "No fill"}
          onClick={() => set({ fill: f || undefined })}
        >
          {f ? "" : "∅"}
        </button>
      ))}
      <span className="jb-bar-sep" />
      <button type="button" onClick={onAddRow} title="Insert a row below">
        + row
      </button>
      <button type="button" onClick={onDeleteRow} title="Delete this row">
        − row
      </button>
    </>
  );
};

const ColumnTools = ({
  data,
  colId,
  update,
  onFilter,
  onDelete,
}: {
  data: TableData;
  colId: string;
  update: (f: (t: TableData) => TableData) => void;
  onFilter: () => void;
  onDelete: () => void;
}) => {
  const i = data.columns.findIndex((c) => c.id === colId);
  const sortedHere = data.sort?.colId === colId ? data.sort.dir : null;
  return (
    <>
      <span className="jb-bar-label">column {columnLetter(i)}</span>
      <button
        type="button"
        className={sortedHere === "asc" ? "is-on" : ""}
        onClick={() => update((t) => ({ ...t, sort: { colId, dir: "asc" } }))}
      >
        Sort A→Z
      </button>
      <button
        type="button"
        className={sortedHere === "desc" ? "is-on" : ""}
        onClick={() => update((t) => ({ ...t, sort: { colId, dir: "desc" } }))}
      >
        Z→A
      </button>
      <button
        type="button"
        onClick={() => {
          update((t) =>
            t.filters.some((f) => f.colId === colId)
              ? t
              : {
                  ...t,
                  filters: [...t.filters, { colId, op: "contains", value: "" }],
                },
          );
          onFilter();
        }}
      >
        Filter…
      </button>
      <span className="jb-bar-sep" />
      <button
        type="button"
        onClick={() =>
          update((t) => addColumn(t, data.columns[i - 1]?.id ?? null))
        }
        title="Insert a column to the left"
      >
        + left
      </button>
      <button
        type="button"
        onClick={() => update((t) => addColumn(t, colId))}
        title="Insert a column to the right"
      >
        + right
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={data.columns.length <= 1}
        title="Delete this column"
      >
        − column
      </button>
    </>
  );
};

const TableTools = ({
  data,
  layout,
  panel,
  onAddRow,
  onAddColumn,
  onPanel,
}: {
  data: TableData;
  layout: TableLayout;
  panel: Panel;
  onAddRow: () => void;
  onAddColumn: () => void;
  onPanel: (kind: "sort" | "filter") => void;
}) => {
  const sortCol = data.columns.find((c) => c.id === data.sort?.colId);
  return (
    <>
      <span className="jb-bar-label">table</span>
      <button type="button" onClick={onAddRow}>
        + row
      </button>
      <button type="button" onClick={onAddColumn}>
        + column
      </button>
      <span className="jb-bar-sep" />
      <button
        type="button"
        className={panel?.kind === "sort" || sortCol ? "is-on" : ""}
        onClick={() => onPanel("sort")}
      >
        {sortCol ? `Sorted by ${sortCol.name}` : "Sort"}
      </button>
      <button
        type="button"
        className={
          panel?.kind === "filter" || data.filters.length ? "is-on" : ""
        }
        onClick={() => onPanel("filter")}
      >
        {data.filters.length
          ? `${data.filters.length} filter${data.filters.length > 1 ? "s" : ""}`
          : "Filter"}
      </button>
      {layout.hidden > 0 && (
        <span className="jb-bar-note">
          {layout.rows.length} of {data.rows.length} rows
        </span>
      )}
    </>
  );
};

const SortPanel = ({
  data,
  update,
}: {
  data: TableData;
  update: (f: (t: TableData) => TableData) => void;
}) => (
  <div className="jb-panel-rows">
    <div className="jb-panel-title">Sort by</div>
    <div className="jb-panel-row">
      <select
        value={data.sort?.colId ?? ""}
        onChange={(e) =>
          update((t) => ({
            ...t,
            sort: e.target.value
              ? { colId: e.target.value, dir: t.sort?.dir ?? "asc" }
              : null,
          }))
        }
      >
        <option value="">(stored order)</option>
        {data.columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        value={data.sort?.dir ?? "asc"}
        disabled={!data.sort}
        onChange={(e) =>
          update((t) =>
            t.sort
              ? {
                  ...t,
                  sort: { ...t.sort, dir: e.target.value as "asc" | "desc" },
                }
              : t,
          )
        }
      >
        <option value="asc">A → Z, 1 → 9</option>
        <option value="desc">Z → A, 9 → 1</option>
      </select>
    </div>
    <p className="jb-panel-note">
      Sorting changes the view only. Formulas still refer to rows by their
      number (the grey numbers at the left).
    </p>
  </div>
);

const FilterPanel = ({
  data,
  update,
}: {
  data: TableData;
  update: (f: (t: TableData) => TableData) => void;
}) => {
  const set = (i: number, patch: Partial<TableData["filters"][number]>) =>
    update((t) => ({
      ...t,
      filters: t.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    }));
  return (
    <div className="jb-panel-rows">
      <div className="jb-panel-title">Show rows where</div>
      {data.filters.map((f, i) => {
        const op = FILTER_OPS.find((o) => o.op === f.op)!;
        return (
          <div className="jb-panel-row" key={i}>
            <span className="jb-panel-and">{i ? "and" : ""}</span>
            <select
              value={f.colId}
              onChange={(e) => set(i, { colId: e.target.value })}
            >
              {data.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => set(i, { op: e.target.value as FilterOp })}
            >
              {FILTER_OPS.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            {op.needsValue && (
              <FilterValue
                value={f.value}
                onChange={(value) => set(i, { value })}
              />
            )}
            <button
              type="button"
              title="Remove this filter"
              onClick={() =>
                update((t) => ({
                  ...t,
                  filters: t.filters.filter((_, j) => j !== i),
                }))
              }
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="jb-panel-add"
        onClick={() =>
          update((t) => ({
            ...t,
            filters: [
              ...t.filters,
              { colId: t.columns[0].id, op: "contains", value: "" },
            ],
          }))
        }
      >
        + Add a filter
      </button>
    </div>
  );
};

/** a filter's value, applied as you pause typing rather than per key */
const FilterValue = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) {
      return;
    }
    const id = window.setTimeout(() => onChange(draft), 350);
    return () => window.clearTimeout(id);
  }, [draft, value, onChange]);
  return (
    <input
      value={draft}
      placeholder="value"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
};
