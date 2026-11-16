// Hiding sheets, as Rhino hides layers: the eye beside a group in the sheet
// index takes its sheets, and everything on them, off the board until it's
// shown again, and the eye beside a sheet does the same for that one sheet.
// Hidden sheets can't be clicked or boxed either.
//
// One set holds both: a group by its code, a sheet as "sheet:" and its
// frame's id, so a sheet hidden on its own stays hidden when its group is
// shown again.
//
// It's how you look at the board, not the board itself: kept per person
// and per board in this browser, so hiding a group never hides it for
// anyone else.

import { useSyncExternalStore } from "react";

import { disciplineOf, readSheet } from "./sheets";

import type {
  ExcalidrawElement,
  ExcalidrawFrameElement,
} from "@excalidraw/element/types";

let boardKey = "jobbook.hidden";
let hidden = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** the board whose hidden groups these are */
export const useBoardForHidden = (boardId: string) => {
  const key = `jobbook.hidden.${boardId}`;
  if (key !== boardKey) {
    boardKey = key;
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      hidden = new Set(Array.isArray(raw) ? raw : []);
    } catch {
      hidden = new Set();
    }
  }
};

const sheetKey = (frameId: string) => `sheet:${frameId}`;
export const isSheetHidden = (set: ReadonlySet<string>, frameId: string) =>
  set.has(sheetKey(frameId));

const toggle = (key: string) => {
  hidden = new Set(hidden);
  if (hidden.has(key)) {
    hidden.delete(key);
  } else {
    hidden.add(key);
  }
  try {
    localStorage.setItem(boardKey, JSON.stringify([...hidden]));
  } catch {
    // a private window: hidden for this visit only
  }
  emit();
};

export const toggleGroupHidden = (code: string) => toggle(code);
export const toggleSheetHidden = (frameId: string) => toggle(sheetKey(frameId));

let snapshot = { hidden };
export const useHiddenGroups = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      if (snapshot.hidden !== hidden) {
        snapshot = { hidden };
      }
      return snapshot.hidden;
    },
  );

/** the sheets hidden, on their own or with their group, by id */
export const hiddenFrames = (
  elements: readonly ExcalidrawElement[],
  groups: ReadonlySet<string>,
): Set<string> => {
  const out = new Set<string>();
  if (!groups.size) {
    return out;
  }
  for (const el of elements) {
    if (
      el.type === "frame" &&
      !el.isDeleted &&
      (groups.has(sheetKey(el.id)) ||
        groups.has(disciplineOf(readSheet(el as ExcalidrawFrameElement).discipline).code))
    ) {
      out.add(el.id);
    }
  }
  return out;
};
