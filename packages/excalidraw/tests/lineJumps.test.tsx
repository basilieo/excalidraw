// job book (fork): line jumps. Where a connector with jumps on crosses a
// straight line it hops over it, on screen and in SVG exports.

import { getLineJumps, lineJumpsPath } from "@excalidraw/element";

import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { getDefaultAppState } from "../appState";
import { exportScene } from "../scene/export";

import { API } from "./helpers/api";

// the test helper passes neither customData nor (for arrows) a square
// corner through, so both are set on what it makes
const straight = <T extends ExcalidrawElement>(
  el: T,
  lineJumps = false,
): T => ({
  ...el,
  roundness: null,
  customData: lineJumps ? { lineJumps: true } : undefined,
});

const horizontal = (lineJumps: boolean, index: string) =>
  straight(
    API.createElement({
      type: "arrow",
      x: 0,
      y: 100,
      width: 400,
      height: 0,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(400, 0)],
      index: index as any,
    }),
    lineJumps,
  );

const vertical = (x: number, index: string) =>
  straight(
    API.createElement({
      type: "line",
      x,
      y: 0,
      width: 0,
      height: 200,
      points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(0, 200)],
      index: index as any,
    }),
  );

const mapOf = (...elements: ExcalidrawElement[]) =>
  new Map(elements.map((el) => [el.id, el]));

describe("line jumps", () => {
  it("hops where the connector crosses, only when turned on", () => {
    const a = vertical(100, "a0");
    const b = vertical(300, "a1");
    const on = horizontal(true, "a2");
    const off = horizontal(false, "a3");
    const jumps = getLineJumps(on, mapOf(a, b, on, off));
    expect(jumps.map((j) => Math.round(j.t * 400))).toEqual([100, 300]);
    expect(getLineJumps(off, mapOf(a, b, on, off))).toEqual([]);
  });

  it("leaves out a crossing too near the end to draw a hop", () => {
    const a = vertical(2, "a0");
    const on = horizontal(true, "a1");
    expect(getLineJumps(on, mapOf(a, on))).toEqual([]);
  });

  it("of two connectors with jumps, the upper one hops", () => {
    const lower = straight(
      API.createElement({
        type: "arrow",
        x: 200,
        y: 0,
        width: 0,
        height: 200,
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(0, 200)],
        index: "a0" as any,
      }),
      true,
    );
    const upper = horizontal(true, "a1");
    const all = mapOf(lower, upper);
    expect(getLineJumps(upper, all)).toHaveLength(1);
    expect(getLineJumps(lower, all)).toEqual([]);
  });

  it("draws each hop as a half circle up over the line", () => {
    const a = vertical(100, "a0");
    const on = horizontal(true, "a1");
    const path = lineJumpsPath(on as any, getLineJumps(on, mapOf(a, on)));
    // radius 4 + 1.5 × the default stroke width of 2
    expect(path).toBe("M 0 0 L 93 0 A 7 7 0 0 1 107 0 L 400 0");
  });

  it("writes the hops into an SVG export", async () => {
    const a = vertical(100, "a0");
    const on = horizontal(true, "a1");
    const svg = await exportScene({
      type: "svg",
      data: {
        elements: [a, on],
        appState: getDefaultAppState() as any,
        files: {},
      },
      config: { canvasBackgroundColor: false },
    });
    const paths = [...svg.querySelectorAll("path")].map(
      (p) => p.getAttribute("d") ?? "",
    );
    expect(paths.some((d) => d.includes("A 7 7 0 0 1"))).toBe(true);
  });
});
