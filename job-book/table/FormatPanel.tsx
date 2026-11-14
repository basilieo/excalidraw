// The table's format panel, on the left where Excalidraw's own properties
// panel goes (it steps aside for it), drawn as one of Excalidraw's islands.
// Two tabs, as Numbers has: Table (rows and columns, grid, corners, fill,
// sort, filter) and Cell (format, text, fill, rows and columns at the
// selection).

import { useEffect, useState } from "react";

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  BoldLineIcon,
  ColumnAddIcon,
  ColumnLeftIcon,
  ColumnRemoveIcon,
  FilterIcon,
  LineDashedIcon,
  LineDottedIcon,
  LineSolidIcon,
  RoundCornerIcon,
  RowAboveIcon,
  RowAddIcon,
  RowRemoveIcon,
  SharpCornerIcon,
  SortDownIcon,
  SortUpIcon,
  ThinIcon,
} from "./icons";
import {
  addColumn,
  addRow,
  addRowBefore,
  deleteColumn,
  deleteRows,
  FILTER_OPS,
  FORMATS,
  setColumn,
  setStyles,
} from "./model";
import { styleTable, updateTable } from "./render";

import type { Align, CellStyle, ColumnFormat, FilterOp, TableData } from "./model";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const GRID_COLORS = ["#868e96", "#1e1e1e", "#4263eb", "#2f9e44", "#e8590c"];
const FILLS = ["transparent", "#ffffff", "#f8f9fa", "#fff9db", "#e7f5ff"];
const CELL_FILLS = ["", "#fff3bf", "#d3f9d8", "#d0ebff", "#ffe3e3", "#e9ecef"];
const TEXT_COLORS = ["", "#868e96", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];

export type Selection = {
  /** the data cells selected (not the header row) */
  cells: { rowId: string; colId: string }[];
  rowIds: string[];
  colIds: string[];
  /** the focused cell's column */
  colId: string;
  /** the focused cell's row, or null on the header row */
  rowId: string | null;
};

const Btn = ({
  icon,
  title,
  on,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    className={`jb-fp-btn${on ? " is-on" : ""}`}
    title={title}
    aria-label={title}
    aria-pressed={on}
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
  </button>
);

const Swatches = ({
  colors,
  value,
  onPick,
  label,
}: {
  colors: string[];
  value: string;
  onPick: (c: string) => void;
  label: string;
}) => (
  <div className="jb-fp-swatches">
    {colors.map((c) => (
      <button
        key={c || "none"}
        type="button"
        className={`jb-fp-swatch${(value || "") === c ? " is-on" : ""}`}
        style={{
          background: c && c !== "transparent" ? c : undefined,
        }}
        title={c && c !== "transparent" ? `${label} ${c}` : `No ${label.toLowerCase()}`}
        onClick={() => onPick(c)}
      />
    ))}
  </div>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <fieldset className="jb-fp-section">
    <legend>{title}</legend>
    {children}
  </fieldset>
);

export const FormatPanel = ({
  api,
  anchor,
  data,
  selection,
  onSelectionGone,
}: {
  api: ExcalidrawImperativeAPI;
  anchor: ExcalidrawElement;
  data: TableData;
  selection: Selection | null;
  onSelectionGone: () => void;
}) => {
  const [tab, setTab] = useState<"table" | "cell">(selection ? "cell" : "table");
  useEffect(() => setTab(selection ? "cell" : "table"), [!!selection]);
  const update = (f: (t: TableData) => TableData) =>
    updateTable(api, anchor.id, f);
  const style = (patch: Parameters<typeof styleTable>[2]) =>
    styleTable(api, anchor.id, patch);

  return (
    <div
      className="jb-format-panel"
      data-ref="table-format"
      onPointerDown={(e) => e.stopPropagation()}
      // typing in a field stays in it; undo and the rest reach the board
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea, select")) {
          e.stopPropagation();
        }
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="jb-fp-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "table"}
          className={tab === "table" ? "is-on" : ""}
          onClick={() => setTab("table")}
        >
          Table
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cell"}
          className={tab === "cell" ? "is-on" : ""}
          disabled={!selection}
          title={selection ? undefined : "Select a cell"}
          onClick={() => setTab("cell")}
        >
          Cell
        </button>
      </div>

      {tab === "table" || !selection ? (
        <TableTab data={data} anchor={anchor} update={update} style={style} />
      ) : (
        <CellTab
          data={data}
          selection={selection}
          update={update}
          onSelectionGone={onSelectionGone}
        />
      )}
    </div>
  );
};

const TableTab = ({
  data,
  anchor,
  update,
  style,
}: {
  data: TableData;
  anchor: ExcalidrawElement;
  update: (f: (t: TableData) => TableData) => void;
  style: (patch: Parameters<typeof styleTable>[2]) => void;
}) => {
  const last = data.rows[data.rows.length - 1];
  const lastCol = data.columns[data.columns.length - 1];
  const round = !!anchor.roundness;
  return (
    <>
      <Section title={`Rows and columns · ${data.rows.length} × ${data.columns.length}`}>
        <div className="jb-fp-row">
          <Btn icon={RowAddIcon} title="Add a row" onClick={() => update((t) => addRow(t))} />
          <Btn
            icon={RowRemoveIcon}
            title="Remove the last row"
            disabled={data.rows.length <= 1}
            onClick={() => update((t) => deleteRows(t, [last.id]))}
          />
          <span className="jb-fp-gap" />
          <Btn icon={ColumnAddIcon} title="Add a column" onClick={() => update((t) => addColumn(t))} />
          <Btn
            icon={ColumnRemoveIcon}
            title="Remove the last column"
            disabled={data.columns.length <= 1}
            onClick={() => update((t) => deleteColumn(t, lastCol.id))}
          />
        </div>
      </Section>
      <Section title="Grid">
        <Swatches
          colors={GRID_COLORS}
          value={anchor.strokeColor}
          label="Grid"
          onPick={(strokeColor) => style({ strokeColor })}
        />
        <div className="jb-fp-row">
          <Btn icon={LineSolidIcon} title="Solid lines" on={anchor.strokeStyle === "solid"} onClick={() => style({ strokeStyle: "solid" })} />
          <Btn icon={LineDashedIcon} title="Dashed lines" on={anchor.strokeStyle === "dashed"} onClick={() => style({ strokeStyle: "dashed" })} />
          <Btn icon={LineDottedIcon} title="Dotted lines" on={anchor.strokeStyle === "dotted"} onClick={() => style({ strokeStyle: "dotted" })} />
          <span className="jb-fp-gap" />
          <Btn icon={ThinIcon} title="Thin lines" on={anchor.strokeWidth <= 1} onClick={() => style({ strokeWidth: 1 })} />
          <Btn icon={BoldLineIcon} title="Heavy lines" on={anchor.strokeWidth > 1} onClick={() => style({ strokeWidth: 2 })} />
        </div>
      </Section>
      <Section title="Corners">
        <div className="jb-fp-row">
          <Btn icon={SharpCornerIcon} title="Square corners" on={!round} onClick={() => style({ roundness: null })} />
          <Btn icon={RoundCornerIcon} title="Rounded corners" on={round} onClick={() => style({ roundness: { type: 3 } as any })} />
        </div>
      </Section>
      <Section title="Fill">
        <Swatches
          colors={FILLS}
          value={anchor.backgroundColor}
          label="Fill"
          onPick={(backgroundColor) => style({ backgroundColor })}
        />
      </Section>
      <Section title="Sort">
        <div className="jb-fp-row">
          <select
            value={data.sort?.colId ?? ""}
            title="Sort the rows by a column (the view only: formulas keep referring to rows by number)"
            onChange={(e) =>
              update((t) => ({
                ...t,
                sort: e.target.value
                  ? { colId: e.target.value, dir: t.sort?.dir ?? "asc" }
                  : null,
              }))
            }
          >
            <option value="">Not sorted</option>
            {data.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Btn
            icon={SortUpIcon}
            title="Ascending"
            on={data.sort?.dir === "asc"}
            disabled={!data.sort}
            onClick={() => update((t) => (t.sort ? { ...t, sort: { ...t.sort, dir: "asc" } } : t))}
          />
          <Btn
            icon={SortDownIcon}
            title="Descending"
            on={data.sort?.dir === "desc"}
            disabled={!data.sort}
            onClick={() => update((t) => (t.sort ? { ...t, sort: { ...t.sort, dir: "desc" } } : t))}
          />
        </div>
      </Section>
      <Section title="Filter">
        <Filters data={data} update={update} />
      </Section>
    </>
  );
};

const Filters = ({
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
    <div className="jb-fp-filters">
      {data.filters.map((f, i) => {
        const op = FILTER_OPS.find((o) => o.op === f.op)!;
        return (
          <div className="jb-fp-filter" key={i}>
            <select value={f.colId} onChange={(e) => set(i, { colId: e.target.value })}>
              {data.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={f.op} onChange={(e) => set(i, { op: e.target.value as FilterOp })}>
              {FILTER_OPS.map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            {op.needsValue && (
              <DraftInput value={f.value} onChange={(value) => set(i, { value })} />
            )}
            <button
              type="button"
              className="jb-fp-x"
              title="Remove this filter"
              onClick={() => update((t) => ({ ...t, filters: t.filters.filter((_, j) => j !== i) }))}
            >
              ×
            </button>
          </div>
        );
      })}
      <Btn
        icon={FilterIcon}
        title="Add a filter"
        onClick={() =>
          update((t) => ({
            ...t,
            filters: [...t.filters, { colId: t.columns[0].id, op: "contains", value: "" }],
          }))
        }
      />
    </div>
  );
};

/** a text box that applies its value once typing pauses */
const DraftInput = ({
  value,
  onChange,
  multiline,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) {
      return;
    }
    const id = window.setTimeout(() => onChange(draft), 400);
    return () => window.clearTimeout(id);
  }, [draft, value, onChange]);
  return multiline ? (
    <textarea
      value={draft}
      placeholder={placeholder}
      rows={4}
      onChange={(e) => setDraft(e.target.value)}
    />
  ) : (
    <input value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
  );
};

const CellTab = ({
  data,
  selection,
  update,
  onSelectionGone,
}: {
  data: TableData;
  selection: Selection;
  update: (f: (t: TableData) => TableData) => void;
  onSelectionGone: () => void;
}) => {
  const col = data.columns.find((c) => c.id === selection.colId);
  const focusStyle: CellStyle =
    (selection.rowId && data.styles[`${selection.rowId}:${selection.colId}`]) || {};
  const restyle = (patch: CellStyle) =>
    update((t) => setStyles(t, selection.cells, patch));
  const format = col?.format ?? "auto";
  const aligns: [Align, React.ReactNode, string][] = [
    ["left", AlignLeftIcon, "Align left"],
    ["center", AlignCenterIcon, "Align center"],
    ["right", AlignRightIcon, "Align right"],
  ];
  const sortedHere = data.sort?.colId === selection.colId ? data.sort.dir : null;

  return (
    <>
      <Section title="Format">
        <select
          data-ref="cell-format"
          value={format}
          onChange={(e) => {
            const f = e.target.value as ColumnFormat;
            update((t) =>
              selection.colIds.reduce(
                (acc, colId) =>
                  setColumn(acc, colId, {
                    format: f,
                    ...(f === "select" && !acc.columns.find((c) => c.id === colId)?.options
                      ? { options: ["Option 1", "Option 2", "Option 3"] }
                      : {}),
                  }),
                t,
              ),
            );
          }}
        >
          {FORMATS.map((f) => (
            <option key={f.format} value={f.format}>
              {f.label}
            </option>
          ))}
        </select>
        {format === "select" && col && (
          <DraftInput
            multiline
            placeholder="One choice per line"
            value={(col.options ?? []).join("\n")}
            onChange={(v) =>
              update((t) =>
                setColumn(t, col.id, {
                  options: v.split("\n").map((x) => x.trim()).filter(Boolean),
                }),
              )
            }
          />
        )}
      </Section>
      {selection.cells.length > 0 && (
        <Section title="Text">
          <div className="jb-fp-row">
            <Btn icon={BoldIcon} title="Bold" on={!!focusStyle.bold} onClick={() => restyle({ bold: !focusStyle.bold })} />
            <span className="jb-fp-gap" />
            {aligns.map(([a, icon, title]) => (
              <Btn key={a} icon={icon} title={title} on={focusStyle.align === a} onClick={() => restyle({ align: a })} />
            ))}
          </div>
          <Swatches
            colors={TEXT_COLORS}
            value={focusStyle.color ?? ""}
            label="Text color"
            onPick={(c) => restyle({ color: c || undefined })}
          />
        </Section>
      )}
      {selection.cells.length > 0 && (
        <Section title="Fill">
          <Swatches
            colors={CELL_FILLS}
            value={focusStyle.fill ?? ""}
            label="Fill"
            onPick={(c) => restyle({ fill: c || undefined })}
          />
        </Section>
      )}
      <Section title="Rows and columns">
        <div className="jb-fp-row">
          <Btn
            icon={RowAboveIcon}
            title="Insert a row above"
            disabled={!selection.rowId}
            onClick={() => selection.rowId && update((t) => addRowBefore(t, selection.rowId!))}
          />
          <Btn
            icon={RowAddIcon}
            title="Insert a row below"
            onClick={() => update((t) => addRow(t, selection.rowId ?? undefined))}
          />
          <Btn
            icon={RowRemoveIcon}
            title={selection.rowIds.length > 1 ? `Delete ${selection.rowIds.length} rows` : "Delete this row"}
            disabled={!selection.rowIds.length || selection.rowIds.length >= data.rows.length}
            onClick={() => {
              onSelectionGone();
              update((t) => deleteRows(t, selection.rowIds));
            }}
          />
          <span className="jb-fp-gap" />
          <Btn
            icon={ColumnLeftIcon}
            title="Insert a column to the left"
            onClick={() => {
              const i = data.columns.findIndex((c) => c.id === selection.colId);
              update((t) => addColumn(t, i > 0 ? data.columns[i - 1].id : null));
            }}
          />
          <Btn icon={ColumnAddIcon} title="Insert a column to the right" onClick={() => update((t) => addColumn(t, selection.colId))} />
          <Btn
            icon={ColumnRemoveIcon}
            title="Delete this column"
            disabled={data.columns.length <= 1}
            onClick={() => {
              onSelectionGone();
              update((t) => deleteColumn(t, selection.colId));
            }}
          />
        </div>
      </Section>
      <Section title="Sort by this column">
        <div className="jb-fp-row">
          <Btn icon={SortUpIcon} title="Ascending" on={sortedHere === "asc"} onClick={() => update((t) => ({ ...t, sort: { colId: selection.colId, dir: "asc" } }))} />
          <Btn icon={SortDownIcon} title="Descending" on={sortedHere === "desc"} onClick={() => update((t) => ({ ...t, sort: { colId: selection.colId, dir: "desc" } }))} />
          <Btn
            icon={FilterIcon}
            title="Filter by this column"
            onClick={() =>
              update((t) => ({
                ...t,
                filters: [...t.filters, { colId: selection.colId, op: "contains", value: "" }],
              }))
            }
          />
        </div>
      </Section>
    </>
  );
};
