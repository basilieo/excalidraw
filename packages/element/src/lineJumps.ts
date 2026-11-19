// job book (fork): line jumps, as Miro draws them. Where a connector with
// jumps turned on crosses another straight line or connector, it hops over
// it in a little half circle instead of running through it, so a crossing
// can't be mistaken for a junction.
//
// Only straight segments jump: elbow and straight connectors, and they hop
// over elbow and straight lines and connectors. A curve neither jumps nor is
// jumped. When two connectors with jumps cross, the one on top hops.
//
// The setting is `customData.lineJumps` on the connector, so it saves,
// undoes and copies with it. Where the hops fall depends on the other lines,
// so the renderer asks `lineJumpsKey` each frame and redraws the connector
// when it changes.

import type { ExcalidrawElement, ExcalidrawLinearElement } from "./types";

export type LineJump = {
  /** which segment, from points[segment] to points[segment + 1] */
  segment: number;
  /** how far along that segment, 0–1 */
  t: number;
};

/** the corner radius elbow connectors are drawn with (shape.ts) */
const ELBOW_CORNER = 16;

export const lineJumpsEnabled = (element: ExcalidrawElement) =>
  element.type === "arrow" &&
  !!(element.customData as { lineJumps?: boolean } | undefined)?.lineJumps;

/** a line made only of straight segments, unrotated */
const isStraight = (
  element: ExcalidrawElement,
): element is ExcalidrawLinearElement =>
  (element.type === "arrow" || element.type === "line") &&
  !element.isDeleted &&
  !element.roundness &&
  !element.angle &&
  element.points.length > 1;

const isElbowed = (element: ExcalidrawLinearElement) =>
  element.type === "arrow" && "elbowed" in element && !!element.elbowed;

/** how big a hop is: wider for a heavier line */
export const lineJumpRadius = (element: ExcalidrawElement) =>
  4 + element.strokeWidth * 1.5;

/** does `element` hop over `other` where they cross */
const hopsOver = (
  element: ExcalidrawLinearElement,
  other: ExcalidrawLinearElement,
) => {
  if (!lineJumpsEnabled(other)) {
    return true;
  }
  // both jump: the one on top hops
  const a = element.index ?? "";
  const b = other.index ?? "";
  return a === b ? element.id > other.id : a > b;
};

/** where segment p→q crosses segment r→s, as t along p→q; null if not */
const crossing = (
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number,
  sx: number,
  sy: number,
) => {
  const dx = qx - px;
  const dy = qy - py;
  const ex = sx - rx;
  const ey = sy - ry;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) {
    // parallel or on top of each other: no single crossing
    return null;
  }
  const t = ((rx - px) * ey - (ry - py) * ex) / denom;
  const u = ((rx - px) * dy - (ry - py) * dx) / denom;
  // a touch at either line's end is a join, not a crossing
  const eps = 1e-6;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) {
    return null;
  }
  return t;
};

/**
 * Where `element` hops, segment by segment, in order along it. Hops too
 * near a corner, or too near each other, are left out: there is no room to
 * draw them.
 */
export const getLineJumps = (
  element: ExcalidrawElement,
  elementsMap: ReadonlyMap<string, ExcalidrawElement>,
): LineJump[] => {
  if (!lineJumpsEnabled(element) || !isStraight(element)) {
    return [];
  }
  const radius = lineJumpRadius(element);
  const pts = element.points;
  const others: ExcalidrawLinearElement[] = [];
  for (const other of elementsMap.values()) {
    if (
      other !== element &&
      other.id !== element.id &&
      isStraight(other) &&
      hopsOver(element, other)
    ) {
      others.push(other);
    }
  }
  if (!others.length) {
    return [];
  }
  const corner = isElbowed(element) ? ELBOW_CORNER : 0;
  const jumps: LineJump[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const px = element.x + pts[i][0];
    const py = element.y + pts[i][1];
    const qx = element.x + pts[i + 1][0];
    const qy = element.y + pts[i + 1][1];
    const length = Math.hypot(qx - px, qy - py);
    if (length < radius * 2) {
      continue;
    }
    // keep clear of the rounded corners at either end of the segment
    const startClear =
      (i === 0 ? 0 : Math.min(corner, length / 2)) + radius + 1;
    const endClear =
      (i === pts.length - 2 ? 0 : Math.min(corner, length / 2)) + radius + 1;
    const ts: number[] = [];
    for (const other of others) {
      const op = other.points;
      for (let j = 0; j < op.length - 1; j++) {
        const t = crossing(
          px,
          py,
          qx,
          qy,
          other.x + op[j][0],
          other.y + op[j][1],
          other.x + op[j + 1][0],
          other.y + op[j + 1][1],
        );
        if (t !== null) {
          ts.push(t);
        }
      }
    }
    ts.sort((a, b) => a - b);
    let last = -Infinity;
    for (const t of ts) {
      const at = t * length;
      if (at < startClear || at > length - endClear) {
        continue;
      }
      if (at - last < radius * 2 + 2) {
        continue;
      }
      jumps.push({ segment: i, t });
      last = at;
    }
  }
  return jumps;
};

/** changes whenever the hops would be drawn differently */
export const lineJumpsKey = (jumps: readonly LineJump[]) =>
  jumps.map((j) => `${j.segment}:${j.t.toFixed(4)}`).join(",");

const n = (v: number) => Math.round(v * 100) / 100;

/**
 * The line of a connector with its hops, as SVG path data in the element's
 * own coordinates: the screen strokes it as a Path2D, an SVG export writes
 * it as it is. Corners of an elbow connector are rounded as the editor
 * rounds them.
 */
export const lineJumpsPath = (
  element: ExcalidrawLinearElement,
  jumps: readonly LineJump[],
) => {
  const pts = element.points;
  const radius = lineJumpRadius(element);
  const corner = isElbowed(element) ? ELBOW_CORNER : 0;
  const d: string[] = [`M ${n(pts[0][0])} ${n(pts[0][1])}`];
  // where the line has got to: a rounded corner starts the next segment
  // part way along it
  for (let i = 0; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const [qx, qy] = pts[i + 1];
    const length = Math.hypot(qx - px, qy - py);
    if (length === 0) {
      continue;
    }
    const dx = (qx - px) / length;
    const dy = (qy - py) / length;
    for (const jump of jumps) {
      if (jump.segment !== i) {
        continue;
      }
      const cx = px + (qx - px) * jump.t;
      const cy = py + (qy - py) * jump.t;
      // the hop bulges up on a level segment, left on an upright one; a
      // clockwise half circle (sweep 1, on screen) bulges to (dy, -dx)
      const sweep = dx > 1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0) ? 1 : 0;
      d.push(
        `L ${n(cx - dx * radius)} ${n(cy - dy * radius)}`,
        `A ${n(radius)} ${n(radius)} 0 0 ${sweep} ${n(cx + dx * radius)} ${n(
          cy + dy * radius,
        )}`,
      );
    }
    if (i === pts.length - 2 || !corner) {
      d.push(`L ${n(qx)} ${n(qy)}`);
      continue;
    }
    const [nx, ny] = pts[i + 2];
    const next = Math.hypot(nx - qx, ny - qy);
    const r = Math.min(corner, length / 2, next / 2);
    if (!next || !r) {
      d.push(`L ${n(qx)} ${n(qy)}`);
      continue;
    }
    d.push(
      `L ${n(qx - dx * r)} ${n(qy - dy * r)}`,
      `Q ${n(qx)} ${n(qy)} ${n(qx + ((nx - qx) / next) * r)} ${n(
        qy + ((ny - qy) / next) * r,
      )}`,
    );
  }
  return d.join(" ");
};
