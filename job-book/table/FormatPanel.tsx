// The table's format panel, where Excalidraw's own properties panel goes
// (it steps aside for it). Four tabs, after Numbers' Format sidebar:
//
//   Table    styles, header column, rows and columns, font size, outline,
//            gridlines, alternating rows, row height and column width,
//            sort and filter
//   Cell     data format, fill, inserting and deleting rows and columns
//   Text     bold, color, alignment both ways, wrapping
//   Arrange  layer order, size, position, lock
//
// Numbers' borders, footers, title and caption, and rich text styles
// don't carry over to a drawing tool; the rest is as close as it goes.

import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { useEffect, useState } from "react";

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ColumnAddIcon,
  ColumnLeftIcon,
  ColumnRemoveIcon,
  FilterIcon,
  RowAboveIcon,
  RowAddIcon,
  RowRemoveIcon,
  SortDownIcon,
  SortUpIcon,
} from "./icons";
import { fitWidth } from "./layout";
import {
  addColumn,
  addRow,
  addRowBefore,
  deleteColumn,
  deleteRows,
  FILTER_OPS,
  FORMATS,
  lookOf,
  setColumn,
  setColumnCount,
  setColumnWidth,
  setLook,
  setRowCount,
  setStyles,
  TABLE_STYLES,
} from "./model";
import { describeTable, isTablePart, styleTable, updateTable } from "./render";

import type {
  Align,
  CellStyle,
  ColumnFormat,
  FilterOp,
  TableData,
  TableLook,
  VAlign,
} from "./model";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

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

type Tab = "table" | "cell" | "text" | "arrange";
type Update = (f: (t: TableData) => TableData) => void;

// ---------------------------------------------------------------------------
// controls

const Btn = ({
  icon,
  title,
  on,
  onClick,
  disabled,
  wide,
}: {
  icon: React.ReactNode;
  title: string;
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  wide?: boolean;
}) => (
  <button
    type="button"
    className={`jb-fp-btn${on ? " is-on" : ""}${wide ? " is-wide" : ""}`}
    title={title}
    aria-label={title}
    aria-pressed={on}
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
  </button>
);

const Section = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => (
  <fieldset className="jb-fp-section">
    {title && <legend>{title}</legend>}
    {children}
  </fieldset>
);

/** a number with up and down, as Numbers' steppers */
const Stepper = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
  placeholder,
  title,
}: {
  value: number | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
}) => {
  const shown = value === null ? "" : String(Math.round(value * 10) / 10);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = (v: number) => {
    if (!isNaN(v)) {
      onChange(Math.min(max, Math.max(min, v)));
    }
  };
  return (
    <div
      className={`jb-fp-stepper${disabled ? " is-disabled" : ""}`}
      title={title}
    >
      <input
        type="number"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== shown && draft !== "" && commit(Number(draft))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(Number(draft));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unit && <span className="jb-fp-unit">{unit}</span>}
      <div className="jb-fp-arrows">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="More"
          onClick={() => commit((value ?? Number(placeholder) ?? 0) + step)}
        >
          <svg viewBox="0 0 10 6" width="8" height="5" aria-hidden="true">
            <path d="M1 5l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label="Less"
          onClick={() => commit((value ?? Number(placeholder) ?? 0) - step)}
        >
          <svg viewBox="0 0 10 6" width="8" height="5" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>
    </div>
  );
};

/** a color well: the color, and the system picker under it */
const ColorWell = ({
  value,
  onChange,
  title,
  none,
}: {
  value: string | null | undefined;
  onChange: (c: string | null) => void;
  title: string;
  /** offer "None" (a fill that can be empty) */
  none?: boolean;
}) => {
  const empty = !value || value === "transparent";
  return (
    <div className="jb-fp-wellrow">
      <label className={`jb-fp-well${empty ? " is-empty" : ""}`} title={title}>
        <span style={{ background: empty ? undefined : value! }} />
        <input
          type="color"
          value={empty ? "#ffffff" : value!.slice(0, 7)}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      {none && (
        <button
          type="button"
          className="jb-fp-text-btn"
          disabled={empty}
          onClick={() => onChange(null)}
        >
          None
        </button>
      )}
    </div>
  );
};

const Check = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) => (
  <label className="jb-fp-check">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
    {children}
  </label>
);

const Row = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="jb-fp-line">
    <span>{label}</span>
    <div>{children}</div>
  </div>
);

// small icons for this panel

const icon = (d: string, extra?: React.ReactNode) => (
  <svg
    viewBox="0 0 20 20"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
    {extra}
  </svg>
);
const GridHIcon = icon("M3 4h14v12H3zM3 8h14M3 12h14");
const GridVIcon = icon("M3 4h14v12H3zM7.7 4v12M12.3 4v12");
const VTopIcon = icon("M4 3.5h12M10 7v9M7 10l3-3 3 3");
const VMiddleIcon = icon(
  "M4 10h12M10 2.5v5M10 12.5v5M8 5.5l2 2 2-2M8 14.5l2-2 2 2",
);
const VBottomIcon = icon("M4 16.5h12M10 4v9M7 10l3 3 3-3");
const FrontIcon = icon(
  "M7 3h10v10H7z",
  <path d="M3 7v10h10" strokeDasharray="2 2" />,
);
const BackIcon = icon(
  "M3 7h10v10H3z",
  <path d="M7 3h10v10" strokeDasharray="2 2" />,
);
const ForwardIcon = icon("M10 15V5M6 9l4-4 4 4");
const BackwardIcon = icon("M10 5v10M6 11l4 4 4-4");
const LockIcon = icon("M5.5 9h9v7.5h-9zM7.5 9V6.5a2.5 2.5 0 0 1 5 0V9");
const UnlockIcon = icon("M5.5 9h9v7.5h-9zM7.5 9V6.5a2.5 2.5 0 0 1 4.8-1");

// ---------------------------------------------------------------------------

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
  const [tab, setTab] = useState<Tab>(selection ? "cell" : "table");
  useEffect(() => {
    // cells picked: Cell; the whole table: Table (Arrange stays put)
    setTab((t) =>
      selection
        ? t === "table"
          ? "cell"
          : t
        : t === "cell" || t === "text"
        ? "table"
        : t,
    );
  }, [!!selection]);
  const update: Update = (f) => updateTable(api, anchor.id, f);
  const locked = !!anchor.locked;
  const tabs: [Tab, string][] = [
    ["table", "Table"],
    ["cell", "Cell"],
    ["text", "Text"],
    ["arrange", "Arrange"],
  ];

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
        {tabs.map(([t, label]) => {
          const needsCells = t === "cell" || t === "text";
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? "is-on" : ""}
              disabled={needsCells && !selection}
              title={needsCells && !selection ? "Select cells" : undefined}
              onClick={() => setTab(t)}
            >
              {label}
            </button>
          );
        })}
      </div>

      <fieldset className="jb-fp-body" disabled={locked && tab !== "arrange"}>
        {tab === "table" && (
          <TableTab
            api={api}
            anchor={anchor}
            data={data}
            selection={selection}
            update={update}
          />
        )}
        {tab === "cell" && selection && (
          <CellTab
            data={data}
            selection={selection}
            update={update}
            onSelectionGone={onSelectionGone}
          />
        )}
        {tab === "text" && selection && (
          <TextTab data={data} selection={selection} update={update} />
        )}
        {tab === "arrange" && <ArrangeTab api={api} anchor={anchor} />}
      </fieldset>
    </div>
  );
};

// ---------------------------------------------------------------------------

/** a table style's thumbnail: a little table in its header color */
const StyleTile = ({
  look,
  on,
  onClick,
  name,
}: {
  look: TableLook;
  on: boolean;
  onClick: () => void;
  name: string;
}) => {
  const filled = look.header && look.header !== "transparent";
  return (
    <button
      type="button"
      className={`jb-fp-style${on ? " is-on" : ""}`}
      title={name}
      onClick={onClick}
    >
      <svg viewBox="0 0 48 30" width="48" height="30" aria-hidden="true">
        <rect x="0.5" y="0.5" width="47" height="29" fill="#fff" stroke="#adb5bd" />
        {filled && (
          <rect x="0.5" y="0.5" width="47" height="7" fill={look.header} />
        )}
        {filled && look.headerColumn && (
          <rect x="0.5" y="7.5" width="12" height="22" fill={look.header} />
        )}
        <path
          d="M0.5 7.5h47M0.5 15h47M0.5 22.5h47M12.5 0.5v29M24.5 0.5v29M36.5 0.5v29"
          stroke="#ced4da"
          strokeWidth="0.75"
        />
      </svg>
    </button>
  );
};

const TableTab = ({
  api,
  anchor,
  data,
  selection,
  update,
}: {
  api: ExcalidrawImperativeAPI;
  anchor: ExcalidrawElement;
  data: TableData;
  selection: Selection | null;
  update: Update;
}) => {
  const look = lookOf(data);
  const style = (patch: Parameters<typeof styleTable>[2]) =>
    styleTable(api, anchor.id, patch);
  const setLook$ = (patch: TableLook) => update((t) => setLook(t, patch));
  const cols = selection?.colIds ?? [];
  const colWidth = cols.length
    ? data.columns.find((c) => c.id === cols[0])?.width ?? null
    : null;
  const shown = describeTable(anchor);
  const naturalRow = shown
    ? Math.round(
        Math.min(
          shown.layout.headerHeight,
          ...shown.layout.rows.map((r) => r.height),
        ),
      )
    : 0;

  return (
    <>
      <Section title="Table styles">
        <div className="jb-fp-styles">
          {TABLE_STYLES.map((s) => (
            <StyleTile
              key={s.name}
              name={s.name}
              look={s.look}
              on={
                look.header === s.look.header &&
                look.headerColumn === !!s.look.headerColumn
              }
              onClick={() => setLook$(s.look)}
            />
          ))}
        </div>
      </Section>

      <Section title="Headers">
        <Check
          checked={look.headerColumn}
          onChange={(v) => setLook$({ headerColumn: v })}
        >
          Header column
        </Check>
        {look.header !== "transparent" && (
          <Row label="Header color">
            <ColorWell
              value={look.header}
              title="Header color"
              onChange={(c) => setLook$({ header: c ?? "transparent" })}
            />
          </Row>
        )}
      </Section>

      <Section>
        <Row label="Rows">
          <Stepper
            value={data.rows.length}
            min={1}
            max={500}
            onChange={(n) => update((t) => setRowCount(t, n))}
          />
        </Row>
        <Row label="Columns">
          <Stepper
            value={data.columns.length}
            min={1}
            max={52}
            onChange={(n) => update((t) => setColumnCount(t, n))}
          />
        </Row>
      </Section>

      <Section>
        <Row label="Table font size">
          <div className="jb-fp-seg">
            <button
              type="button"
              title="Smaller"
              disabled={look.fontSize <= 9}
              onClick={() => setLook$({ fontSize: look.fontSize - 1 })}
            >
              <span style={{ fontSize: 10 }}>A</span>
            </button>
            <button
              type="button"
              title="Larger"
              disabled={look.fontSize >= 40}
              onClick={() => setLook$({ fontSize: look.fontSize + 1 })}
            >
              <span style={{ fontSize: 15 }}>A</span>
            </button>
          </div>
        </Row>
      </Section>

      <Section title="Table outline">
        <div className="jb-fp-row">
          <select
            value={anchor.strokeStyle}
            title="Line style"
            onChange={(e) => style({ strokeStyle: e.target.value as any })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>
          <ColorWell
            value={anchor.strokeColor}
            title="Line color"
            onChange={(c) => style({ strokeColor: c ?? "#868e96" })}
          />
          <Stepper
            value={anchor.strokeWidth}
            min={0.5}
            max={6}
            step={0.5}
            unit="pt"
            title="Line weight"
            onChange={(v) => style({ strokeWidth: v })}
          />
        </div>
      </Section>

      <Section title="Gridlines">
        <div className="jb-fp-seg">
          <Btn
            icon={GridHIcon}
            title="Lines between rows"
            on={look.gridH}
            onClick={() => setLook$({ gridH: !look.gridH })}
          />
          <Btn
            icon={GridVIcon}
            title="Lines between columns"
            on={look.gridV}
            onClick={() => setLook$({ gridV: !look.gridV })}
          />
        </div>
      </Section>

      <Section>
        <div className="jb-fp-line">
          <Check
            checked={!!look.band}
            onChange={(v) => setLook$({ band: v ? "#f1f3f5" : null })}
          >
            Alternating row color
          </Check>
          {look.band && (
            <ColorWell
              value={look.band}
              title="Row color"
              onChange={(c) => setLook$({ band: c })}
            />
          )}
        </div>
      </Section>

      <Section title="Row and column size">
        <Row label="Height">
          <div className="jb-fp-row">
            <Stepper
              value={look.rowHeight || null}
              placeholder={String(naturalRow)}
              min={0}
              max={400}
              unit="px"
              title="The least each row is tall"
              onChange={(v) => setLook$({ rowHeight: v })}
            />
            <button
              type="button"
              className="jb-fp-text-btn"
              disabled={!look.rowHeight}
              title="As tall as their text"
              onClick={() => setLook$({ rowHeight: 0 })}
            >
              Fit
            </button>
          </div>
        </Row>
        <Row label="Width">
          <div className="jb-fp-row">
            <Stepper
              value={colWidth}
              disabled={!cols.length}
              min={40}
              max={2000}
              unit="px"
              title={
                cols.length
                  ? "The selected columns' width"
                  : "Select cells to size their columns"
              }
              onChange={(v) =>
                update((t) =>
                  cols.reduce((acc, id) => setColumnWidth(acc, id, v), t),
                )
              }
            />
            <button
              type="button"
              className="jb-fp-text-btn"
              disabled={!cols.length || !shown}
              title="As wide as their widest cell"
              onClick={() => {
                if (!shown) {
                  return;
                }
                update((t) =>
                  cols.reduce((acc, id) => {
                    const texts = [
                      t.columns.find((c) => c.id === id)?.name ?? "",
                      ...shown.layout.cells
                        .filter((c) => c.colId === id)
                        .map((c) => c.shown),
                    ];
                    return setColumnWidth(
                      acc,
                      id,
                      fitWidth(texts, look.fontSize),
                    );
                  }, t),
                );
              }}
            >
              Fit
            </button>
          </div>
        </Row>
      </Section>

      <Section title="Sort">
        <div className="jb-fp-row">
          <select
            value={data.sort?.colId ?? ""}
            title="Sorting changes the view only: formulas keep referring to rows by number"
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
            onClick={() =>
              update((t) =>
                t.sort ? { ...t, sort: { ...t.sort, dir: "asc" } } : t,
              )
            }
          />
          <Btn
            icon={SortDownIcon}
            title="Descending"
            on={data.sort?.dir === "desc"}
            disabled={!data.sort}
            onClick={() =>
              update((t) =>
                t.sort ? { ...t, sort: { ...t.sort, dir: "desc" } } : t,
              )
            }
          />
        </div>
      </Section>
      <Section title="Filter">
        <Filters data={data} update={update} />
      </Section>
    </>
  );
};

const Filters = ({ data, update }: { data: TableData; update: Update }) => {
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
              <DraftInput
                value={f.value}
                onChange={(value) => set(i, { value })}
              />
            )}
            <button
              type="button"
              className="jb-fp-x"
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
      <Btn
        icon={FilterIcon}
        title="Add a filter"
        onClick={() =>
          update((t) => ({
            ...t,
            filters: [
              ...t.filters,
              { colId: t.columns[0].id, op: "contains", value: "" },
            ],
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
    <input
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
};

// ---------------------------------------------------------------------------

const focusStyleOf = (data: TableData, selection: Selection): CellStyle =>
  (selection.rowId && data.styles[`${selection.rowId}:${selection.colId}`]) ||
  {};

const CellTab = ({
  data,
  selection,
  update,
  onSelectionGone,
}: {
  data: TableData;
  selection: Selection;
  update: Update;
  onSelectionGone: () => void;
}) => {
  const col = data.columns.find((c) => c.id === selection.colId);
  const focus = focusStyleOf(data, selection);
  const format = col?.format ?? "auto";
  const restyle = (patch: CellStyle) =>
    update((t) => setStyles(t, selection.cells, patch));

  return (
    <>
      <Section title="Data format">
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
                    ...(f === "select" &&
                    !acc.columns.find((c) => c.id === colId)?.options
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
                  options: v
                    .split("\n")
                    .map((x) => x.trim())
                    .filter(Boolean),
                }),
              )
            }
          />
        )}
      </Section>

      {selection.cells.length > 0 && (
        <Section title="Fill">
          <ColorWell
            value={focus.fill}
            title="Cell fill"
            none
            onChange={(c) => restyle({ fill: c ?? undefined })}
          />
        </Section>
      )}

      <Section title="Rows and columns">
        <div className="jb-fp-row">
          <Btn
            icon={RowAboveIcon}
            title="Insert a row above"
            disabled={!selection.rowId}
            onClick={() =>
              selection.rowId &&
              update((t) => addRowBefore(t, selection.rowId!))
            }
          />
          <Btn
            icon={RowAddIcon}
            title="Insert a row below"
            onClick={() => update((t) => addRow(t, selection.rowId ?? undefined))}
          />
          <Btn
            icon={RowRemoveIcon}
            title={
              selection.rowIds.length > 1
                ? `Delete ${selection.rowIds.length} rows`
                : "Delete this row"
            }
            disabled={
              !selection.rowIds.length ||
              selection.rowIds.length >= data.rows.length
            }
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
          <Btn
            icon={ColumnAddIcon}
            title="Insert a column to the right"
            onClick={() => update((t) => addColumn(t, selection.colId))}
          />
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

      <Section title="Sort and filter by this column">
        <div className="jb-fp-row">
          <Btn
            icon={SortUpIcon}
            title="Ascending"
            on={data.sort?.colId === selection.colId && data.sort.dir === "asc"}
            onClick={() =>
              update((t) => ({
                ...t,
                sort: { colId: selection.colId, dir: "asc" },
              }))
            }
          />
          <Btn
            icon={SortDownIcon}
            title="Descending"
            on={
              data.sort?.colId === selection.colId && data.sort.dir === "desc"
            }
            onClick={() =>
              update((t) => ({
                ...t,
                sort: { colId: selection.colId, dir: "desc" },
              }))
            }
          />
          <Btn
            icon={FilterIcon}
            title="Filter by this column"
            onClick={() =>
              update((t) => ({
                ...t,
                filters: [
                  ...t.filters,
                  { colId: selection.colId, op: "contains", value: "" },
                ],
              }))
            }
          />
        </div>
      </Section>
    </>
  );
};

const TextTab = ({
  data,
  selection,
  update,
}: {
  data: TableData;
  selection: Selection;
  update: Update;
}) => {
  const focus = focusStyleOf(data, selection);
  const look = lookOf(data);
  const restyle = (patch: CellStyle) =>
    update((t) => setStyles(t, selection.cells, patch));
  const none = !selection.cells.length;
  const aligns: [Align, React.ReactNode, string][] = [
    ["left", AlignLeftIcon, "Align left"],
    ["center", AlignCenterIcon, "Align center"],
    ["right", AlignRightIcon, "Align right"],
  ];
  const valigns: [VAlign, React.ReactNode, string][] = [
    ["top", VTopIcon, "Top"],
    ["middle", VMiddleIcon, "Middle"],
    ["bottom", VBottomIcon, "Bottom"],
  ];
  return (
    <>
      <Section title="Font">
        <div className="jb-fp-row">
          <span className="jb-fp-fontname">Helvetica</span>
          <Stepper
            value={look.fontSize}
            min={9}
            max={40}
            unit="pt"
            title="The table's font size"
            onChange={(v) => update((t) => setLook(t, { fontSize: v }))}
          />
        </div>
        <div className="jb-fp-row">
          <Btn
            icon={BoldIcon}
            title="Bold"
            on={!!focus.bold}
            disabled={none}
            onClick={() => restyle({ bold: !focus.bold })}
          />
        </div>
      </Section>
      <Section>
        <Row label="Text color">
          <ColorWell
            value={focus.color ?? "#1e1e1e"}
            title="Text color"
            onChange={(c) => restyle({ color: c ?? undefined })}
          />
        </Row>
      </Section>
      <Section title="Alignment">
        <div className="jb-fp-seg">
          {aligns.map(([a, ic, title]) => (
            <Btn
              key={a}
              icon={ic}
              title={title}
              disabled={none}
              on={focus.align === a}
              onClick={() => restyle({ align: a })}
            />
          ))}
        </div>
        <div className="jb-fp-seg">
          {valigns.map(([a, ic, title]) => (
            <Btn
              key={a}
              icon={ic}
              title={title}
              disabled={none}
              on={(focus.valign ?? "top") === a}
              onClick={() => restyle({ valign: a })}
            />
          ))}
        </div>
        <Check
          checked={focus.wrap !== false}
          onChange={(v) => restyle({ wrap: v ? undefined : false })}
        >
          Wrap text in cell
        </Check>
      </Section>
    </>
  );
};

// ---------------------------------------------------------------------------

const ArrangeTab = ({
  api,
  anchor,
}: {
  api: ExcalidrawImperativeAPI;
  anchor: ExcalidrawElement;
}) => {
  const mine = (el: ExcalidrawElement) =>
    el.id === anchor.id ||
    (isTablePart(el) &&
      (el.customData as any)?.jbTablePart?.anchorId === anchor.id);

  /** the table (its anchor and its drawing) moved in the stack */
  const restack = (where: "front" | "back" | "forward" | "backward") => {
    const all = [...api.getSceneElementsIncludingDeleted()];
    const group = all.filter(mine);
    const rest = all.filter((el) => !mine(el));
    const live = rest.filter((el) => !el.isDeleted);
    let at: number;
    if (where === "front") {
      at = rest.length;
    } else if (where === "back") {
      at = 0;
    } else {
      // one thing further up, or down, the stack
      const first = all.findIndex(mine);
      const below = all
        .slice(0, first)
        .filter((el) => !mine(el) && !el.isDeleted).length;
      if (where === "forward") {
        const next = live[below];
        at = next ? rest.indexOf(next) + 1 : rest.length;
      } else {
        const prev = live[below - 1];
        at = prev ? rest.indexOf(prev) : 0;
      }
    }
    rest.splice(at, 0, ...group);
    api.updateScene({
      elements: rest,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const setAnchor = (patch: Partial<ExcalidrawElement>) =>
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((el) =>
          el.id === anchor.id ? newElementWith(el, patch as any) : el,
        ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });

  const locked = !!anchor.locked;
  return (
    <>
      <Section>
        <div className="jb-fp-stack">
          <label>
            <Btn icon={BackIcon} title="Send to back" disabled={locked} onClick={() => restack("back")} wide />
            <span>Back</span>
          </label>
          <label>
            <Btn icon={FrontIcon} title="Bring to front" disabled={locked} onClick={() => restack("front")} wide />
            <span>Front</span>
          </label>
          <label>
            <Btn icon={BackwardIcon} title="Send backward" disabled={locked} onClick={() => restack("backward")} wide />
            <span>Backward</span>
          </label>
          <label>
            <Btn icon={ForwardIcon} title="Bring forward" disabled={locked} onClick={() => restack("forward")} wide />
            <span>Forward</span>
          </label>
        </div>
      </Section>
      <Section title="Size">
        <div className="jb-fp-pair">
          <label>
            <Stepper
              value={Math.round(anchor.width)}
              min={80}
              max={20000}
              step={10}
              unit="px"
              title="The columns scale to it"
              disabled={locked}
              onChange={(v) => setAnchor({ width: v })}
            />
            <span>Width</span>
          </label>
          <label>
            <Stepper
              value={Math.round(anchor.height)}
              min={0}
              max={0}
              unit="px"
              disabled
              title="Follows the rows"
              onChange={() => {}}
            />
            <span>Height</span>
          </label>
        </div>
      </Section>
      <Section title="Position">
        <div className="jb-fp-pair">
          <label>
            <Stepper
              value={Math.round(anchor.x)}
              min={-1e6}
              max={1e6}
              step={10}
              disabled={locked}
              onChange={(v) => setAnchor({ x: v })}
            />
            <span>X</span>
          </label>
          <label>
            <Stepper
              value={Math.round(anchor.y)}
              min={-1e6}
              max={1e6}
              step={10}
              disabled={locked}
              onChange={(v) => setAnchor({ y: v })}
            />
            <span>Y</span>
          </label>
        </div>
      </Section>
      <Section>
        <div className="jb-fp-pair">
          <Btn
            icon={LockIcon}
            title="Lock"
            disabled={locked}
            onClick={() => setAnchor({ locked: true })}
            wide
          />
          <Btn
            icon={UnlockIcon}
            title="Unlock"
            disabled={!locked}
            onClick={() => setAnchor({ locked: false })}
            wide
          />
        </div>
      </Section>
    </>
  );
};
