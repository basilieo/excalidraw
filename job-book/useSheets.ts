// The board's sheets, and which one is selected, for the panels that list
// them. Re-renders only when a sheet or the selected sheet changes, not on
// every pointer move.

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect, useRef, useState } from "react";

import { getSheets, isSheetFrame } from "./sheets";

import type { Sheet } from "./sheets";
import type { ExcalidrawElement } from "@excalidraw/element/types";

export type Snapshot = { sheets: Sheet[]; selectedFrameId: string | null };

// The panel re-renders only when the sheets or the selected sheet change,
// not on every pointer move.
const frameKey = (elements: readonly ExcalidrawElement[]) =>
  elements
    .filter(isSheetFrame)
    .map(
      (f) =>
        `${f.id}|${f.name}|${JSON.stringify(f.customData ?? {})}|${Math.round(
          f.x,
        )}|${Math.round(f.y)}|${Math.round(f.width)}|${Math.round(f.height)}`,
    )
    .join("\n");

export const useSheets = (): Snapshot => {
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
