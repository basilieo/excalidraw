// Selection filters, as in Rhino: a cursor button in the bottom bar opens a
// list of kinds of things on the board, and a kind that's switched off can't
// be clicked, boxed or select-all'ed into the selection. Handy for working
// over sheets without picking up the sheet, or for grabbing only the arrows.
//
// Per person and computer (localStorage), not saved with the board.

import { useCallback, useEffect, useRef, useState } from "react";

import { isDocument } from "./doc/render";
import { isTableAnchor } from "./table/render";

import type { ExcalidrawElement } from "@excalidraw/element/types";

export type SelectKind =
  | "sheets"
  | "shapes"
  | "lines"
  | "text"
  | "drawings"
  | "images"
  | "tables"
  | "documents"
  | "embeds";

const KINDS: { kind: SelectKind; label: string }[] = [
  { kind: "sheets", label: "Sheets" },
  { kind: "shapes", label: "Shapes" },
  { kind: "lines", label: "Arrows and lines" },
  { kind: "text", label: "Text" },
  { kind: "drawings", label: "Drawings" },
  { kind: "images", label: "Images and PDFs" },
  { kind: "tables", label: "Tables" },
  { kind: "documents", label: "Documents" },
  { kind: "embeds", label: "Embeds" },
];

export const kindOf = (el: ExcalidrawElement): SelectKind | null => {
  if (isTableAnchor(el)) {
    return "tables";
  }
  if (isDocument(el)) {
    return "documents";
  }
  switch (el.type) {
    case "frame":
    case "magicframe":
      return "sheets";
    case "rectangle":
    case "diamond":
    case "ellipse":
      return "shapes";
    case "arrow":
    case "line":
      return "lines";
    case "text":
      return "text";
    case "freedraw":
      return "drawings";
    case "image":
      return "images";
    case "embeddable":
    case "iframe":
      return "embeds";
  }
  return null;
};

const KEY = "jobbook.selectionFilter";

const load = (): Set<SelectKind> => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw : []);
  } catch {
    return new Set();
  }
};

/** the filter, and the test the editor asks of every element it might select */
export const useSelectionFilter = () => {
  const [off, setOff] = useState<Set<SelectKind>>(load);
  const ref = useRef(off);
  ref.current = off;
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...off]));
    } catch {
      // private window: the filter lasts this visit only
    }
  }, [off]);
  // stable, so the editor isn't handed a new prop on every change
  const isSelectable = useCallback((el: ExcalidrawElement) => {
    const k = kindOf(el);
    return !k || !ref.current.has(k);
  }, []);
  return { off, setOff, isSelectable };
};

const CursorIcon = (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 3.5l13 7.2-5.6 1.4 3.4 6.4-2.5 1.3-3.4-6.4L5.6 17z" />
  </svg>
);

export const SelectionFilterButton = ({
  off,
  setOff,
}: {
  off: Set<SelectKind>;
  setOff: (s: Set<SelectKind>) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);

  const toggle = (k: SelectKind) => {
    const next = new Set(off);
    if (next.has(k)) {
      next.delete(k);
    } else {
      next.add(k);
    }
    setOff(next);
  };

  return (
    <div className="jb-selfilter" ref={ref}>
      <button
        type="button"
        className={`jb-selfilter-btn${off.size ? " is-filtering" : ""}${
          open ? " is-open" : ""
        }`}
        data-ref="selection-filter"
        title={
          off.size
            ? `Selection filter: ${off.size} kind${off.size > 1 ? "s" : ""} left out`
            : "Selection filter"
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {CursorIcon}
      </button>
      {open && (
        <div className="jb-selfilter-menu" role="menu">
          {KINDS.map(({ kind, label }) => (
            <label key={kind} className="jb-selfilter-item">
              <input
                type="checkbox"
                checked={!off.has(kind)}
                onChange={() => toggle(kind)}
              />
              {label}
            </label>
          ))}
          <div className="jb-selfilter-foot">
            <button
              type="button"
              disabled={!off.size}
              onClick={() => setOff(new Set())}
            >
              All
            </button>
            <button
              type="button"
              onClick={() =>
                setOff(new Set(KINDS.map((k) => k.kind).filter((k) => k !== "sheets")))
              }
              title="Select sheets only"
            >
              Only sheets
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
