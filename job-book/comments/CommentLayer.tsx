// Comments on the board, the way Miro and Figma have them: pick the comment
// tool, click where the comment belongs, write. A pin stays there, on the
// thing you clicked (it moves with it) or on the board; click the pin to
// read the thread, reply, or resolve it, which tucks it away.
//
// Comments are kept with the board's settings, not drawn into the scene,
// so they never show in a print or an export.

import {
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useSettings } from "../settings";

import type { BoardComment } from "../settings";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

// whether the next click on the board places a comment
let placing = false;
const listeners = new Set<() => void>();
const setPlacing = (on: boolean) => {
  placing = on;
  listeners.forEach((l) => l());
};
const usePlacing = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => placing,
  );

export const CommentIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 4v-4h0A1.5 1.5 0 0 1 4 14.5z" />
  </svg>
);

export const CommentButton = () => {
  const on = usePlacing();
  return (
    <button
      type="button"
      className={`jb-tool-button${on ? " is-on" : ""}`}
      data-ref="comment-tool"
      title="Comment"
      aria-label="Comment"
      aria-pressed={on}
      onClick={() => setPlacing(!on)}
    >
      {CommentIcon}
    </button>
  );
};

const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "").slice(0, 12);

const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

/** where a comment's pin is on the board now */
const pinAt = (c: BoardComment, byId: Map<string, ExcalidrawElement>) => {
  const el = c.elementId ? byId.get(c.elementId) : undefined;
  return el && !el.isDeleted ? { x: el.x + c.x, y: el.y + c.y } : { x: c.x, y: c.y };
};

/** what a comment placed at a point belongs to: the topmost thing there */
const elementAt = (elements: readonly ExcalidrawElement[], x: number, y: number) => {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (
      !el.isDeleted &&
      !el.locked &&
      x >= el.x &&
      x <= el.x + el.width &&
      y >= el.y &&
      y <= el.y + el.height
    ) {
      return el;
    }
  }
  // a sheet, if nothing else (frames are drawn under everything)
  return (
    elements.find(
      (el) =>
        el.type === "frame" &&
        !el.isDeleted &&
        x >= el.x &&
        x <= el.x + el.width &&
        y >= el.y &&
        y <= el.y + el.height,
    ) ?? null
  );
};

export const CommentLayer = ({
  user,
  canEdit,
}: {
  user: string;
  canEdit: boolean;
}) => {
  const api = useExcalidrawAPI();
  const { settings, update } = useSettings();
  const placingNow = usePlacing();
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoardComment | null>(null);
  const [, setTick] = useState(0);
  const comments = settings.comments ?? [];

  // follow the view and the things comments are on
  useEffect(() => {
    if (!api) {
      return;
    }
    let last = "";
    const check = () => {
      const s = api.getAppState();
      const key = `${s.scrollX},${s.scrollY},${s.zoom.value},${s.width},${s.height},${api
        .getSceneElements()
        .reduce((n, el) => n + el.version, 0)}`;
      if (key !== last) {
        last = key;
        setTick((n) => n + 1);
      }
    };
    const off1 = api.onScrollChange(check);
    const off2 = api.onChange(check);
    return () => {
      off1();
      off2();
    };
  }, [api]);

  // Esc leaves the comment tool
  useEffect(() => {
    if (!placingNow) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setPlacing(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [placingNow]);

  if (!api) {
    return null;
  }
  const appState = api.getAppState();
  const elements = api.getSceneElements();
  const byId = new Map(elements.map((el) => [el.id, el]));
  const save = (next: BoardComment[]) => update({ comments: next });
  // threads open to the right unless the sheet index is in the way
  const roomRight =
    document.querySelector(".jb-sidebar")?.getBoundingClientRect().left ??
    window.innerWidth;

  const place = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const p = viewportCoordsToSceneCoords(
      { clientX: e.clientX, clientY: e.clientY },
      appState,
    );
    const on = elementAt(elements, p.x, p.y);
    setPlacing(false);
    setOpen(null);
    setDraft({
      id: newId(),
      x: on ? p.x - on.x : p.x,
      y: on ? p.y - on.y : p.y,
      elementId: on?.id,
      thread: [],
    });
  };

  const shown = [...comments.filter((c) => !c.resolved), ...(draft ? [draft] : [])];

  return (
    <div className={`jb-comments${appState.theme === "dark" ? " is-dark" : ""}`}>
      {placingNow && (
        <div className="jb-comment-catcher" onPointerDown={place} title="Click where the comment goes" />
      )}
      {shown.map((c, i) => {
        const at = pinAt(c, byId);
        const v = sceneCoordsToViewportCoords({ sceneX: at.x, sceneY: at.y }, appState);
        const isDraft = c === draft;
        const isOpen = isDraft || open === c.id;
        const first = c.thread[0];
        return (
          <div
            key={c.id}
            className={`jb-comment${v.x > roomRight - 300 ? " is-left" : ""}`}
            style={{ left: v.x, top: v.y }}
          >
            <button
              type="button"
              className={`jb-pin${isOpen ? " is-open" : ""}`}
              title={first ? `${first.author}: ${first.text}` : "New comment"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                if (!isDraft) {
                  setDraft(null);
                  setOpen(open === c.id ? null : c.id);
                }
              }}
            >
              {first ? initials(first.author) : "+"}
              {c.thread.length > 1 && <span className="jb-pin-count">{c.thread.length}</span>}
            </button>
            {isOpen && (
              <Thread
                comment={c}
                appState={appState}
                user={user}
                canEdit={canEdit}
                onPost={(text) => {
                  const post = { author: user || "Someone", text, at: new Date().toISOString() };
                  if (isDraft) {
                    save([...comments, { ...c, thread: [post] }]);
                    setDraft(null);
                    setOpen(c.id);
                  } else {
                    save(comments.map((x) => (x.id === c.id ? { ...x, thread: [...x.thread, post] } : x)));
                  }
                }}
                onResolve={() => {
                  setOpen(null);
                  save(comments.map((x) => (x.id === c.id ? { ...x, resolved: true } : x)));
                }}
                onDelete={() => {
                  setOpen(null);
                  save(comments.filter((x) => x.id !== c.id));
                }}
                onClose={() => {
                  setOpen(null);
                  setDraft(null);
                }}
                index={i}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const Thread = ({
  comment,
  user,
  canEdit,
  onPost,
  onResolve,
  onDelete,
  onClose,
}: {
  comment: BoardComment;
  appState: AppState;
  user: string;
  canEdit: boolean;
  onPost: (text: string) => void;
  onResolve: () => void;
  onDelete: () => void;
  onClose: () => void;
  index: number;
}) => {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const isNew = !comment.thread.length;
  const post = () => {
    if (text.trim()) {
      onPost(text.trim());
      setText("");
    }
  };
  return (
    <div
      className="jb-thread"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          onClose();
        }
      }}
    >
      {!isNew && (
        <div className="jb-thread-head">
          <button type="button" title="Resolve" disabled={!canEdit} onClick={onResolve}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 10.5l4 4 8-9" />
            </svg>
          </button>
          <button type="button" title="Delete the thread" disabled={!canEdit} onClick={onDelete}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />
            </svg>
          </button>
          <span />
          <button type="button" title="Close" onClick={onClose}>
            ×
          </button>
        </div>
      )}
      {comment.thread.map((p, i) => (
        <div key={i} className="jb-post">
          <div className="jb-post-head">
            <span className="jb-avatar">{initials(p.author)}</span>
            <b>{p.author}</b>
            <span className="jb-post-when">{when(p.at)}</span>
          </div>
          <div className="jb-post-text">{p.text}</div>
        </div>
      ))}
      {canEdit && (
        <div className="jb-reply">
          <textarea
            ref={ref}
            value={text}
            rows={isNew ? 3 : 2}
            placeholder={isNew ? "Comment" : "Reply"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                post();
              }
            }}
          />
          <button type="button" disabled={!text.trim()} title={user ? `Post as ${user}` : "Post"} onClick={post}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 16V4M5 9l5-5 5 5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};
