// job book (fork): aligning and distributing sheets (frames). Excalidraw
// leaves frames out of both, because moving a frame by itself leaves what
// is on it behind. Here the frames move as the selection says, and then
// everything on each frame follows it by the same amount.

import {
  getSelectedGroupIds,
  isBoundToContainer,
  isFrameLikeElement,
} from "@excalidraw/element";

import type { BoundingBox } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { AppClassProperties, UIAppState } from "../types";

const boxOf = (frame: ExcalidrawElement): BoundingBox => ({
  minX: frame.x,
  minY: frame.y,
  maxX: frame.x + frame.width,
  maxY: frame.y + frame.height,
  midX: frame.x + frame.width / 2,
  midY: frame.y + frame.height / 2,
  width: frame.width,
  height: frame.height,
});

/**
 * When the selection is one sheet and nothing else: what is on it that can
 * move (not the locked title block, nor anything else locked). The align
 * buttons then move all of it, as one block, about the sheet.
 */
export const sheetContents = (
  appState: UIAppState,
  app: AppClassProperties,
): { sheet: ExcalidrawElement; contents: ExcalidrawElement[] } | null => {
  if (!app.props.alignFrames) {
    return null;
  }
  const selected = app.scene.getSelectedElements(appState);
  if (selected.length !== 1 || !isFrameLikeElement(selected[0])) {
    return null;
  }
  const sheet = selected[0];
  const contents = app.scene
    .getNonDeletedElements()
    .filter((el) => el.frameId === sheet.id && !el.locked);
  return contents.length ? { sheet, contents } : null;
};

/**
 * The sheet to align to: the selected sheet itself (its contents move), or,
 * when the selection is one thing (an element, or one group) sitting on a
 * sheet, that sheet, so the buttons line it up with the sheet's edges or
 * centre rather than with nothing. Two or more things still align to each
 * other.
 */
export const sheetToAlignTo = (
  appState: UIAppState,
  app: AppClassProperties,
): BoundingBox | null => {
  if (!app.props.alignFrames) {
    return null;
  }
  const own = sheetContents(appState, app);
  if (own) {
    return boxOf(own.sheet);
  }
  const units = app.scene
    .getSelectedElements(appState)
    .filter((el) => !isBoundToContainer(el));
  if (!units.length || units.some((el) => isFrameLikeElement(el))) {
    return null;
  }
  const frameId = units[0].frameId;
  if (!frameId || units.some((el) => el.frameId !== frameId)) {
    return null;
  }
  if (units.length > 1) {
    const groups = getSelectedGroupIds(appState);
    if (
      groups.length !== 1 ||
      !units.every((el) => el.groupIds.includes(groups[0]))
    ) {
      return null;
    }
  }
  const frame = app.scene.getElement(frameId);
  if (!frame || frame.isDeleted || !isFrameLikeElement(frame)) {
    return null;
  }
  return boxOf(frame);
};

/** said after a button's name when it aligns to the sheet */
export const toSheet = (
  appState: UIAppState,
  app: AppClassProperties,
  word: "to" | "on" = "to",
) =>
  sheetContents(appState, app)
    ? ", everything on the sheet"
    : sheetToAlignTo(appState, app)
    ? ` ${word} the sheet`
    : "";

/** where the selected frames are, before they move */
export const frameSpots = (selected: readonly ExcalidrawElement[]) =>
  new Map(
    selected
      .filter((el) => isFrameLikeElement(el))
      .map((f) => [f.id, { x: f.x, y: f.y }]),
  );

/**
 * the selection to align, without what sits on a selected frame: that moves
 * with its frame rather than on its own
 */
export const withoutFrameContents = <T extends ExcalidrawElement>(
  selected: readonly T[],
): T[] => {
  const frames = new Set(
    selected.filter((el) => isFrameLikeElement(el)).map((f) => f.id),
  );
  return frames.size
    ? selected.filter((el) => !el.frameId || !frames.has(el.frameId))
    : [...selected];
};

/** move each moved frame's contents along with it; returns what moved */
export const carryFrameContents = (
  spots: Map<string, { x: number; y: number }>,
  _selectedIds: Readonly<Record<string, true | boolean>>,
  app: AppClassProperties,
): ExcalidrawElement[] => {
  if (!spots.size) {
    return [];
  }
  const moved: ExcalidrawElement[] = [];
  const byFrame = new Map<string, { dx: number; dy: number }>();
  for (const [id, was] of spots) {
    const now = app.scene.getElement(id);
    if (now && (now.x !== was.x || now.y !== was.y)) {
      byFrame.set(id, { dx: now.x - was.x, dy: now.y - was.y });
    }
  }
  if (!byFrame.size) {
    return [];
  }
  for (const el of app.scene.getNonDeletedElements()) {
    const d = el.frameId ? byFrame.get(el.frameId) : undefined;
    if (d) {
      moved.push(
        app.scene.mutateElement(el, { x: el.x + d.dx, y: el.y + d.dy }),
      );
    }
  }
  return moved;
};
