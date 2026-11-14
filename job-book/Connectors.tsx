// Connector handles, the way Freeform, Obsidian's canvas and Miro do it:
// select one shape and four dots appear just outside its sides. Drag from a
// dot to another shape and you get an arrow bound to both, in the board's
// connector style (curved, elbow or straight).
//
// The arrow is Excalidraw's own. Pressing a dot switches to the arrow tool
// and starts the arrow at that side of the shape, then the drag carries on
// as an ordinary arrow drag, so binding, elbow routing and arrows following
// their shapes are the editor's, not reimplemented here.

import {
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useEffect, useRef, useState } from "react";

import { isTitleBlockPart } from "./sheets";
import { useSettings } from "./settings";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";

const CONNECTABLE = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "text",
  "embeddable",
]);
/** how far outside the shape the dots sit, in screen px */
const OUT = 22;

type Side = "n" | "e" | "s" | "w";
type Dot = { side: Side; x: number; y: number; edgeX: number; edgeY: number };

const dotsFor = (el: ExcalidrawElement, appState: AppState): Dot[] => {
  const v = (sceneX: number, sceneY: number) =>
    sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const sides: [Side, number, number, number, number][] = [
    ["n", cx, el.y, 0, -1],
    ["e", el.x + el.width, cy, 1, 0],
    ["s", cx, el.y + el.height, 0, 1],
    ["w", el.x, cy, -1, 0],
  ];
  return sides.map(([side, sx, sy, dx, dy]) => {
    const edge = v(sx, sy);
    return {
      side,
      x: edge.x + dx * OUT,
      y: edge.y + dy * OUT,
      edgeX: edge.x,
      edgeY: edge.y,
    };
  });
};

const target = (appState: AppState, elements: readonly ExcalidrawElement[]) => {
  if (
    appState.activeTool.type !== "selection" ||
    appState.selectedElementsAreBeingDragged ||
    appState.isResizing ||
    appState.isRotating ||
    appState.editingTextElement ||
    appState.newElement ||
    appState.viewModeEnabled
  ) {
    return null;
  }
  const ids = Object.keys(appState.selectedElementIds);
  if (ids.length !== 1) {
    return null;
  }
  const el = elements.find((e) => e.id === ids[0] && !e.isDeleted);
  if (
    !el ||
    !CONNECTABLE.has(el.type) ||
    el.locked ||
    el.angle ||
    isTitleBlockPart(el) ||
    // a box inside a grouped table connects as the table, not a cell
    el.groupIds.length
  ) {
    return null;
  }
  return el;
};

export const Connectors = () => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const [dots, setDots] = useState<Dot[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    if (!api) {
      return;
    }
    let last = "";
    const update = (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
    ) => {
      const el = busy.current ? null : target(appState, elements);
      const next = el ? dotsFor(el, appState) : [];
      const key = next.map((d) => `${d.x | 0},${d.y | 0}`).join(";");
      if (key !== last) {
        last = key;
        setDots(next);
      }
    };
    const offChange = api.onChange((elements, appState) =>
      update(elements, appState),
    );
    const offScroll = api.onScrollChange(() =>
      update(api.getSceneElements(), api.getAppState()),
    );
    return () => {
      offChange();
      offScroll();
    };
  }, [api]);

  if (!api || !dots.length) {
    return null;
  }

  const start = (dot: Dot, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    busy.current = true;
    setDots([]);
    api.updateScene({
      appState: { currentItemArrowType: settings.connector },
    });
    api.setActiveTool({ type: "arrow" });
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".excalidraw__canvas.interactive",
    );
    const { pointerId, pointerType } = event;
    // once the editor has switched tools, it gets the press at the shape's
    // edge, and the drag already under way carries on from there
    window.setTimeout(() => {
      canvas?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: dot.edgeX,
          clientY: dot.edgeY,
          pointerId,
          pointerType,
          isPrimary: true,
          button: 0,
          buttons: 1,
        }),
      );
      const done = () => {
        busy.current = false;
        window.removeEventListener("pointerup", done, true);
      };
      window.addEventListener("pointerup", done, true);
    }, 0);
  };

  return (
    <div className="jb-connectors" aria-hidden="true">
      {dots.map((dot) => (
        <button
          key={dot.side}
          type="button"
          tabIndex={-1}
          className={`jb-dot jb-dot-${dot.side}`}
          style={{ left: dot.x, top: dot.y }}
          title="Drag to another shape to connect"
          onPointerDown={(e) => start(dot, e)}
        />
      ))}
    </div>
  );
};
