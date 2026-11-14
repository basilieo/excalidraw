// A small picture of the board for the job books page, sent after a save
// (at most every 20 seconds, so a burst of edits makes one picture).

import { exportScene } from "@excalidraw/excalidraw";

import type { JobBookConfig } from "./storage";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const EVERY_MS = 20_000;
let last = 0;
let pending: number | undefined;

const send = async (api: ExcalidrawImperativeAPI, config: JobBookConfig) => {
  last = Date.now();
  const elements = api.getSceneElements();
  if (!elements.length || !config.thumbnailUrl) {
    return;
  }
  try {
    const blob = await exportScene({
      type: "jpeg",
      data: {
        elements,
        appState: { viewBackgroundColor: "#ffffff" } as any,
        files: api.getFiles(),
      },
      config: { maxWidthOrHeight: 640 } as any,
    });
    await fetch(config.thumbnailUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "image/jpeg",
        "X-CSRFToken": config.csrfToken ?? "",
      },
      body: blob,
    });
  } catch {
    // a picture is a nicety; the board is saved either way
  }
};

export const sendThumbnailSoon = (
  api: ExcalidrawImperativeAPI,
  config: JobBookConfig,
) => {
  if (!config.thumbnailUrl || pending !== undefined) {
    return;
  }
  const wait = Math.max(0, last + EVERY_MS - Date.now());
  pending = window.setTimeout(() => {
    pending = undefined;
    if (!api.isDestroyed) {
      send(api, config);
    }
  }, wait);
};
