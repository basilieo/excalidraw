import {
  Excalidraw,
  ExcalidrawAPIProvider,
  FONT_FAMILY,
  MainMenu,
  Sidebar,
  THEME,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SHEETS_SIDEBAR, SheetsPanel } from "./SheetsPanel";
import { adoptFrames, syncTitleBlocks, viewportOffsets } from "./sheets";

import type { BoardStorage, JobBookConfig, StoredScene } from "./storage";
import type { ExcalidrawElement } from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

type Status =
  | "loading"
  | "saved"
  | "unsaved"
  | "saving"
  | "conflict"
  | "error"
  | "readonly";

const STATUS_LABEL: Record<Status, string> = {
  loading: "Loading…",
  saved: "Saved",
  unsaved: "Unsaved",
  saving: "Saving…",
  conflict: "Not saving: newer version on the server",
  error: "Save failed, retrying",
  readonly: "View only",
};

const SAVE_DELAY = 1000;
const RETRY_DELAY = 5000;

// A board reads like a drawing set, not a sketch: crisp lines and Helvetica
// unless someone picks otherwise. Saved with the board once changed.
const DRAWING_DEFAULTS: Partial<AppState> = {
  currentItemFontFamily: FONT_FAMILY.Helvetica,
  currentItemRoughness: 0,
  viewBackgroundColor: "#ffffff",
};

const SAVED_APP_STATE = [
  "viewBackgroundColor",
  "gridSize",
  "gridStep",
  "gridModeEnabled",
  "currentItemFontFamily",
  "currentItemRoughness",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
] as const;

/** cheap fingerprint of what would be saved; changes when any element does */
const sceneKey = (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => {
  let sum = 0;
  for (const el of elements) {
    sum += el.version + (el.isDeleted ? 0.5 : 0);
  }
  return `${elements.length}:${sum}:${
    Object.keys(files).length
  }:${SAVED_APP_STATE.map((k) => String(appState[k])).join(",")}`;
};

const buildScene = (api: ExcalidrawImperativeAPI): StoredScene => {
  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const allFiles = api.getFiles();
  // only the images still on the board
  const files: StoredScene["files"] = {};
  for (const el of elements) {
    if (el.type === "image" && el.fileId && allFiles[el.fileId]) {
      files[el.fileId] = allFiles[el.fileId];
    }
  }
  return {
    elements,
    appState: Object.fromEntries(SAVED_APP_STATE.map((k) => [k, appState[k]])),
    files,
  };
};

// light / dark is shared with the rest of the fab library, which keeps the
// pick in localStorage under "theme"
const readTheme = () => {
  try {
    const t = localStorage.getItem("theme");
    if (t === "dark" || t === "light") {
      return t;
    }
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches
    ? THEME.DARK
    : THEME.LIGHT;
};

const Editor = ({
  config,
  storage,
}: {
  config: JobBookConfig;
  storage: BoardStorage;
}) => {
  const api = useExcalidrawAPI();
  const [status, setStatus] = useState<Status>("loading");
  const [theme, setTheme] = useState(readTheme);
  const statusRef = useRef<Status>("loading");
  const version = useRef(0);
  const savedKey = useRef<string | null>(null);
  const currentKey = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const syncQueued = useRef(false);

  const set = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  const initialData = useMemo(
    () =>
      storage.load().then(({ scene, version: v }) => {
        version.current = v;
        return {
          elements: scene?.elements ?? [],
          appState: {
            ...DRAWING_DEFAULTS,
            ...(scene?.appState ?? {}),
            // the sheet index starts open
            openSidebar: { name: SHEETS_SIDEBAR },
          },
          files: (scene?.files ?? {}) as BinaryFiles,
          scrollToContent: true,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const save = useCallback(async () => {
    if (!api || !config.canEdit) {
      return;
    }
    const s = statusRef.current;
    if (s === "saving" || s === "conflict") {
      return;
    }
    const key = currentKey.current;
    set("saving");
    const result = await storage.save(buildScene(api), version.current);
    if (result.status === "saved") {
      version.current = result.version;
      savedKey.current = key;
      if (currentKey.current !== key) {
        set("unsaved");
        saveTimer.current = window.setTimeout(save, SAVE_DELAY);
      } else {
        set("saved");
      }
    } else if (result.status === "conflict") {
      set("conflict");
      api.setToast({
        message:
          "Someone else saved this job book after you opened it, so saving here has stopped to avoid overwriting their work. Reload the page to get their version.",
        closable: true,
        duration: Infinity,
      });
    } else {
      set("error");
      saveTimer.current = window.setTimeout(() => {
        if (statusRef.current === "error") {
          set("unsaved");
          save();
        }
      }, RETRY_DELAY);
    }
  }, [api, config.canEdit, storage]);

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      if (!api || statusRef.current === "loading") {
        return;
      }
      const busy =
        appState.selectedElementsAreBeingDragged ||
        appState.isResizing ||
        appState.isRotating ||
        !!appState.newElement;

      // a frame drawn with the frame tool becomes a numbered sheet, and title
      // blocks follow their frames, but not mid-drag
      if (!busy && !syncQueued.current) {
        syncQueued.current = true;
        requestAnimationFrame(() => {
          syncQueued.current = false;
          if (!api.isDestroyed) {
            if (config.canEdit) {
              adoptFrames(api);
            }
            syncTitleBlocks(api, config.project);
          }
        });
      }

      if (!config.canEdit) {
        return;
      }
      currentKey.current = sceneKey(elements, appState, files);
      if (currentKey.current === savedKey.current) {
        return;
      }
      if (statusRef.current === "saved") {
        set("unsaved");
      }
      window.clearTimeout(saveTimer.current);
      if (!busy) {
        saveTimer.current = window.setTimeout(save, SAVE_DELAY);
      }
    },
    [api, config.canEdit, config.project, save],
  );

  const onInitialize = useCallback(
    (editor: ExcalidrawImperativeAPI) => {
      if (config.canEdit) {
        adoptFrames(editor);
      }
      syncTitleBlocks(editor, config.project);
      // what loaded counts as saved, even after title blocks are brought up
      // to date. The panel and the zoom wait a frame: the editor is still
      // applying the loaded scene's state during this callback.
      requestAnimationFrame(() => {
        if (editor.getAppState().openSidebar?.name !== SHEETS_SIDEBAR) {
          editor.toggleSidebar({ name: SHEETS_SIDEBAR, force: true });
        }
      });
      // and the zoom waits for the panel, so it can leave room for it
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const elements = editor.getSceneElements();
          if (elements.length) {
            editor.setViewport({
              target: elements,
              fit: "contain",
              animation: false,
              offsets: viewportOffsets(),
            });
          }
          savedKey.current = sceneKey(
            editor.getSceneElementsIncludingDeleted(),
            editor.getAppState(),
            editor.getFiles(),
          );
          currentKey.current = savedKey.current;
          set(config.canEdit ? "saved" : "readonly");
        }),
      );
    },
    [config.canEdit, config.project],
  );

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      const s = statusRef.current;
      if (api && (s === "unsaved" || s === "saving" || s === "error")) {
        storage.saveOnExit(buildScene(api), version.current);
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [api, storage]);

  return (
    <Excalidraw
      initialData={initialData}
      onChange={onChange}
      onInitialize={onInitialize}
      name={config.name}
      theme={theme}
      onThemeChange={(t) => {
        if (t === "system") {
          try {
            localStorage.removeItem("theme");
          } catch {}
          setTheme(readTheme());
          return;
        }
        setTheme(t);
        try {
          localStorage.setItem("theme", t);
        } catch {}
      }}
      viewModeEnabled={!config.canEdit}
      handleKeyboardGlobally
      autoFocus
      UIOptions={{
        canvasActions: {
          toggleTheme: true,
          export: { saveFileToDisk: true },
          loadScene: false,
        },
      }}
      renderTopRightUI={() => (
        <div className="jb-topright">
          <span
            className={`jb-status is-${status}`}
            data-ref="save-status"
            title={STATUS_LABEL[status]}
          >
            {STATUS_LABEL[status]}
          </span>
          <Sidebar.Trigger
            name={SHEETS_SIDEBAR}
            title="Sheet index"
            className="jb-trigger"
          >
            Sheets
          </Sidebar.Trigger>
        </div>
      )}
    >
      <MainMenu>
        {config.listUrl && (
          <MainMenu.ItemLink href={config.listUrl}>
            All job books
          </MainMenu.ItemLink>
        )}
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.Help />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme allowSystemTheme={false} />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
      </MainMenu>
      <SheetsPanel
        boardName={config.name}
        listUrl={config.listUrl}
        canEdit={config.canEdit}
        status={{ key: status, label: STATUS_LABEL[status] }}
      />
    </Excalidraw>
  );
};

export const JobBook = (props: {
  config: JobBookConfig;
  storage: BoardStorage;
}) => (
  <ExcalidrawAPIProvider>
    <div className="jb-app">
      <Editor {...props} />
    </div>
  </ExcalidrawAPIProvider>
);
