// PDF pages onto the board, as images. Each page is rendered in the browser
// (pdf.js, loaded only when a PDF arrives) and placed at its true size, 100 px
// to the inch, so a drawing printed at 100% still measures right. By default
// every page also gets a sheet of its own, sized to the page, so a drawing set
// comes in as a sheet set.
//
// Pages are stored as JPEG images inside the board, like pasted photos. A
// 30-page set at drawing resolution is tens of MB; the fab library caps a
// board at 60 MB.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";

import { PX_PER_IN } from "./paper";
import { getSheets, nextNumber, sheetColor } from "./sheets";

import type { BoardSettings } from "./settings";
import type { SheetData } from "./sheets";
import type { FileId } from "@excalidraw/element/types";
import type {
  BinaryFileData,
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

/** pixels per inch the page is rendered at: enough to read a dimension */
const RENDER_DPI = 150;
/** and never more than this many pixels on the long side */
const MAX_PIXELS = 5000;
const GAP = 200;

export const isPdf = (file: File) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const loadPdfjs = async () => {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

const newId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "");

export const importPdf = async (
  api: ExcalidrawImperativeAPI,
  file: File,
  options: {
    /** scene point for the first page's top left; default: right of the board */
    at?: { x: number; y: number };
    asSheets: boolean;
    discipline: string;
    settings: BoardSettings;
  },
): Promise<number> => {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() })
    .promise;
  const base = file.name.replace(/\.pdf$/i, "");

  // where the first page goes
  let { x, y } = options.at ?? { x: 0, y: 0 };
  if (!options.at) {
    const els = api.getSceneElements();
    if (els.length) {
      x = Math.max(...els.map((e) => e.x + e.width)) + GAP;
      y = Math.min(...els.filter((e) => e.type === "frame").map((e) => e.y), 0);
    } else {
      const { scrollX, scrollY, zoom } = api.getAppState();
      x = 100 / zoom.value - scrollX;
      y = 100 / zoom.value - scrollY;
    }
  }

  const files: BinaryFileData[] = [];
  const skeletons: any[] = [];
  const sheets = getSheets(api.getSceneElements());

  for (let n = 1; n <= doc.numPages; n++) {
    api.setToast({
      message: `Bringing in ${file.name}: page ${n} of ${doc.numPages}…`,
      duration: Infinity,
    });
    const page = await doc.getPage(n);
    const points = page.getViewport({ scale: 1 }); // 72 points to the inch
    const widthPx = (points.width / 72) * PX_PER_IN;
    const heightPx = (points.height / 72) * PX_PER_IN;
    const scale = Math.min(
      RENDER_DPI / 72,
      MAX_PIXELS / Math.max(points.width, points.height),
    );
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d")!;
    // a page with no background of its own is white paper, not transparent
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" paints straight through; the default display intent waits on
    // animation frames, which a background tab never gets
    await page.render({ canvasContext: ctx, viewport, intent: "print" })
      .promise;

    const fileId = newId() as FileId;
    files.push({
      id: fileId,
      mimeType: "image/jpeg",
      dataURL: canvas.toDataURL("image/jpeg", 0.85) as DataURL,
      created: Date.now(),
    });
    const imageId = `pdf-${fileId}`;
    skeletons.push({
      type: "image",
      id: imageId,
      fileId,
      x,
      y,
      width: widthPx,
      height: heightPx,
      customData: { pdf: { file: file.name, page: n } },
    });

    if (options.asSheets) {
      const data: SheetData = {
        number: nextNumber(sheets, options.discipline),
        discipline: options.discipline,
        status: "draft",
        revision: "0",
        issued: "",
        // the drawing on the page has its own title block
        titleBlock: false,
      };
      sheets.push({ frame: { id: "" } as any, title: "", data });
      skeletons.push({
        type: "frame",
        children: [imageId],
        x,
        y,
        width: widthPx,
        height: heightPx,
        name: doc.numPages > 1 ? `${base} p${n}` : base,
        customData: {
          sheet: data,
          sheetColor: sheetColor(data, options.settings.colorBy),
          sheetNumber: data.number,
        },
      });
    }
    x += widthPx + GAP;
  }

  api.addFiles(files);
  const added = convertToExcalidrawElements(skeletons, {
    regenerateIds: false,
  });
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), ...added],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.setToast({
    message: `${file.name}: ${doc.numPages} page${
      doc.numPages === 1 ? "" : "s"
    } brought in`,
    duration: 3000,
  });
  return doc.numPages;
};
