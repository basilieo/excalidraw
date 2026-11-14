import { Popover } from "radix-ui";

import { MOBILE_ACTION_BUTTON_BG } from "@excalidraw/common";

import type { FontFamilyValues } from "@excalidraw/element/types";

import { t } from "../../i18n";
import { IconButton } from "../IconButton";
import { TextIcon } from "../icons";

import { useExcalidrawSetAppState } from "../App";
import { Fonts } from "../../fonts";

import { getFontFamilyLabel } from "./FontPickerList";

interface FontPickerTriggerProps {
  selectedFontFamily: FontFamilyValues | null;
  isOpened?: boolean;
  compactMode?: boolean;
  selectorMode?: boolean;
}

export const FontPickerTrigger = ({
  selectedFontFamily,
  isOpened = false,
  compactMode = false,
  selectorMode = false,
}: FontPickerTriggerProps) => {
  const setAppState = useExcalidrawSetAppState();

  // job book (fork): a dropdown that names the font
  if (selectorMode) {
    const name = selectedFontFamily
      ? getFontFamilyLabel(
          selectedFontFamily,
          Fonts.registered.get(selectedFontFamily)?.fontFaces ?? [],
        )
      : "—";
    return (
      <Popover.Trigger asChild>
        <button
          type="button"
          data-openpopup="fontFamily"
          data-testid="font-family-show-fonts"
          className={`FontPicker__select${isOpened ? " is-open" : ""}`}
          title={t("labels.showFonts")}
          onClick={() =>
            setAppState((appState) => ({
              openPopup:
                appState.openPopup === "fontFamily" ? null : appState.openPopup,
            }))
          }
        >
          <span>{name}</span>
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Popover.Trigger>
    );
  }

  const compactStyle = compactMode
    ? {
        ...MOBILE_ACTION_BUTTON_BG,
        width: "2rem",
        height: "2rem",
      }
    : {};

  return (
    <Popover.Trigger asChild>
      <div data-openpopup="fontFamily" className="properties-trigger">
        <IconButton
          type="toggle"
          icon={TextIcon}
          title={t("labels.showFonts")}
          aria-label={t("labels.showFonts")}
          className="standalone properties-trigger"
          data-testid="font-family-show-fonts"
          checked={isOpened}
          onSelect={() => {
            setAppState((appState) => ({
              openPopup:
                appState.openPopup === "fontFamily" ? null : appState.openPopup,
            }));
          }}
          style={{
            border: "none",
            ...compactStyle,
          }}
        />
      </div>
    </Popover.Trigger>
  );
};
