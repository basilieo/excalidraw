// job book (fork): aligning and distributing sheets (frames). Excalidraw
// leaves frames out of both, because moving a frame by itself leaves what
// is on it behind. Here the frames move as the selection says, and then
// everything on each frame follows it by the same amount.

import { isFrameLikeElement } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { AppClassProperties } from "../types";

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
