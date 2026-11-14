// Writing in a document. Double-click a document (or select it and press
// Enter) and its markdown opens right over it, at a size you can read; Esc,
// or clicking away, puts it back on the board as one undo step.
//
// The editor helps the way Obsidian's does: Enter carries a list or a
// checklist on (and ends it on an empty item), Tab and Shift-Tab indent,
// Cmd-B and Cmd-I wrap the selection in ** and _.

import {
  CaptureUpdateAction,
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { viewportOffsets } from "../sheets";

import { PAD } from "./layout";
import { createDocument, docOf, isDocument, setDocText } from "./render";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** below this zoom, opening a document zooms to it first */
const READABLE = 0.85;

export const DocIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M8.5 12.5h7M8.5 16h5" />
  </svg>
);

/** opening a document from anywhere (the toolbar, a new document) */
let openDoc: ((id: string) => void) | null = null;

export const addDocument = (api: ExcalidrawImperativeAPI) => {
  const id = createDocument(api);
  window.setTimeout(() => openDoc?.(id), 50);
};

export const DocButton = () => {
  const api = useExcalidrawAPI();
  return (
    <button
      type="button"
      className="jb-tool-button"
      data-ref="add-document"
      title="New document"
      aria-label="New document"
      onClick={() => api && addDocument(api)}
    >
      {DocIcon}
    </button>
  );
};

export const DocLayer = ({ canEdit }: { canEdit: boolean }) => {
  const api = useExcalidrawAPI();
  const [editing, setEditing] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const open = (id: string) => {
    if (!api || !canEdit) {
      return;
    }
    const anchor = api.getSceneElements().find((el) => el.id === id);
    if (!anchor || anchor.locked) {
      return;
    }
    api.selection.clear({ captureUpdate: CaptureUpdateAction.NEVER });
    if (api.getAppState().zoom.value < READABLE) {
      api.setViewport({
        target: anchor,
        fit: "contain",
        animation: { duration: 250 },
        offsets: viewportOffsets(),
      });
    }
    setEditing(id);
  };
  openDoc = open;

  // double-click on a document, or Enter with one selected, opens it; the
  // editor would otherwise start a text label inside the rectangle
  useEffect(() => {
    if (!api || !canEdit) {
      return;
    }
    const docAt = (clientX: number, clientY: number) => {
      const p = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
      const docs = api.getSceneElements().filter(isDocument);
      for (let i = docs.length - 1; i >= 0; i--) {
        const d = docs[i];
        if (p.x >= d.x && p.x <= d.x + d.width && p.y >= d.y && p.y <= d.y + d.height) {
          return d;
        }
      }
      return null;
    };
    const onDouble = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.(".excalidraw__canvas")) {
        return;
      }
      const s = api.getAppState();
      if (s.activeTool.type !== "selection" || s.editingTextElement) {
        return;
      }
      const d = docAt(e.clientX, e.clientY);
      if (d && !d.locked) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(d.id);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]")) {
        return;
      }
      const s = api.getAppState();
      const ids = Object.keys(s.selectedElementIds);
      if (ids.length !== 1 || s.editingTextElement) {
        return;
      }
      const el = api.getSceneElements().find((x) => x.id === ids[0]);
      if (el && isDocument(el) && !el.locked) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(el.id);
      }
    };
    window.addEventListener("dblclick", onDouble, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("dblclick", onDouble, true);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, canEdit]);

  // while editing, follow the view
  useEffect(() => {
    if (!api || !editing) {
      return;
    }
    const tick = () => setTick((n) => n + 1);
    const off1 = api.onScrollChange(tick);
    const off2 = api.onChange(tick);
    return () => {
      off1();
      off2();
    };
  }, [api, editing]);

  if (!api || !editing) {
    return null;
  }
  const anchor = api.getSceneElements().find((el) => el.id === editing);
  const data = anchor && docOf(anchor);
  if (!anchor || !data) {
    return null;
  }
  return (
    <DocEditor
      key={editing}
      api={api}
      anchorId={editing}
      md={data.md}
      onClose={() => setEditing(null)}
    />
  );
};

const DocEditor = ({
  api,
  anchorId,
  md,
  onClose,
}: {
  api: ExcalidrawImperativeAPI;
  anchorId: string;
  md: string;
  onClose: () => void;
}) => {
  const [value, setValue] = useState(md);
  const latest = useRef(value);
  latest.current = value;
  const ref = useRef<HTMLTextAreaElement>(null);
  const closed = useRef(false);

  const close = () => {
    if (closed.current) {
      return;
    }
    closed.current = true;
    if (latest.current !== md) {
      setDocText(api, anchorId, latest.current);
    }
    onClose();
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      // a new document: the cursor after the heading's text
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    const away = (e: PointerEvent) => {
      if (!(e.target as Element)?.closest?.(".jb-doc-editor")) {
        closeRef.current();
      }
    };
    document.addEventListener("pointerdown", away, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      closeRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const anchor = api.getSceneElements().find((el) => el.id === anchorId);
  const appState = api.getAppState();
  const z = appState.zoom.value;
  useEffect(() => {
    const el = ref.current;
    if (el && anchor) {
      el.style.height = "auto";
      el.style.height = `${Math.max(anchor.height * z, el.scrollHeight)}px`;
    }
  }, [value, z, anchor?.height]);
  if (!anchor) {
    return null;
  }
  const pos = sceneCoordsToViewportCoords({ sceneX: anchor.x, sceneY: anchor.y }, appState);

  /** replace the selection (or the range given) with text, keeping undo */
  const insert = (text: string, from?: number, to?: number) => {
    const el = ref.current!;
    el.focus();
    if (from !== undefined) {
      el.setSelectionRange(from, to ?? from);
    }
    // execCommand keeps the browser's own undo for the edit
    if (!document.execCommand("insertText", false, text)) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      setValue(el.value);
    }
  };

  const wrapWith = (mark: string) => {
    const el = ref.current!;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = el.value.slice(a, b);
    insert(`${mark}${picked}${mark}`);
    if (!picked) {
      el.setSelectionRange(a + mark.length, a + mark.length);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === "Escape" || (mod && e.key === "Enter")) {
      e.preventDefault();
      close();
      return;
    }
    if (mod && (e.key === "b" || e.key === "i")) {
      e.preventDefault();
      wrapWith(e.key === "b" ? "**" : "_");
      return;
    }
    const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const line = el.value.slice(start, el.selectionStart);
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (/^ {1,2}/.test(el.value.slice(start))) {
          const n = el.value.slice(start).startsWith("  ") ? 2 : 1;
          const at = el.selectionStart;
          insert("", start, start + n);
          el.setSelectionRange(at - n, at - n);
        }
      } else {
        const at = el.selectionStart;
        insert("  ", start, start);
        el.setSelectionRange(at + 2, at + 2);
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      const m = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )/.exec(line);
      if (!m) {
        return;
      }
      e.preventDefault();
      if (line.trim() === m[2].trim()) {
        // an empty item ends the list
        insert("", start, el.selectionStart);
        return;
      }
      const next = m[3]
        ? `${Number(m[3]) + 1}${m[4]} `
        : m[2].includes("[")
        ? m[2].replace(/\[[xX]\]/, "[ ]")
        : m[2];
      insert(`\n${m[1]}${next}`);
    }
  };

  return (
    <div className={`jb-doc-editor${appState.theme === "dark" ? " is-dark" : ""}`}>
      <textarea
        ref={ref}
        className="jb-doc-text"
        style={{
          left: pos.x,
          top: pos.y,
          width: anchor.width * z,
          minHeight: anchor.height * z,
          fontSize: 15 * z,
          padding: `${PAD * z}px`,
        }}
        value={value}
        spellCheck
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onWheel={(e) => {
          // the board zooms and pans under the editor as anywhere else
          const n = e.nativeEvent;
          document.querySelector(".excalidraw__canvas.interactive")?.dispatchEvent(
            new WheelEvent("wheel", {
              deltaX: n.deltaX,
              deltaY: n.deltaY,
              deltaMode: n.deltaMode,
              clientX: n.clientX,
              clientY: n.clientY,
              ctrlKey: n.ctrlKey,
              metaKey: n.metaKey,
              shiftKey: n.shiftKey,
              bubbles: true,
              cancelable: true,
            }),
          );
        }}
      />
    </div>
  );
};
