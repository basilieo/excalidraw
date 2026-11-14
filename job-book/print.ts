// Sheets out of the board: as PDF (vector or image), PNG, JPEG or SVG, at
// their paper size. The board is drawn at 100 px to the inch (paper.ts), so
// a sheet's page size comes straight from its frame, and a resolution in dpi
// is a scale of dpi / 100.
//
// Vector PDF draws each sheet's SVG into the PDF (svg2pdf), so lines and
// text stay sharp at any zoom; image PDF puts a picture of each sheet on
// its page, for anything the vector route draws wrong.

import { exportScene } from "@excalidraw/excalidraw";

import { PX_PER_IN } from "./paper";
import { sortSheets, getSheets } from "./sheets";

import type { Sheet } from "./sheets";
import type { ExcalidrawFrameElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export type PrintFormat = "pdf-vector" | "pdf-image" | "png" | "jpeg" | "svg";

export const FORMATS: { format: PrintFormat; label: string; dpi: boolean }[] = [
  { format: "pdf-vector", label: "PDF, vector", dpi: false },
  { format: "pdf-image", label: "PDF, image", dpi: true },
  { format: "png", label: "PNG", dpi: true },
  { format: "jpeg", label: "JPEG", dpi: true },
  { format: "svg", label: "SVG", dpi: false },
];

export const RESOLUTIONS = [72, 150, 300, 600];

const data = (api: ExcalidrawImperativeAPI) => ({
  elements: api.getSceneElements(),
  appState: {
    ...api.getAppState(),
    exportBackground: true,
    viewBackgroundColor: "#ffffff",
  } as any,
  files: api.getFiles(),
});

const config = (frame: ExcalidrawFrameElement, scale: number) => ({
  exportingFrame: frame as any,
  padding: 0,
  scale,
  theme: "light" as const,
  canvasBackgroundColor: "#ffffff",
});

/** one sheet as a picture, at a resolution */
export const sheetCanvas = (
  api: ExcalidrawImperativeAPI,
  frame: ExcalidrawFrameElement,
  dpi: number,
) =>
  exportScene({
    type: "canvas",
    data: data(api),
    config: config(frame, dpi / PX_PER_IN),
  });

const sheetSvg = (api: ExcalidrawImperativeAPI, frame: ExcalidrawFrameElement) =>
  exportScene({ type: "svg", data: data(api), config: config(frame, 1) });

const inches = (frame: ExcalidrawFrameElement) => ({
  w: frame.width / PX_PER_IN,
  h: frame.height / PX_PER_IN,
});

const safeName = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "sheet";

const download = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const sheetName = (s: Sheet) =>
  safeName(`${s.data.code || s.data.number} ${s.title}`);

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export"))), type, quality),
  );

const newPdf = async (first: ExcalidrawFrameElement) => {
  const { jsPDF } = await import("jspdf");
  const { w, h } = inches(first);
  return new jsPDF({
    unit: "in",
    format: [w, h],
    orientation: w >= h ? "landscape" : "portrait",
    compress: true,
  });
};

/**
 * Write the sheets out in a format: one PDF for all of them, or a file per
 * sheet for pictures and SVG. `progress` hears how far along it is.
 */
export const exportSheets = async (
  api: ExcalidrawImperativeAPI,
  sheets: Sheet[],
  format: PrintFormat,
  dpi: number,
  fileName: string,
  progress: (done: number, total: number) => void = () => {},
) => {
  if (!sheets.length) {
    return;
  }
  const total = sheets.length;
  if (format === "pdf-vector" || format === "pdf-image") {
    const pdf = await newPdf(sheets[0].frame);
    const svg2pdf =
      format === "pdf-vector" ? (await import("svg2pdf.js")).svg2pdf : null;
    for (let i = 0; i < total; i++) {
      const { frame } = sheets[i];
      const { w, h } = inches(frame);
      if (i) {
        pdf.addPage([w, h], w >= h ? "landscape" : "portrait");
      }
      if (svg2pdf) {
        const svg = await sheetSvg(api, frame);
        // svg2pdf measures text, so the drawing has to be in the page
        svg.style.position = "fixed";
        svg.style.left = "-100000px";
        document.body.appendChild(svg);
        try {
          await svg2pdf(svg, pdf, { x: 0, y: 0, width: w, height: h });
        } finally {
          svg.remove();
        }
      } else {
        const canvas = await sheetCanvas(api, frame, dpi);
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h, undefined, "FAST");
      }
      progress(i + 1, total);
    }
    download(pdf.output("blob"), `${safeName(fileName)}.pdf`);
    return;
  }
  for (let i = 0; i < total; i++) {
    const s = sheets[i];
    if (format === "svg") {
      const svg = await sheetSvg(api, s.frame);
      const text = new XMLSerializer().serializeToString(svg);
      download(new Blob([text], { type: "image/svg+xml" }), `${sheetName(s)}.svg`);
    } else {
      const canvas = await sheetCanvas(api, s.frame, dpi);
      const type = format === "png" ? "image/png" : "image/jpeg";
      download(
        await toBlob(canvas, type, format === "jpeg" ? 0.92 : undefined),
        `${sheetName(s)}.${format === "png" ? "png" : "jpg"}`,
      );
    }
    progress(i + 1, total);
    // browsers take several downloads better one at a time
    await new Promise((r) => window.setTimeout(r, 250));
  }
};

/** the board's sheets, in page order */
export const sheetsInOrder = (api: ExcalidrawImperativeAPI) =>
  sortSheets(getSheets(api.getSceneElements()));
