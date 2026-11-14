// Documents on the board: a page of markdown, as an object you can move,
// size and connect with arrows like any other. Its anchor is a white
// rectangle holding the markdown (`customData.jbDoc`); what you read on it
// is generated from that as locked elements, the same way tables are, so a
// document prints, exports and zooms with the board, headings bigger than
// body text and all.
//
// Its width is yours to set (the text rewraps); its height is at least what
// you make it, and grows when the text needs more.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  FONT_FAMILY,
  newElementWith,
} from "@excalidraw/excalidraw";
import { randomInteger } from "@excalidraw/common";

import { followAnchors, partsAboveAnchors } from "../table/render";

import { layoutDoc } from "./layout";

import type { DocLayout } from "./layout";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export const DOC_KEY = "jbDoc";
const PART_KEY = "jbDocPart";
const LAID_KEY = "jbDocLaid";

const INK = "#1e1e1e";
const MUTED = "#868e96";
const EDGE = "#ced4da";
const CODE_BG = "#f1f3f5";
const CHECK = "#4263eb";

export const MIN_WIDTH = 240;
/** a new document: about a letter page */
const NEW_WIDTH = 600;
const NEW_HEIGHT = 776;

export type DocData = {
  md: string;
  /** the height it was sized to; the text can make it taller */
  minHeight: number;
};

export const isDocument = (el: ExcalidrawElement) =>
  !el.isDeleted && !!(el.customData as any)?.[DOC_KEY];

export const isDocPart = (el: ExcalidrawElement) =>
  !!(el.customData as any)?.[PART_KEY];

const partInfo = (el: ExcalidrawElement) =>
  (el.customData as any)?.[PART_KEY] as
    | { anchorId: string; sig: string; ax: number; ay: number }
    | undefined;

export const docOf = (el: ExcalidrawElement): DocData | null => {
  const raw = (el.customData as any)?.[DOC_KEY];
  return raw && typeof raw.md === "string"
    ? { md: raw.md, minHeight: Number(raw.minHeight) || 0 }
    : null;
};

/** a new document in the middle of the view */
export const createDocument = (
  api: ExcalidrawImperativeAPI,
  md = "# Untitled\n\n",
): string => {
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const [anchor] = convertToExcalidrawElements([
    {
      type: "rectangle",
      x: width / 2 / zoom.value - scrollX - NEW_WIDTH / 2,
      y: height / 2 / zoom.value - scrollY - NEW_HEIGHT / 2,
      width: NEW_WIDTH,
      height: NEW_HEIGHT,
      strokeColor: EDGE,
      backgroundColor: "#ffffff",
      fillStyle: "solid",
      strokeWidth: 1,
      roughness: 0,
      roundness: { type: 3, value: 8 },
      customData: {
        [DOC_KEY]: { md, minHeight: NEW_HEIGHT } satisfies DocData,
        [LAID_KEY]: { w: NEW_WIDTH, h: NEW_HEIGHT },
      },
    } as any,
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), anchor],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  syncDocs(api);
  return anchor.id;
};

/** change a document's text, as one undo step */
export const setDocText = (
  api: ExcalidrawImperativeAPI,
  id: string,
  md: string,
) => {
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((el) => {
      const d = el.id === id ? docOf(el) : null;
      return d && d.md !== md
        ? newElementWith(el, {
            customData: { ...el.customData, [DOC_KEY]: { ...d, md } },
          })
        : el;
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};

const signature = (anchor: ExcalidrawElement, d: DocData) =>
  JSON.stringify([
    "d1",
    d.md,
    Math.round(anchor.width),
    Math.round(anchor.x * 10),
    Math.round(anchor.y * 10),
    anchor.frameId,
    anchor.opacity,
  ]);

const buildParts = (
  anchor: ExcalidrawElement,
  layout: DocLayout,
  sig: string,
): ExcalidrawElement[] => {
  const ox = anchor.x;
  const oy = anchor.y;
  const id = (part: string) => `${anchor.id}:d:${part}`;
  const skeletons: any[] = [];
  const boldIds = new Set<string>();

  const line = (part: string, x: number, y: number, dx: number, dy: number, color: string, width = 1) =>
    skeletons.push({
      type: "line",
      id: id(part),
      x: ox + x,
      y: oy + y,
      width: Math.abs(dx),
      height: Math.abs(dy),
      points: [
        [0, 0],
        [dx, dy],
      ],
      strokeColor: color,
      strokeWidth: width,
      roughness: 0,
      roundness: null,
    });

  layout.placed.forEach((b, i) => {
    if (b.kind === "rule") {
      line(`rule:${i}`, b.x, b.y, b.width, 0, EDGE);
      return;
    }
    if (b.decor === "code") {
      skeletons.push({
        type: "rectangle",
        id: id(`code:${i}`),
        x: ox + b.x - 10,
        y: oy + b.y - 10,
        width: b.width + 20,
        height: b.height + 20,
        strokeColor: "transparent",
        backgroundColor: CODE_BG,
        fillStyle: "solid",
        roughness: 0,
        roundness: { type: 3, value: 6 },
      });
    }
    if (b.decor === "quote") {
      line(`quote:${i}`, b.x - 12, b.y, 0, b.height, EDGE, 3);
    }
    const firstLine = b.size * b.lineHeight;
    if (b.marker) {
      skeletons.push({
        type: "text",
        id: id(`marker:${i}`),
        x: ox + b.x - (b.marker.length > 1 ? 22 : 14),
        y: oy + b.y,
        text: b.marker,
        fontSize: b.size,
        fontFamily: FONT_FAMILY.Helvetica,
        lineHeight: b.lineHeight,
        strokeColor: MUTED,
        roughness: 0,
      });
    }
    if (b.checkbox) {
      const size = 13;
      const bx = b.x - 20;
      const by = b.y + (firstLine - size) / 2;
      const on = b.checkbox === "on";
      skeletons.push({
        type: "rectangle",
        id: id(`check:${i}`),
        x: ox + bx,
        y: oy + by,
        width: size,
        height: size,
        strokeColor: on ? CHECK : MUTED,
        backgroundColor: on ? CHECK : "#ffffff",
        fillStyle: "solid",
        strokeWidth: 1.5,
        roughness: 0,
        roundness: { type: 3, value: 3 },
      });
      if (on) {
        skeletons.push({
          type: "line",
          id: id(`tick:${i}`),
          x: ox + bx + 3,
          y: oy + by + 6.5,
          width: 7,
          height: 4.5,
          points: [
            [0, 0],
            [2.4, 2.6],
            [7, -2.2],
          ],
          strokeColor: "#ffffff",
          strokeWidth: 2,
          roughness: 0,
          roundness: null,
        });
      }
    }
    if (!b.lines.join("").trim()) {
      return;
    }
    const text = {
      type: "text",
      x: ox + b.x,
      y: oy + b.y,
      text: b.lines.join("\n"),
      fontSize: b.size,
      fontFamily: b.mono ? FONT_FAMILY.Cascadia : FONT_FAMILY.Helvetica,
      lineHeight: b.lineHeight,
      strokeColor: b.muted ? MUTED : INK,
      roughness: 0,
    };
    skeletons.push({ ...text, id: id(`text:${i}`) });
    // Excalidraw text has no bold; a second pass a hair to the right reads as one
    if (b.bold) {
      skeletons.push({ ...text, id: id(`text:${i}:b`) });
      boldIds.add(id(`text:${i}:b`));
    }
  });

  return convertToExcalidrawElements(skeletons, { regenerateIds: false }).map(
    (el) =>
      ({
        ...el,
        x: boldIds.has(el.id) ? el.x + Math.max(0.5, (el as any).fontSize / 30) : el.x,
        frameId: anchor.frameId,
        opacity: anchor.opacity,
        locked: true,
        customData: {
          [PART_KEY]: { anchorId: anchor.id, sig, ax: anchor.x, ay: anchor.y },
        },
      } as ExcalidrawElement),
  );
};

/**
 * Bring every document's drawing in line with its text, and its page in
 * line with its size. Cheap when nothing changed.
 */
export const syncDocs = (
  api: ExcalidrawImperativeAPI,
  { moving = false }: { moving?: boolean } = {},
): boolean => {
  const all = api.getSceneElementsIncludingDeleted();
  if (moving) {
    return followAnchors(api, all, PART_KEY, isDocument);
  }
  const byId = new Map(all.map((el) => [el.id, el]));
  const anchors = all.filter(isDocument);
  const live = new Set(anchors.map((a) => a.id));

  const parts = new Map<string, ExcalidrawElement[]>();
  for (const el of all) {
    const info = partInfo(el);
    if (info && !el.isDeleted) {
      parts.set(info.anchorId, [...(parts.get(info.anchorId) ?? []), el]);
    }
  }

  const replace = new Map<string, ExcalidrawElement>();
  const add: ExcalidrawElement[] = [];
  const remove = (el: ExcalidrawElement) =>
    replace.set(el.id, newElementWith(el, { isDeleted: true }));

  for (const [anchorId, els] of parts) {
    if (!live.has(anchorId)) {
      els.forEach(remove);
    }
  }

  for (let anchor of anchors) {
    let data = docOf(anchor)!;
    const laid = (anchor.customData as any)?.[LAID_KEY] as
      | { w: number; h: number }
      | undefined;
    // sized by hand: that height is the page's from now on
    if (laid && Math.abs(anchor.height - laid.h) > 0.5) {
      data = { ...data, minHeight: anchor.height };
    }
    const width = Math.max(MIN_WIDTH, anchor.width);
    const layout = layoutDoc(data.md, width);
    const height = Math.max(data.minHeight, layout.contentHeight);
    if (
      !laid ||
      Math.abs(anchor.width - width) > 0.5 ||
      Math.abs(anchor.height - height) > 0.5 ||
      Math.abs(laid.w - width) > 0.5 ||
      Math.abs(laid.h - height) > 0.5 ||
      data.minHeight !== docOf(anchor)!.minHeight
    ) {
      anchor = newElementWith(anchor, {
        width,
        height,
        customData: {
          ...anchor.customData,
          [DOC_KEY]: data,
          [LAID_KEY]: { w: width, h: height },
        },
      });
      replace.set(anchor.id, anchor);
    }

    const existing = parts.get(anchor.id) ?? [];
    const sig = signature(anchor, data);
    if (existing.length && existing.every((el) => partInfo(el)?.sig === sig)) {
      continue;
    }
    const fresh = buildParts(anchor, layout, sig);
    const freshIds = new Set(fresh.map((el) => el.id));
    for (const el of fresh) {
      const old = byId.get(el.id);
      if (old) {
        replace.set(el.id, {
          ...el,
          version: old.version + 1,
          versionNonce: randomInteger(),
          index: old.index,
        } as ExcalidrawElement);
      } else {
        add.push(el);
      }
    }
    existing.filter((el) => !freshIds.has(el.id)).forEach(remove);
  }

  const out = [...all.map((el) => replace.get(el.id) ?? el), ...add];
  const restacked = partsAboveAnchors(out, PART_KEY);
  if (!replace.size && !add.length && !restacked) {
    return false;
  }
  api.updateScene({
    elements: restacked ?? out,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
  return true;
};
