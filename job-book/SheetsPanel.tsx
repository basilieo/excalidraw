// The sheet index: every frame on the board as a sheet, grouped by
// discipline, the way a drawing set's cover sheet lists it. Click a sheet to
// go to it; double-click to rename; drag within a discipline to reorder,
// which renumbers that discipline. The selected sheet's data is edited at
// the bottom.

import { Sidebar, useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  addSheet,
  byPosition,
  DISCIPLINES,
  disciplineOf,
  getSheets,
  goToSheet,
  isSheetFrame,
  nextNumber,
  numberFor,
  sortSheets,
  updateSheet,
  updateSheets,
  type Sheet,
} from "./sheets";

import type { ExcalidrawElement } from "@excalidraw/element/types";

export const SHEETS_SIDEBAR = "sheets";

type Snapshot = { sheets: Sheet[]; selectedFrameId: string | null };

// The panel re-renders only when the sheets or the selected sheet change,
// not on every pointer move.
const frameKey = (elements: readonly ExcalidrawElement[]) =>
  elements
    .filter(isSheetFrame)
    .map(
      (f) =>
        `${f.id}|${f.name}|${JSON.stringify(f.customData ?? {})}|${Math.round(
          f.x,
        )}|${Math.round(f.y)}`,
    )
    .join("\n");

const useSheets = (): Snapshot => {
  const api = useExcalidrawAPI();
  const [snap, setSnap] = useState<Snapshot>({
    sheets: [],
    selectedFrameId: null,
  });
  const last = useRef("");

  useEffect(() => {
    if (!api) {
      return;
    }
    const read = (
      elements: readonly ExcalidrawElement[],
      selected: Record<string, true>,
    ) => {
      const frames = elements.filter(isSheetFrame);
      const selectedFrame =
        frames.find((f) => selected[f.id]) ??
        // an element inside a sheet counts as being on that sheet
        frames.find((f) =>
          elements.some((el) => selected[el.id] && el.frameId === f.id),
        );
      const key = `${frameKey(elements)}#${selectedFrame?.id ?? ""}`;
      if (key !== last.current) {
        last.current = key;
        setSnap({
          sheets: getSheets(elements),
          selectedFrameId: selectedFrame?.id ?? null,
        });
      }
    };
    read(api.getSceneElements(), api.getAppState().selectedElementIds);
    return api.onChange((elements, appState) =>
      read(
        elements.filter((el) => !el.isDeleted),
        appState.selectedElementIds,
      ),
    );
  }, [api]);

  return snap;
};

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
  if (!api) {
    return null;
  }
  const id = sheet.frame.id;
  const discipline = disciplineOf(sheet.data.discipline);
  return (
    <div className="jb-editor" data-ref="sheet-editor">
      <div className="jb-editor-head">
        <span className="jb-chip" style={{ background: discipline.color }} />
        Sheet {sheet.data.number || "(unnumbered)"}
      </div>
      <fieldset disabled={!canEdit}>
        <Field label="Title">
          <CommitInput
            data-ref="sheet-title"
            value={sheet.frame.name ?? ""}
            placeholder="Untitled sheet"
            onCommit={(title) => updateSheet(api, id, {}, title)}
          />
        </Field>
        <div className="jb-row">
          <Field label="Number">
            <CommitInput
              data-ref="sheet-number"
              value={sheet.data.number}
              onCommit={(number) => updateSheet(api, id, { number })}
            />
          </Field>
          <Field label="Rev">
            <CommitInput
              data-ref="sheet-revision"
              value={sheet.data.revision}
              onCommit={(revision) => updateSheet(api, id, { revision })}
            />
          </Field>
        </div>
        <Field label="Discipline">
          <select
            data-ref="sheet-discipline"
            value={discipline.code}
            onChange={(e) => {
              const code = e.target.value;
              // a number that came from the old discipline (S-104) moves
              // with it (to D-101); a number typed by hand stays
              const old = sheet.data.number;
              const automatic =
                !old || new RegExp(`^${sheet.data.discipline}-\\d+$`).test(old);
              updateSheet(api, id, {
                discipline: code,
                ...(automatic
                  ? {
                      number: nextNumber(
                        sheets.filter((s) => s.frame.id !== id),
                        code,
                      ),
                    }
                  : {}),
              });
            }}
          >
            {DISCIPLINES.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issued">
          <input
            type="date"
            value={sheet.data.issued}
            onChange={(e) => updateSheet(api, id, { issued: e.target.value })}
          />
        </Field>
        <label className="jb-check">
          <input
            type="checkbox"
            data-ref="sheet-titleblock"
            checked={sheet.data.titleBlock}
            onChange={(e) =>
              updateSheet(api, id, { titleBlock: e.target.checked })
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
  const [renaming, setRenaming] = useState(false);
  const [over, setOver] = useState(false);
  const discipline = disciplineOf(sheet.data.discipline);

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
      <span className="jb-bar" style={{ background: discipline.color }} />
      <span className="jb-num">{sheet.data.number || "—"}</span>
      {renaming ? (
        <CommitInput
          autoFocus
          className="jb-rename"
          value={sheet.frame.name ?? ""}
          onClick={(e) => e.stopPropagation()}
          onCommit={(title) =>
            api && updateSheet(api, sheet.frame.id, {}, title)
          }
          onBlurCapture={() => setRenaming(false)}
        />
      ) : (
        <span className="jb-title">{sheet.title}</span>
      )}
      {sheet.data.revision && sheet.data.revision !== "0" && (
        <span className="jb-rev">R{sheet.data.revision}</span>
      )}
    </li>
  );
};

export const SheetsPanel = ({
  boardName,
  listUrl,
  canEdit,
  status,
}: {
  boardName: string;
  listUrl: string | null;
  canEdit: boolean;
  /** save status, as the top-right corner shows it (hidden behind a docked panel) */
  status: { key: string; label: string };
}) => {
  const api = useExcalidrawAPI();
  const { sheets, selectedFrameId } = useSheets();
  const [query, setQuery] = useState("");
  const [newDiscipline, setNewDiscipline] = useState("S");
  const dragging = useRef<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = sortSheets(sheets).filter(
      (s) =>
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.data.number.toLowerCase().includes(q),
    );
    return DISCIPLINES.map((d) => ({
      discipline: d,
      sheets: shown.filter(
        (s) => disciplineOf(s.data.discipline).code === d.code,
      ),
    })).filter((g) => g.sheets.length);
  }, [sheets, query]);

  const selected = sheets.find((s) => s.frame.id === selectedFrameId) ?? null;

  /** renumber a discipline in the given order: S-101, S-102, ... */
  const renumber = (ordered: Sheet[], code: string) => {
    if (!api) {
      return;
    }
    updateSheets(
      api,
      new Map(
        ordered.map((s, i) => [
          s.frame.id,
          { patch: { number: numberFor(code, i) } },
        ]),
      ),
    );
  };

  const dropOn = (target: Sheet, group: Sheet[], code: string) => {
    const from = group.find((s) => s.frame.id === dragging.current);
    dragging.current = null;
    if (!from || from === target) {
      return;
    }
    const rest = group.filter((s) => s !== from);
    rest.splice(rest.indexOf(target), 0, from);
    renumber(rest, code);
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
            {boardName}
          </div>
          <div
            className={`jb-status is-${status.key}`}
            data-ref="panel-save-status"
          >
            {status.label}
          </div>
        </div>
      </Sidebar.Header>
      <div className="jb-panel">
        <input
          className="jb-search"
          type="search"
          placeholder={`Find among ${sheets.length} sheet${
            sheets.length === 1 ? "" : "s"
          }`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="jb-index" data-ref="sheet-index">
          {!sheets.length && (
            <p className="jb-empty">
              No sheets yet. Add one below, or draw a frame (F) and it becomes a
              sheet.
            </p>
          )}
          {groups.map(({ discipline, sheets: group }) => (
            <section key={discipline.code} className="jb-group">
              <h3>
                <span
                  className="jb-chip"
                  style={{ background: discipline.color }}
                />
                {discipline.name}
                <span className="jb-count">{group.length}</span>
                {canEdit && group.length > 1 && (
                  <button
                    type="button"
                    className="jb-link"
                    title="Number this discipline in reading order on the board: rows top to bottom, left to right"
                    onClick={() => renumber(byPosition(group), discipline.code)}
                  >
                    renumber
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
                    onDrop={() => dropOn(sheet, group, discipline.code)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>

        {canEdit && (
          <div className="jb-add">
            <select
              value={newDiscipline}
              onChange={(e) => setNewDiscipline(e.target.value)}
              aria-label="Discipline of the new sheet"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-ref="add-sheet"
              onClick={() => {
                if (api) {
                  const id = addSheet(api, newDiscipline);
                  requestAnimationFrame(() => goToSheet(api, id));
                }
              }}
            >
              + New sheet
            </button>
          </div>
        )}

        {selected ? (
          <SheetEditor sheet={selected} sheets={sheets} canEdit={canEdit} />
        ) : (
          sheets.length > 0 && (
            <p className="jb-hint">Select a sheet to edit its title block.</p>
          )
        )}
      </div>
    </Sidebar>
  );
};
