// Connector handles, the way Freeform, Obsidian's canvas and Miro do it:
// select one shape and four dots appear just outside its sides. Drag from a
// dot to another shape and you get an arrow bound to both, in the board's
// connector style (curved, elbow or straight).
//
// Click a dot instead, without dragging, and you get Miro's quick add: a
// copy of the shape (same size and style, no text) on that side, clear of
// what is already there, joined by a connector and selected. That is the
// editor's own flowchart step (⌘ + arrow key), not reimplemented here.
//
// The arrow is Excalidraw's own. Pressing a dot switches to the arrow tool
// and starts the arrow at that side of the shape, then the drag carries on
// as an ordinary arrow drag, so binding, elbow routing and arrows following
// their shapes are the editor's, not reimplemented here.

import {
  sceneCoordsToViewportCoords,
  useExcalidrawAPI,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { useEffect, useRef, useState } from "react";

import { isTitleBlockPart } from "./sheets";
import { isTableAnchor } from "./table/render";

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
type Dot = {
  /** the shape the dot is on */
  id: string;
  side: Side;
  x: number;
  y: number;
  edgeX: number;
  edgeY: number;
};

const DIRECTION = { n: "up", e: "right", s: "down", w: "left" } as const;
/** how far the pointer goes, in screen px, before a press is a drag */
const DRAG_START = 4;

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
      id: el.id,
      side,
      x: edge.x + dx * OUT,
      y: edge.y + dy * OUT,
      edgeX: edge.x,
      edgeY: edge.y,
    };
  });
};

/** a shape the dots can go on */
const connectable = (el: ExcalidrawElement | undefined) =>
  !!el &&
  !el.isDeleted &&
  CONNECTABLE.has(el.type) &&
  !el.locked &&
  !el.angle &&
  !isTitleBlockPart(el) &&
  // a table has its own handle and toolbar
  !isTableAnchor(el) &&
  // a box inside a grouped table connects as the table, not a cell
  !el.groupIds.length;

/**
 * Where the dots go: the selected shape if one is, otherwise the shape under
 * the pointer.
 */
const target = (
  appState: AppState,
  elements: readonly ExcalidrawElement[],
  hoveredId: string | null,
) => {
  if (
    appState.activeTool.type !== "selection" ||
    appState.selectedElementsAreBeingDragged ||
    appState.isResizing ||
    appState.isRotating ||
    appState.editingTextElement ||
    appState.newElement ||
    appState.viewModeEnabled ||
    // writing in a document
    document.querySelector(".jb-doc-editor")
  ) {
    return null;
  }
  const ids = Object.keys(appState.selectedElementIds);
  if (ids.length > 1) {
    return null;
  }
  const id = ids[0] ?? hoveredId;
  const el = id ? elements.find((e) => e.id === id) : undefined;
  return connectable(el) ? el! : null;
};

/** the topmost connectable shape at a point on the board, with a margin so
 * the pointer can travel out to a dot without losing it */
const shapeAt = (
  elements: readonly ExcalidrawElement[],
  x: number,
  y: number,
  margin: number,
) => {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (
      connectable(el) &&
      x >= el.x - margin &&
      x <= el.x + el.width + margin &&
      y >= el.y - margin &&
      y <= el.y + el.height + margin
    ) {
      return el;
    }
  }
  return null;
};

export const Connectors = () => {
  const api = useExcalidrawAPI();
  const [dots, setDots] = useState<Dot[]>([]);
  const busy = useRef(false);
  const hovered = useRef<string | null>(null);

  useEffect(() => {
    if (!api) {
      return;
    }
    let last = "";
    const update = (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
    ) => {
      const el = busy.current
        ? null
        : target(appState, elements, hovered.current);
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
    // dots also show on the shape under the pointer
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.buttons || (e.target as Element)?.closest?.(".jb-dot")) {
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const appState = api.getAppState();
        const elements = api.getSceneElements();
        const p = viewportCoordsToSceneCoords(
          { clientX: e.clientX, clientY: e.clientY },
          appState,
        );
        const over = (e.target as Element)?.closest?.(
          ".excalidraw__canvas, .jb-dot",
        )
          ? shapeAt(elements, p.x, p.y, 34 / appState.zoom.value)
          : null;
        const id = over?.id ?? null;
        if (id !== hovered.current) {
          hovered.current = id;
          update(elements, appState);
        }
      });
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      offChange();
      offScroll();
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onMove);
    };
  }, [api]);

  if (!api || !dots.length) {
    return null;
  }

  /** draw a connector from this dot: the press, handed to the arrow tool */
  const beginDrag = (dot: Dot, pointerId: number, pointerType: string) => {
    // the arrow is whatever type was last picked for arrows
    api.setActiveTool({ type: "arrow" });
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".excalidraw__canvas.interactive",
    );
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

  // a press on a dot is a drag once the pointer moves, a click if it lets go
  // first
  const start = (dot: Dot, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    busy.current = true;
    const { pointerId, pointerType, clientX, clientY } = event;
    const stop = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
    };
    const move = (e: PointerEvent) => {
      if (
        e.pointerId === pointerId &&
        Math.hypot(e.clientX - clientX, e.clientY - clientY) > DRAG_START
      ) {
        stop();
        setDots([]);
        beginDrag(dot, pointerId, pointerType);
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) {
        return;
      }
      stop();
      busy.current = false;
      // the new shape is selected, and the dots move onto it
      api.addFlowchartNode(dot.id, DIRECTION[dot.side]);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
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
          title="Click for a connected copy, or drag to another shape to connect"
          onPointerDown={(e) => start(dot, e)}
        />
      ))}
    </div>
  );
};
