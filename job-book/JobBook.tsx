import {
  CaptureUpdateAction,
  DefaultSidebar,
  Excalidraw,
  ExcalidrawAPIProvider,
  FONT_FAMILY,
  Footer,
  MainMenu,
  newElementWith,
  Sidebar,
  THEME,
  useExcalidrawAPI,
  useHandleLibrary,
  viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AttachButton,
  AttachPicker,
  openAttachPicker,
  PaperclipIcon,
  TableIcon,
} from "./Attach";
import { Connectors } from "./Connectors";
import { SheetTable, SheetTableViewContext } from "./SheetTable";
import { SyncStatus } from "./SyncStatus";
import { sendThumbnailSoon } from "./thumbnail";
import { createTable, syncTables } from "./table/render";
import { addDocument, DocButton, DocIcon, DocLayer } from "./doc/DocLayer";
import { syncDocs } from "./doc/render";
import { createToc, syncTocs } from "./toc/render";
import { SelectionFilterButton, useSelectionFilter } from "./SelectionFilter";
import { PrintHost } from "./PrintDialog";
import { hiddenFrames, useBoardForHidden, useHiddenGroups } from "./hidden";
import { CommentButton, CommentLayer } from "./comments/CommentLayer";

/** home: back to the job books */
const BackIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
/** the sheets: binder dividers, a tab standing out of each */
const SidebarIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 3.5h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" />
    <path d="M15.5 5h3.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5M15.5 12.5h3.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5" />
  </svg>
);
/** a table of contents: a list with dots for its entries */
const ContentsIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <path d="M4 6h.01M4 12h.01M4 18h.01M8 6h12M8 12h12M8 18h8" />
  </svg>
);
/** the shape library: books on a shelf */
const LibraryIcon = (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5zM15.2 5.3l3.3-.9 3 14.5-3.3.9z" />
  </svg>
);
import { TableLayer } from "./table/TableLayer";
import { importPdf, isPdf } from "./pdf";
import { DEFAULT_SETTINGS, readSettings, SettingsContext } from "./settings";
import { SHEETS_SIDEBAR, SheetPalette, SheetsPanel } from "./SheetsPanel";
import {
  adoptFrames,
  enforceSheetSizes,
  recolorSheets,
  setColorOverrides,
  setGroups,
  syncPageNumbers,
  syncTitleBlocks,
  viewportOffsets,
} from "./sheets";

import type { BoardSettings } from "./settings";

import { createLibraryAdapter } from "./storage";

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
  settings: BoardSettings,
) => {
  let sum = 0;
  for (const el of elements) {
    sum += el.version + (el.isDeleted ? 0.5 : 0);
  }
  return `${elements.length}:${sum}:${
    Object.keys(files).length
  }:${SAVED_APP_STATE.map((k) => String(appState[k])).join(
    ",",
  )}:${JSON.stringify(settings)}`;
};

const buildScene = (
  api: ExcalidrawImperativeAPI,
  settings: BoardSettings,
): StoredScene => {
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
    jobbook: settings,
  };
};

// What the scroll wheel does: "mouse" zooms around the cursor, "trackpad"
// pans (Excalidraw's own setting, Preferences > Input). It belongs to the
// person and their computer, not the board, so it is kept in this browser
// and never saved with the board. A mouse is the default.
const INPUT_DEVICE_KEY = "jobbook.inputDevice";
const readInputDevice = (): AppState["inputDevice"] => {
  try {
    const v = localStorage.getItem(INPUT_DEVICE_KEY);
    if (v === "mouse" || v === "trackpad") {
      return v;
    }
  } catch {}
  return "mouse";
};
const writeInputDevice = (v: AppState["inputDevice"]) => {
  try {
    localStorage.setItem(INPUT_DEVICE_KEY, v);
  } catch {}
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
  // the library panel's items, and "Add to Excalidraw" from
  // libraries.excalidraw.com coming back to this board (#addLibrary=...)
  const libraryAdapter = useMemo(
    () => createLibraryAdapter(config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useHandleLibrary({ excalidrawAPI: api, adapter: libraryAdapter });
  const [status, setStatus] = useState<Status>("loading");
  const selectionFilter = useSelectionFilter();

  // sheets in hidden groups, and what's on them, stay off the board
  useBoardForHidden(config.boardId);
  const hiddenGroups = useHiddenGroups();
  const hiddenGroupsRef = useRef(hiddenGroups);
  hiddenGroupsRef.current = hiddenGroups;
  const hiddenIds = useRef<Set<string>>(new Set());
  const [hiddenKey, setHiddenKey] = useState("");
  const refreshHidden = useCallback(
    (elements: readonly ExcalidrawElement[]) => {
      const next = hiddenFrames(elements, hiddenGroupsRef.current);
      const key = [...next].sort().join(",");
      if (key !== [...hiddenIds.current].sort().join(",")) {
        hiddenIds.current = next;
        setHiddenKey(key);
      }
    },
    [],
  );
  useEffect(() => {
    if (api) {
      refreshHidden(api.getSceneElements());
    }
  }, [api, hiddenGroups, refreshHidden]);
  const isHidden = useCallback(
    (el: ExcalidrawElement) =>
      hiddenIds.current.has(el.id) ||
      (!!el.frameId && hiddenIds.current.has(el.frameId)),
    [],
  );
  const isSelectable = useCallback(
    (el: ExcalidrawElement) =>
      !isHidden(el) && selectionFilter.isSelectable(el),
    [isHidden, selectionFilter.isSelectable],
  );
  const [theme, setTheme] = useState(readTheme);
  const statusRef = useRef<Status>("loading");
  const version = useRef(0);
  const savedKey = useRef<string | null>(null);
  const currentKey = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const syncQueued = useRef(false);
  const moveQueued = useRef(false);
  const lockedSheets = useRef(new Map());
  const inputDevice = useRef(readInputDevice());
  const [settings, setSettings] = useState<BoardSettings>(DEFAULT_SETTINGS);
  const [tableView, setTableView] = useState(false);
  const settingsRef = useRef<BoardSettings>(DEFAULT_SETTINGS);

  const set = (s: Status) => {
    statusRef.current = s;
    setStatus(s);
  };

  const initialData = useMemo(
    () =>
      storage.load().then(({ scene, version: v }) => {
        version.current = v;
        const loaded = readSettings(scene?.jobbook);
        settingsRef.current = loaded;
        setColorOverrides(loaded.colors);
        setGroups(loaded.groups);
        setSettings(loaded);
        return {
          elements: scene?.elements ?? [],
          appState: {
            ...DRAWING_DEFAULTS,
            ...(scene?.appState ?? {}),
            // the sheet index starts open
            openSidebar: { name: SHEETS_SIDEBAR },
            inputDevice: inputDevice.current,
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
    const result = await storage.save(
      buildScene(api, settingsRef.current),
      version.current,
    );
    if (result.status === "saved") {
      version.current = result.version;
      savedKey.current = key;
      sendThumbnailSoon(api, config);
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
  }, [api, config, storage]);

  const onChange = useCallback(
    (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      if (!api || statusRef.current === "loading") {
        return;
      }
      if (appState.inputDevice !== inputDevice.current) {
        inputDevice.current = appState.inputDevice;
        writeInputDevice(appState.inputDevice);
      }
      refreshHidden(elements);
      // a sticky note just made is signed by whoever made it
      if (config.canEdit && config.user && !appState.newElement) {
        const unsigned = elements.filter(
          (el) =>
            el.type === "stickynote" &&
            !(el.customData as any)?.author &&
            Date.now() - (el as any).created < 60_000,
        );
        if (unsigned.length) {
          const ids = new Set(unsigned.map((el) => el.id));
          window.setTimeout(() =>
            api.updateScene({
              elements: api
                .getSceneElementsIncludingDeleted()
                .map((el) =>
                  ids.has(el.id) && !(el.customData as any)?.author
                    ? newElementWith(el, {
                        customData: { ...el.customData, author: config.user },
                      })
                    : el,
                ),
              captureUpdate: CaptureUpdateAction.NEVER,
            }),
          );
        }
      }
      const busy =
        appState.selectedElementsAreBeingDragged ||
        appState.isResizing ||
        appState.isRotating ||
        !!appState.newElement;

      // a table being dragged carries its drawing along with it
      if (
        busy &&
        appState.selectedElementsAreBeingDragged &&
        !moveQueued.current
      ) {
        moveQueued.current = true;
        requestAnimationFrame(() => {
          moveQueued.current = false;
          if (!api.isDestroyed) {
            syncTables(api, { moving: true });
            syncDocs(api, { moving: true });
            syncTocs(api, { moving: true });
          }
        });
      }

      // a frame drawn with the frame tool becomes a numbered sheet, a locked
      // sheet keeps its size, title blocks and tables follow their data;
      // none of it mid-drag
      if (!busy && !syncQueued.current) {
        syncQueued.current = true;
        // a timer, not a frame: a background tab gets no frames
        window.setTimeout(() => {
          syncQueued.current = false;
          if (!api.isDestroyed) {
            if (config.canEdit) {
              adoptFrames(api, settingsRef.current, { snap: true });
              syncPageNumbers(api, settingsRef.current.colorBy);
              enforceSheetSizes(api, lockedSheets.current);
            }
            syncTitleBlocks(api, config.project, settingsRef.current.colorBy);
            syncTables(api);
            syncDocs(api);
            syncTocs(api);
          }
        });
      }

      if (!config.canEdit) {
        return;
      }
      currentKey.current = sceneKey(
        elements,
        appState,
        files,
        settingsRef.current,
      );
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
        adoptFrames(editor, settingsRef.current, { snap: false });
        syncPageNumbers(editor, settingsRef.current.colorBy);
      }
      syncTitleBlocks(editor, config.project, settingsRef.current.colorBy);
      syncTables(editor);
      syncDocs(editor);
      syncTocs(editor);
      enforceSheetSizes(editor, lockedSheets.current);
      // what loaded counts as saved, even after title blocks are brought up
      // to date. The panel and the zoom wait a moment: the editor is still
      // applying the loaded scene's state during this callback.
      // Timers, not animation frames: a page in a background tab gets no
      // frames, and the board must still load and save there.
      window.setTimeout(() => {
        if (editor.getAppState().openSidebar?.name !== SHEETS_SIDEBAR) {
          editor.toggleSidebar({ name: SHEETS_SIDEBAR, force: true });
        }
      });
      // and the zoom waits for the panel, so it can leave room for it
      window.setTimeout(
        () => {
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
            settingsRef.current,
          );
          currentKey.current = savedKey.current;
          set(config.canEdit ? "saved" : "readonly");
          // a board with no picture on the job books page gets one now
          if (config.canEdit && !config.hasThumbnail) {
            sendThumbnailSoon(editor, config);
          }
        },
        // after the panel above has opened
        50,
      );
    },
    [config.canEdit, config.project],
  );

  /** change a board setting; it is saved with the board like any edit */
  const updateSettings = useCallback(
    (patch: Partial<BoardSettings>) => {
      const next = { ...settingsRef.current, ...patch };
      settingsRef.current = next;
      setSettings(next);
      if (!api || !config.canEdit) {
        return;
      }
      if (patch.colors) {
        setColorOverrides(next.colors);
      }
      if (patch.groups) {
        setGroups(next.groups);
      }
      if (patch.colorBy || patch.colors || patch.groups) {
        // the frames carry their color, so a new scheme or color rewrites
        // them; the change that makes then saves the setting with it
        recolorSheets(api, next.colorBy);
        return;
      }
      currentKey.current = sceneKey(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
        next,
      );
      if (currentKey.current !== savedKey.current) {
        if (statusRef.current === "saved") {
          set("unsaved");
        }
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(save, SAVE_DELAY);
      }
    },
    [api, config.canEdit, save],
  );

  /** copy the board, as saved, into a new template */
  const saveAsTemplate = useCallback(async () => {
    if (!api || !config.templateUrl) {
      return;
    }
    const name = window.prompt("Name the template", `${config.name} template`);
    if (!name) {
      return;
    }
    // the template is made from what is saved, so save what isn't yet
    window.clearTimeout(saveTimer.current);
    if (currentKey.current !== savedKey.current) {
      await save();
    }
    try {
      const res = await fetch(config.templateUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": config.csrfToken ?? "",
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? res.status);
      }
      api.setToast({
        message: `Saved as template "${data.name}". New boards can start from it on the job book page.`,
        closable: true,
        duration: 6000,
      });
    } catch (error: any) {
      api.setToast({
        message: `Could not make the template: ${error?.message ?? error}`,
        closable: true,
        duration: Infinity,
      });
    }
  }, [api, config, save]);

  // a PDF dropped on the board comes in page by page where it was dropped,
  // instead of the editor refusing it
  useEffect(() => {
    if (!api || !config.canEdit) {
      return;
    }
    const hasPdf = (dt: DataTransfer | null) =>
      !!dt &&
      Array.from(dt.items ?? []).some(
        (item) => item.kind === "file" && item.type === "application/pdf",
      );
    const onDragOver = (e: DragEvent) => {
      if (hasPdf(e.dataTransfer)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onDrop = async (e: DragEvent) => {
      const pdfs = Array.from(e.dataTransfer?.files ?? []).filter(isPdf);
      if (!pdfs.length) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const at = viewportCoordsToSceneCoords(
        { clientX: e.clientX, clientY: e.clientY },
        api.getAppState(),
      );
      for (const file of pdfs) {
        try {
          await importPdf(api, file, {
            at: { x: at.x, y: at.y },
            asSheets: true,
            discipline: "R",
            settings: settingsRef.current,
          });
        } catch (error: any) {
          api.setToast({
            message: `Could not read ${file.name}: ${error?.message ?? error}`,
            closable: true,
            duration: Infinity,
          });
        }
        at.y += 200;
      }
    };
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    return () => {
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("drop", onDrop, true);
    };
  }, [api, config.canEdit]);

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      const s = statusRef.current;
      if (api && (s === "unsaved" || s === "saving" || s === "error")) {
        storage.saveOnExit(
          buildScene(api, settingsRef.current),
          version.current,
        );
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [api, storage]);

  return (
    <SettingsContext.Provider value={{ settings, update: updateSettings }}>
      <SheetTableViewContext.Provider value={{ tableView, setTableView }}>
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
            // the full properties panel (stroke style, align, layers) on any
            // screen but a phone, instead of the compact one below 1180px
            getFormFactor: (width: number, height: number) =>
              Math.min(width, height) < 500 ? "phone" : "desktop",
            canvasActions: {
              toggleTheme: true,
              export: { saveFileToDisk: true },
              loadScene: false,
            },
          }}
          // a mouse wheel notch zooms about 7%, the same at any zoom
          mouseWheelZoomRate={0.001}
          directionalBoxSelection
          simpleTextControls
          alignFrames
          isElementSelectable={isSelectable}
          isElementHidden={isHidden}
          hiddenKey={hiddenKey}
          renderShapeActionsExtras={(selected) =>
            // one sheet selected: its details head the properties panel
            selected.length === 1 && selected[0].type === "frame" ? (
              <SheetPalette
                key={selected[0].id}
                frameId={selected[0].id}
                canEdit={config.canEdit}
              />
            ) : null
          }
          renderToolbarExtras={() =>
            config.canEdit ? (
              <>
                <DocButton />
                <AttachButton />
                <CommentButton />
              </>
            ) : null
          }
          renderExtraToolsItems={(close) =>
            config.canEdit ? (
              <>
                <MainMenu.Item
                  icon={PaperclipIcon}
                  data-ref="attach-menu"
                  onSelect={() => {
                    close();
                    openAttachPicker();
                  }}
                >
                  Attach PDF or image…
                </MainMenu.Item>
                <MainMenu.Item
                  icon={DocIcon}
                  data-ref="add-document-menu"
                  onSelect={() => {
                    close();
                    if (api) {
                      addDocument(api);
                    }
                  }}
                >
                  Document
                </MainMenu.Item>
                <MainMenu.Item
                  icon={ContentsIcon}
                  data-ref="add-contents"
                  onSelect={() => {
                    close();
                    if (api) {
                      createToc(api);
                    }
                  }}
                >
                  Table of contents
                </MainMenu.Item>
                <MainMenu.Item
                  icon={TableIcon}
                  data-ref="add-table"
                  onSelect={() => {
                    close();
                    if (api) {
                      createTable(api, 5, 4);
                    }
                  }}
                >
                  Table
                </MainMenu.Item>
              </>
            ) : null
          }
          renderTopRightUI={() => (
            <div className="jb-topright">
              <Sidebar.Trigger
                name={SHEETS_SIDEBAR}
                title="Sheets"
                className="jb-trigger"
                icon={SidebarIcon}
              />
            </div>
          )}
        >
          <MainMenu>
            {config.listUrl && (
              <MainMenu.ItemLink href={config.listUrl} icon={BackIcon}>
                Back to job books
              </MainMenu.ItemLink>
            )}
            {config.canEdit && config.templateUrl && (
              <MainMenu.Item onSelect={saveAsTemplate}>
                Save as template
              </MainMenu.Item>
            )}
            <MainMenu.DefaultItems.SaveToActiveFile />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.SearchMenu />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.Preferences />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme allowSystemTheme={false} />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>
          {/* Excalidraw's library panel, labeled, beside the Sheets button.
            "Browse libraries" in it opens libraries.excalidraw.com; what is
            added there comes back to the team's shared library. */}
          <DefaultSidebar.Trigger
            tab="library"
            title="Shape library"
            className="jb-trigger"
            icon={LibraryIcon}
          />
          <PrintHost boardName={config.name} />
          <SheetsPanel
            boardName={config.name}
            listUrl={config.listUrl}
            canEdit={config.canEdit}
            isTemplate={!!config.isTemplate}
          />
          {config.canEdit && <AttachPicker />}
          <Footer>
            <SyncStatus status={status} label={STATUS_LABEL[status]} />
            <SelectionFilterButton
              off={selectionFilter.off}
              setOff={selectionFilter.setOff}
            />
          </Footer>
        </Excalidraw>
        {tableView && <SheetTable onClose={() => setTableView(false)} />}
        <TableLayer canEdit={config.canEdit} />
        <DocLayer canEdit={config.canEdit} />
        <CommentLayer user={config.user ?? ""} canEdit={config.canEdit} />
        {config.canEdit && <Connectors />}
      </SheetTableViewContext.Provider>
    </SettingsContext.Provider>
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
