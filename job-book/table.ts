// A plain table: a grid of boxes, grouped, with a shaded header row. Each
// cell is an ordinary rectangle, so double-click the table to step into it,
// then double-click a cell to type in it. No formulas, no resizing columns
// together: a dumb table, on purpose, for now.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
} from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const CELL_W = 160;
const CELL_H = 40;

const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");

export const insertTable = (
  api: ExcalidrawImperativeAPI,
  rows: number,
  cols: number,
) => {
  rows = Math.min(Math.max(rows, 1), 60);
  cols = Math.min(Math.max(cols, 1), 20);
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  // centred in the view
  const x0 = width / 2 / zoom.value - scrollX - (cols * CELL_W) / 2;
  const y0 = height / 2 / zoom.value - scrollY - (rows * CELL_H) / 2;
  const group = `table-${newId()}`;

  const skeletons = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const header = r === 0;
      skeletons.push({
        type: "rectangle",
        x: x0 + c * CELL_W,
        y: y0 + r * CELL_H,
        width: CELL_W,
        height: CELL_H,
        strokeColor: "#1e1e1e",
        backgroundColor: header ? "#e9ecef" : "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        roughness: 0,
        roundness: null,
        groupIds: [group],
        customData: { table: { group, row: r, col: c } },
        ...(header
          ? {
              label: {
                text: `Column ${c + 1}`,
                fontSize: 16,
                fontFamily: FONT_FAMILY.Helvetica,
                groupIds: [group],
              },
            }
          : {}),
      });
    }
  }
  const elements = convertToExcalidrawElements(skeletons as any);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...elements],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.selection.select(elements.filter((e) => e.type === "rectangle"));
};
