// The paperclip in the toolbar: attach PDFs and images to the board.
// A PDF's pages come in as sheets (pdf.ts); an image goes in the middle of
// the view at its own size, no wider than the view.

import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useEffect, useRef, useState } from "react";

import { importPdf, isPdf } from "./pdf";
import { useSettings } from "./settings";

import type { FileId } from "@excalidraw/element/types";
import type {
  DataURL,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

const readDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const naturalSize = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = src;
  });

export const insertImageFile = async (
  api: ExcalidrawImperativeAPI,
  file: File,
) => {
  const dataURL = await readDataURL(file);
  const size = await naturalSize(dataURL);
  const { scrollX, scrollY, width, height, zoom } = api.getAppState();
  const max = (width / zoom.value) * 0.6;
  const scale = Math.min(1, max / size.width);
  const w = size.width * scale;
  const h = size.height * scale;
  const fileId = (
    crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`
  ).replace(/-/g, "") as FileId;
  api.addFiles([
    {
      id: fileId,
      mimeType: file.type as any,
      dataURL: dataURL as DataURL,
      created: Date.now(),
    },
  ]);
  const [image] = convertToExcalidrawElements([
    {
      type: "image",
      fileId,
      x: width / 2 / zoom.value - scrollX - w / 2,
      y: height / 2 / zoom.value - scrollY - h / 2,
      width: w,
      height: h,
    } as any,
  ]);
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), image],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  api.selection.select([image.id], {
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

export const PaperclipIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21.4 11.1l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
  </svg>
);

// One file picker for the board, opened by the paperclip in the toolbar and
// by "Attach PDF or image" in the ⋮ menu.
let openPicker: (() => void) | null = null;
export const openAttachPicker = () => openPicker?.();

export const AttachPicker = () => {
  const api = useExcalidrawAPI();
  const { settings } = useSettings();
  const input = useRef<HTMLInputElement>(null);
  const [, setBusy] = useState(false);

  useEffect(() => {
    openPicker = () => input.current?.click();
    return () => {
      openPicker = null;
    };
  }, []);

  const attach = async (files: File[]) => {
    if (!api) {
      return;
    }
    setBusy(true);
    for (const file of files) {
      try {
        if (isPdf(file)) {
          await importPdf(api, file, {
            asSheets: true,
            discipline: "R",
            settings,
          });
        } else if (file.type.startsWith("image/")) {
          await insertImageFile(api, file);
        } else {
          api.setToast({
            message: `${file.name}: only PDFs and images can be attached`,
            closable: true,
            duration: 4000,
          });
        }
      } catch (error: any) {
        api.setToast({
          message: `Could not attach ${file.name}: ${error?.message ?? error}`,
          closable: true,
          duration: Infinity,
        });
      }
    }
    setBusy(false);
  };

  return (
    <input
      ref={input}
      type="file"
      accept="application/pdf,.pdf,image/*"
      multiple
      hidden
      data-ref="attach-input"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) {
          attach(files);
        }
      }}
    />
  );
};

export const AttachButton = () => (
  <button
    type="button"
    className="jb-tool-button"
    data-ref="attach"
    title="Attach a PDF or image (each PDF page becomes a sheet)"
    aria-label="Attach a PDF or image"
    onClick={openAttachPicker}
  >
    {PaperclipIcon}
  </button>
);

export const TableIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M3 14.5h18M9 4v16M15 4v16" />
  </svg>
);
