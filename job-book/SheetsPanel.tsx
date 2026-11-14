// The sheet index: every frame on the board as a sheet, grouped by
// discipline, the way a drawing set's cover sheet lists it. Click a sheet to
// go to it; double-click to rename; drag within a discipline to reorder,
// which renumbers that discipline. The selected sheet's data is edited at
// the bottom. Above it: adding things (a sheet, a PDF, a table) and the
// board's own settings.

import { Sidebar, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatLength,
  fromUnits,
  matchPaper,
  paperById,
  paperLabel,
  paperPx,
  PAPERS,
} from "./paper";
import { useSettings } from "./settings";
import { useSheetTableView } from "./SheetTable";
import { useSheets } from "./useSheets";
import {
  addSheet,
  DISCIPLINES,
  disciplineOf,
  getGroups,
  getSheets,
  goToSheet,
  isSheetFrame,
  sheetColor,
  sortSheets,
  STATUSES,
  statusOf,
  updateSheet,
  updateSheets,
  type Sheet,
} from "./sheets";

import type { Orientation } from "./paper";
import type { ColorBy } from "./settings";
import type { ExcalidrawElement } from "@excalidraw/element/types";

export const SHEETS_SIDEBAR = "sheets";

const Field = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <label className="jb-field">
    <span>{label}</span>
    {children}
  </label>
);

/** a text input that commits on blur / Enter, so typing is one undo step */
const CommitInput = ({
  value,
  onCommit,
  ...rest
}: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value">) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
};

/** every paper, grouped (US, Architectural, ISO, Poster) */
const PaperOptions = ({ units }: { units: "in" | "mm" }) => {
  const groups = [...new Set(PAPERS.map((p) => p.group))];
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {PAPERS.filter((p) => p.group === g).map((p) => (
            <option key={p.id} value={p.id}>
              {paperLabel(p, units)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
};

/** a phase's color: click it to pick another, for this board */
const ColorChip = ({
  code,
  name,
  color,
  canEdit,
}: {
  code: string;
  name: string;
  color: string;
  canEdit: boolean;
}) => {
  const { settings, update } = useSettings();
  const timer = useRef<number | undefined>(undefined);
  if (!canEdit) {
    return <span className="jb-chip" style={{ background: color }} />;
  }
  return (
    <label className="jb-chip-pick" title={`${name}'s color: click to change`}>
      <span className="jb-chip" style={{ background: color }} />
      <input
        type="color"
        value={color}
        data-ref={`color.${code}`}
        onChange={(e) => {
          // the picker reports every step of a drag; set the color once it rests
          const value = e.target.value;
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(
            () => update({ colors: { ...settings.colors, [code]: value } }),
            200,
          );
        }}
      />
    </label>
  );
};

const SheetEditor = ({
  sheet,
  sheets,
  canEdit,
}: {
  sheet: Sheet;
  sheets: Sheet[];
  canEdit: boolean;
}) => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  if (!api) {
    return null;
  }
  const { colorBy, units } = settings;
  const id = sheet.frame.id;
  const discipline = disciplineOf(sheet.data.discipline);
  const status = statusOf(sheet.data.status);
  const { width, height } = sheet.frame;
  const paper = matchPaper(width, height);
  const orientation: Orientation = width >= height ? "landscape" : "portrait";
  const resize = (w: number, h: number) =>
    updateSheet(api, id, { size: { width: w, height: h } }, colorBy);

  return (
    <div className="jb-editor" data-ref="sheet-editor">
      <div className="jb-editor-head">
        <span
          className="jb-chip"
          style={{ background: sheetColor(sheet.data, colorBy) }}
        />
        {sheet.data.code || "Sheet"}
        <span className="jb-count">page {sheet.data.number || "—"}</span>
      </div>
      <fieldset disabled={!canEdit}>
        <Field label="Title">
          <CommitInput
            data-ref="sheet-title"
            value={sheet.frame.name ?? ""}
            placeholder="Untitled sheet"
            onCommit={(title) => updateSheet(api, id, { title }, colorBy)}
          />
        </Field>
        <div className="jb-row">
          <Field label="Rev">
            <CommitInput
              data-ref="sheet-revision"
              value={sheet.data.revision}
              onCommit={(revision) =>
                updateSheet(api, id, { patch: { revision } }, colorBy)
              }
            />
          </Field>
          <Field label="Issued">
            <input
              type="date"
              value={sheet.data.issued}
              onChange={(e) =>
                updateSheet(
                  api,
                  id,
                  { patch: { issued: e.target.value } },
                  colorBy,
                )
              }
            />
          </Field>
        </div>
        <div className="jb-row">
          <Field label="Phase">
            <select
              data-ref="sheet-discipline"
              value={discipline.code}
              onChange={(e) =>
                // its page follows from its place in the new phase
                updateSheet(
                  api,
                  id,
                  { patch: { discipline: e.target.value, order: undefined } },
                  colorBy,
                )
              }
            >
              {getGroups().map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              data-ref="sheet-status"
              value={status.code}
              onChange={(e) =>
                updateSheet(
                  api,
                  id,
                  { patch: { status: e.target.value } },
                  colorBy,
                )
              }
            >
              {STATUSES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Paper">
          <select
            data-ref="sheet-paper"
            disabled={!!sheet.data.sizeLocked}
            value={paper?.paper.id ?? "custom"}
            onChange={(e) => {
              if (e.target.value !== "custom") {
                const size = paperPx(e.target.value, orientation);
                resize(size.width, size.height);
              }
            }}
          >
            <option value="custom">Custom</option>
            <PaperOptions units={units} />
          </select>
        </Field>
        <Field label="Orientation">
          <select
            data-ref="sheet-orientation"
            disabled={!!sheet.data.sizeLocked}
            value={orientation}
            onChange={(e) => {
              if (e.target.value !== orientation) {
                resize(height, width);
              }
            }}
          >
            <option value="landscape">landscape</option>
            <option value="portrait">portrait</option>
          </select>
        </Field>
        <div className="jb-row jb-size">
          <Field label={`W (${units})`}>
            <CommitInput
              data-ref="sheet-width"
              disabled={!!sheet.data.sizeLocked}
              inputMode="decimal"
              value={formatLength(width, units)}
              onCommit={(v) => {
                const n = parseFloat(v);
                if (n > 0) {
                  resize(fromUnits(n, units), height);
                }
              }}
            />
          </Field>
          <Field label={`H (${units})`}>
            <CommitInput
              data-ref="sheet-height"
              disabled={!!sheet.data.sizeLocked}
              inputMode="decimal"
              value={formatLength(height, units)}
              onCommit={(v) => {
                const n = parseFloat(v);
                if (n > 0) {
                  resize(width, fromUnits(n, units));
                }
              }}
            />
          </Field>
          <button
            type="button"
            data-ref="sheet-lock-size"
            className={`jb-ghost${sheet.data.sizeLocked ? " is-on" : ""}`}
            aria-pressed={!!sheet.data.sizeLocked}
            title={
              sheet.data.sizeLocked
                ? "Size locked: resizing springs back. Click to unlock."
                : "Lock the sheet's size, so it can be moved but not resized"
            }
            onClick={() =>
              updateSheet(
                api,
                id,
                { patch: { sizeLocked: !sheet.data.sizeLocked } },
                colorBy,
              )
            }
          >
            {sheet.data.sizeLocked ? "🔒" : "🔓"}
          </button>
        </div>
        <label className="jb-check">
          <input
            type="checkbox"
            data-ref="sheet-titleblock"
            checked={sheet.data.titleBlock}
            onChange={(e) =>
              updateSheet(
                api,
                id,
                { patch: { titleBlock: e.target.checked } },
                colorBy,
              )
            }
          />
          Title block on this sheet
        </label>
      </fieldset>
    </div>
  );
};

const SheetRow = ({
  sheet,
  active,
  canEdit,
  onDragStart,
  onDrop,
}: {
  sheet: Sheet;
  active: boolean;
  canEdit: boolean;
  onDragStart: () => void;
  onDrop: () => void;
}) => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  const status = statusOf(sheet.data.status);

  return (
    <li
      className={`jb-sheet${active ? " is-active" : ""}${
        over ? " is-over" : ""
      }`}
      data-ref={`sheet.${sheet.data.number || sheet.frame.id}`}
      draggable={canEdit && !renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop();
      }}
      onClick={() => api && goToSheet(api, sheet.frame.id)}
      onDoubleClick={() => canEdit && setRenaming(true)}
      title="Click to go to the sheet. Double-click to rename. Drag to reorder."
    >
      <span
        className="jb-bar"
        style={{ background: sheetColor(sheet.data, settings.colorBy) }}
      />
      <span className="jb-num" title={`Page ${sheet.data.number || "—"}`}>
        {sheet.data.code || sheet.data.number || "—"}
      </span>
      {renaming ? (
        <CommitInput
          autoFocus
          className="jb-rename"
          value={sheet.frame.name ?? ""}
          onClick={(e) => e.stopPropagation()}
          onCommit={(title) =>
            api && updateSheet(api, sheet.frame.id, { title }, settings.colorBy)
          }
          onBlurCapture={() => setRenaming(false)}
        />
      ) : (
        <span className="jb-title">{sheet.title}</span>
      )}
      {sheet.data.status !== "draft" && (
        <span className="jb-tag" style={{ color: status.color }}>
          {status.name}
        </span>
      )}
      {sheet.data.revision && sheet.data.revision !== "0" && (
        <span className="jb-rev">R{sheet.data.revision}</span>
      )}
    </li>
  );
};

const SheetPlusIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11.5 2.5H5a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 5 17.5h4M11.5 2.5l4 4M11.5 2.5v4h4M15.5 6.5V10M15 13v5M12.5 15.5h5" />
  </svg>
);
const GroupPlusIcon = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 5.5v9A1.5 1.5 0 0 0 4 16h6M2.5 5.5A1.5 1.5 0 0 1 4 4h3.5l1.5 2h7a1.5 1.5 0 0 1 1.5 1.5V10M15 12.5v5M12.5 15h5" />
  </svg>
);

/** a group code: capitals and digits, short, like a drawing set's */
const cleanCode = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

/** the board's groups, to change and save with it */
const useGroups = () => {
  const { settings, update } = useSettings();
  const api = useExcalidrawAPI();
  const list = getGroups().map(({ code, name, color }) => ({ code, name, color }));
  const save = (next: typeof list) => update({ groups: next });
  return {
    list,
    rename: (code: string, name: string) =>
      name.trim() &&
      save(list.map((g) => (g.code === code ? { ...g, name: name.trim() } : g))),
    recode: (code: string, raw: string) => {
      const next = cleanCode(raw);
      if (!next || next === code || list.some((g) => g.code === next)) {
        return false;
      }
      // the sheets in the group, and its color, move to the new code
      if (api) {
        updateSheets(
          api,
          new Map(
            getSheets(api.getSceneElements())
              .filter((s) => disciplineOf(s.data.discipline).code === code)
              .map((s) => [s.frame.id, { patch: { discipline: next } }]),
          ),
          settings.colorBy,
        );
      }
      const colors = { ...settings.colors };
      if (colors[code]) {
        colors[next] = colors[code];
        delete colors[code];
      }
      update({
        groups: list.map((g) => (g.code === code ? { ...g, code: next } : g)),
        colors,
      });
      return true;
    },
    add: (name: string, raw: string) => {
      const code = cleanCode(raw);
      if (!name.trim() || !code || list.some((g) => g.code === code)) {
        return false;
      }
      const palette = ["#be4bdb", "#20c997", "#fab005", "#7950f2", "#e64980"];
      save([
        ...list,
        { code, name: name.trim(), color: palette[list.length % palette.length] },
      ]);
      return true;
    },
    remove: (code: string) => save(list.filter((g) => g.code !== code)),
  };
};

/** a short code from a name: "Site Visits" → "SV" */
const suggestCode = (name: string, taken: string[]) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  let code = cleanCode(
    words.length > 1 ? words.map((w) => w[0]).join("") : words[0]?.slice(0, 3) ?? "",
  );
  let i = 2;
  const base = code;
  while (code && taken.includes(code)) {
    code = `${base.slice(0, 3)}${i++}`;
  }
  return code;
};

/** the small menus under the panel's + Sheet and + Group buttons */
const AddMenus = () => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const groups = useGroups();
  const [open, setOpen] = useState<"sheet" | "group" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeTouched, setCodeTouched] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  if (!api) {
    return null;
  }
  const size = paperPx(settings.paper, settings.orientation);
  const addTo = (discipline: string) => {
    setOpen(null);
    const id = addSheet(api, discipline, settings);
    window.setTimeout(() => goToSheet(api, id));
  };
  const addGroup = () => {
    if (groups.add(name, code)) {
      setOpen(null);
      setName("");
      setCode("");
      setCodeTouched(false);
    }
  };

  return (
    <div className="jb-addmenus" ref={ref}>
      <button
        type="button"
        className={`jb-icon-btn${open === "sheet" ? " is-on" : ""}`}
        data-ref="add-sheet"
        title={`New sheet: ${paperById(settings.paper).name}, ${settings.orientation}, ${formatLength(
          size.width,
          settings.units,
        )} × ${formatLength(size.height, settings.units)} ${settings.units}`}
        onClick={() => setOpen(open === "sheet" ? null : "sheet")}
      >
        {SheetPlusIcon}
      </button>
      <button
        type="button"
        className={`jb-icon-btn${open === "group" ? " is-on" : ""}`}
        data-ref="add-group"
        title="New group"
        onClick={() => setOpen(open === "group" ? null : "group")}
      >
        {GroupPlusIcon}
      </button>
      {open === "sheet" && (
        <div className="jb-pop" role="menu" data-ref="add-sheet-menu">
          {groups.list.map((g) => (
            <button
              type="button"
              role="menuitem"
              key={g.code}
              onClick={() => addTo(g.code)}
            >
              <span className="jb-chip" style={{ background: g.color }} />
              <span className="jb-pop-code">{g.code}</span>
              {g.name}
            </button>
          ))}
        </div>
      )}
      {open === "group" && (
        <form
          className="jb-pop jb-pop-form"
          data-ref="add-group-menu"
          onSubmit={(e) => {
            e.preventDefault();
            addGroup();
          }}
        >
          <input
            autoFocus
            placeholder="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!codeTouched) {
                setCode(suggestCode(e.target.value, groups.list.map((g) => g.code)));
              }
            }}
          />
          <input
            className="jb-pop-codein"
            placeholder="Code"
            value={code}
            title="The group's code starts its sheet codes, as in OV-101"
            onChange={(e) => {
              setCodeTouched(true);
              setCode(cleanCode(e.target.value));
            }}
          />
          <button
            type="submit"
            disabled={
              !name.trim() || !code || groups.list.some((g) => g.code === code)
            }
            title={
              groups.list.some((g) => g.code === code)
                ? `${code} is taken`
                : "Add the group"
            }
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
};

/** a group's name or code, edited in place on click */
const InlineEdit = ({
  value,
  onCommit,
  className,
  title,
  canEdit,
  clean = (v: string) => v,
}: {
  value: string;
  onCommit: (v: string) => unknown;
  className: string;
  title: string;
  canEdit: boolean;
  clean?: (v: string) => string;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!canEdit) {
    return <span className={className}>{value}</span>;
  }
  if (!editing) {
    return (
      <button
        type="button"
        className={`${className} jb-inline`}
        title={title}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
      >
        {value}
      </button>
    );
  }
  const commit = () => {
    setEditing(false);
    if (draft !== value) {
      onCommit(draft);
    }
  };
  return (
    <input
      autoFocus
      className={`${className} jb-inline-input`}
      value={draft}
      size={Math.max(2, draft.length + 1)}
      onChange={(e) => setDraft(clean(e.target.value))}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        } else if (e.key === "Escape") {
          setEditing(false);
        }
      }}
    />
  );
};

/** the board's own settings, saved with it */
const BoardSettingsPanel = ({ canEdit }: { canEdit: boolean }) => {
  const { settings, update } = useSettings();
  return (
    <details className="jb-section" data-ref="board-settings">
      <summary>Board settings</summary>
      <fieldset disabled={!canEdit}>
        <div className="jb-row">
          <Field label="Units">
            <select
              value={settings.units}
              onChange={(e) => update({ units: e.target.value as "in" | "mm" })}
            >
              <option value="in">inches</option>
              <option value="mm">millimetres</option>
            </select>
          </Field>
          <Field label="Color sheets by">
            <select
              data-ref="color-by"
              value={settings.colorBy}
              onChange={(e) => update({ colorBy: e.target.value as ColorBy })}
            >
              <option value="discipline">phase</option>
              <option value="status">status</option>
            </select>
          </Field>
        </div>
        <Field label="Paper for new sheets">
          <select
            data-ref="board-paper"
            value={settings.paper}
            onChange={(e) => update({ paper: e.target.value })}
          >
            <PaperOptions units={settings.units} />
          </select>
        </Field>
        <label className="jb-check">
          <input
            type="checkbox"
            data-ref="snap-frames"
            checked={settings.snapFrames}
            onChange={(e) => update({ snapFrames: e.target.checked })}
          />
          Frame tool snaps to this paper
        </label>
      </fieldset>
    </details>
  );
};

export const SheetsPanel = ({
  boardName,
  listUrl,
  canEdit,
  isTemplate,
}: {
  boardName: string;
  listUrl: string | null;
  canEdit: boolean;
  isTemplate: boolean;
}) => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const { sheets, selectedFrameId } = useSheets();
  const [query, setQuery] = useState("");
  const { tableView, setTableView } = useSheetTableView();
  const view: "list" | "table" = tableView ? "table" : "list";
  const setView = (v: "list" | "table") => setTableView(v === "table");
  const dragging = useRef<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = sortSheets(sheets).filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.data.number.toLowerCase().includes(q) ||
        (s.data.code ?? "").toLowerCase().includes(q),
    );
    return getGroups()
      .map((d) => ({
        discipline: d,
        sheets: shown.filter(
          (s) => disciplineOf(s.data.discipline).code === d.code,
        ),
      }))
      // a group just added shows while still empty, unless searching
      .filter(
        (g) =>
          g.sheets.length ||
          (!q && !DISCIPLINES.some((d) => d.code === g.discipline.code)),
      );
  }, [sheets, query, settings.groups, settings.colors]);
  const groupEdit = useGroups();

  const selected = sheets.find((s) => s.frame.id === selectedFrameId) ?? null;

  /** put a phase's sheets in this order; their page numbers follow */
  const reorder = (ordered: Sheet[]) => {
    if (!api) {
      return;
    }
    updateSheets(
      api,
      new Map(ordered.map((s, i) => [s.frame.id, { patch: { order: i } }])),
      settings.colorBy,
    );
  };

  const dropOn = (target: Sheet, group: Sheet[]) => {
    const from = group.find((s) => s.frame.id === dragging.current);
    dragging.current = null;
    if (!from || from === target) {
      return;
    }
    const rest = group.filter((s) => s !== from);
    rest.splice(rest.indexOf(target), 0, from);
    reorder(rest);
  };

  return (
    <Sidebar name={SHEETS_SIDEBAR} docked className="jb-sidebar">
      <Sidebar.Header>
        <div className="jb-header">
          {listUrl && (
            <a className="jb-back" href={listUrl} data-ref="back">
              ← job books
            </a>
          )}
          <div className="jb-board" title={boardName}>
            {isTemplate && <span className="jb-template">template</span>}
            {boardName}
          </div>
          <div className="jb-views" role="group" aria-label="Sheet index view">
            <button
              type="button"
              className={view === "list" ? "is-on" : ""}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              List
            </button>
            <button
              type="button"
              data-ref="sheet-table-view"
              className={view === "table" ? "is-on" : ""}
              aria-pressed={view === "table"}
              onClick={() => setView("table")}
              title="Every sheet as a row: edit names, revisions, statuses and more in bulk"
            >
              Table
            </button>
          </div>
        </div>
      </Sidebar.Header>

      <div className="jb-panel">
        <div className="jb-searchrow">
        <input
          className="jb-search"
          type="search"
          placeholder={`Find among ${sheets.length} sheet${
            sheets.length === 1 ? "" : "s"
          }`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {canEdit && <AddMenus />}
        </div>

        <div className="jb-index" data-ref="sheet-index">
          {!sheets.length && <p className="jb-empty">No sheets yet.</p>}
          {groups.map(({ discipline, sheets: group }) => (
            <section key={discipline.code} className="jb-group">
              <h3>
                <ColorChip
                  code={discipline.code}
                  name={discipline.name}
                  color={disciplineOf(discipline.code).color}
                  canEdit={canEdit}
                />
                <InlineEdit
                  className="jb-group-name"
                  value={discipline.name}
                  title="Rename the group"
                  canEdit={canEdit}
                  onCommit={(v) => groupEdit.rename(discipline.code, v)}
                />
                <InlineEdit
                  className="jb-group-code"
                  value={discipline.code}
                  title="Change the group's code"
                  canEdit={canEdit}
                  clean={cleanCode}
                  onCommit={(v) => groupEdit.recode(discipline.code, v)}
                />
                <span className="jb-count">{group.length}</span>
                {canEdit && !group.length && (
                  <button
                    type="button"
                    className="jb-group-x"
                    title="Remove this empty group"
                    onClick={() => groupEdit.remove(discipline.code)}
                  >
                    ×
                  </button>
                )}
              </h3>
              <ol>
                {group.map((sheet) => (
                  <SheetRow
                    key={sheet.frame.id}
                    sheet={sheet}
                    active={sheet.frame.id === selectedFrameId}
                    canEdit={canEdit && !query}
                    onDragStart={() => (dragging.current = sheet.frame.id)}
                    onDrop={() => dropOn(sheet, group)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>

        {selected ? (
          <SheetEditor sheet={selected} sheets={sheets} canEdit={canEdit} />
        ) : (
          <>
            <BoardSettingsPanel canEdit={canEdit} />
          </>
        )}
      </div>
    </Sidebar>
  );
};
