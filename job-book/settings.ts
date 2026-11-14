// A board's own settings: units, the paper new sheets are, whether the
// frame tool snaps to it, how sheets are colored, and the connector style.
// Saved with the board (the scene's `jobbook` key), so everyone working on a
// board sees it the same way.

import { createContext, useContext } from "react";

import { DEFAULT_PAPER } from "./paper";

import type { Orientation, Units } from "./paper";
import type { Discipline } from "./sheets";

export type ColorBy = "discipline" | "status";
/** Excalidraw's own arrow types: curved, elbow, straight */
export type ConnectorStyle = "round" | "elbow" | "sharp";

export type BoardSettings = {
  units: Units;
  paper: string;
  orientation: Orientation;
  snapFrames: boolean;
  colorBy: ColorBy;
  connector: ConnectorStyle;
  /** phase and status colors changed for this board, by code */
  colors: Record<string, string>;
  /** the board's sheet groups, once any is renamed, recoded or added */
  groups?: Discipline[];
  /** comments on the board: kept here, not as drawing, so they never print */
  comments?: BoardComment[];
};

export type CommentPost = { author: string; text: string; at: string };
export type BoardComment = {
  id: string;
  /** where the pin is on the board; or, on an element, from its corner */
  x: number;
  y: number;
  elementId?: string;
  resolved?: boolean;
  thread: CommentPost[];
};

export const DEFAULT_SETTINGS: BoardSettings = {
  units: "in",
  paper: DEFAULT_PAPER,
  orientation: "landscape",
  snapFrames: true,
  colorBy: "discipline",
  connector: "round",
  colors: {},
};

export const readSettings = (raw: unknown): BoardSettings => ({
  ...DEFAULT_SETTINGS,
  ...(raw && typeof raw === "object" ? (raw as Partial<BoardSettings>) : {}),
});

export const SettingsContext = createContext<{
  settings: BoardSettings;
  update: (patch: Partial<BoardSettings>) => void;
}>({ settings: DEFAULT_SETTINGS, update: () => {} });

export const useSettings = () => useContext(SettingsContext);
