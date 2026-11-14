// Where a board lives. Inside the fab library: Postgres, through the
// board's scene url. On its own (vite dev): this browser's localStorage.

export type JobBookConfig = {
  boardId: string;
  name: string;
  project: string;
  /** GET returns {scene, version}; PUT/POST {scene, version} saves */
  sceneUrl: string | null;
  /** the job book index, for the back link */
  listUrl: string | null;
  csrfToken: string | null;
  /** read-only viewers see the board but cannot save */
  canEdit: boolean;
  /** POST {name} copies the board into a new template (the fab library) */
  templateUrl?: string | null;
  isTemplate?: boolean;
};

export type StoredScene = {
  elements: readonly any[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
  /** the board's own settings (settings.ts) */
  jobbook?: unknown;
};

export type LoadResult = { scene: StoredScene | null; version: number };

export type SaveResult =
  | { status: "saved"; version: number }
  | { status: "conflict"; version: number }
  | { status: "error"; message: string };

export interface BoardStorage {
  load(): Promise<LoadResult>;
  save(scene: StoredScene, baseVersion: number): Promise<SaveResult>;
  /** best-effort save while the page is closing */
  saveOnExit(scene: StoredScene, baseVersion: number): void;
}

export const readConfig = (): JobBookConfig => {
  const node = document.getElementById("jobbook-config");
  if (node?.textContent) {
    return JSON.parse(node.textContent) as JobBookConfig;
  }
  return {
    boardId: "dev",
    name: "Dev job book",
    project: "Dev project",
    sceneUrl: null,
    listUrl: null,
    csrfToken: null,
    canEdit: true,
  };
};

class ServerStorage implements BoardStorage {
  constructor(private config: JobBookConfig) {}

  private headers() {
    return {
      "Content-Type": "application/json",
      "X-CSRFToken": this.config.csrfToken ?? "",
    };
  }

  async load(): Promise<LoadResult> {
    const res = await fetch(this.config.sceneUrl!, {
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(`Could not load the board (${res.status})`);
    }
    const data = await res.json();
    const scene =
      data.scene && Array.isArray(data.scene.elements) ? data.scene : null;
    return { scene, version: data.version ?? 0 };
  }

  async save(scene: StoredScene, baseVersion: number): Promise<SaveResult> {
    try {
      const res = await fetch(this.config.sceneUrl!, {
        method: "PUT",
        credentials: "same-origin",
        headers: this.headers(),
        body: JSON.stringify({ scene, version: baseVersion }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        return { status: "conflict", version: data.version ?? baseVersion };
      }
      if (!res.ok) {
        return {
          status: "error",
          message: data.error ?? `Save failed (${res.status})`,
        };
      }
      return { status: "saved", version: data.version };
    } catch (error: any) {
      return { status: "error", message: error?.message ?? "Offline" };
    }
  }

  saveOnExit(scene: StoredScene, baseVersion: number) {
    // keepalive lets the request outlive the page; POST is accepted as a
    // save by the server for exactly this case
    fetch(this.config.sceneUrl!, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: this.headers(),
      body: JSON.stringify({ scene, version: baseVersion }),
    }).catch(() => {});
  }
}

class LocalStorage implements BoardStorage {
  private key: string;
  constructor(config: JobBookConfig) {
    this.key = `jobbook:${config.boardId}`;
  }

  async load(): Promise<LoadResult> {
    try {
      const raw = localStorage.getItem(this.key);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    return { scene: null, version: 0 };
  }

  async save(scene: StoredScene, baseVersion: number): Promise<SaveResult> {
    const version = baseVersion + 1;
    try {
      localStorage.setItem(this.key, JSON.stringify({ scene, version }));
      return { status: "saved", version };
    } catch (error: any) {
      return { status: "error", message: error?.message ?? "Storage full" };
    }
  }

  saveOnExit(scene: StoredScene, baseVersion: number) {
    this.save(scene, baseVersion);
  }
}

export const createStorage = (config: JobBookConfig): BoardStorage =>
  config.sceneUrl ? new ServerStorage(config) : new LocalStorage(config);
