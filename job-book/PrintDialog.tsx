// Print preview: every sheet as a page, and what to write them out as. Pick
// the sheets (all, a group, or one by one), a format (PDF as vectors or as
// pictures, PNG, JPEG, SVG) and, for pictures, a resolution; then download.
//
// Opened from the sheet index's print button; it lives at the top of the
// page (PrintHost, in JobBook) so it stays open whatever the sidebar does.

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { exportSheets, FORMATS, RESOLUTIONS, sheetCanvas, sheetsInOrder } from "./print";
import { disciplineOf, getGroups } from "./sheets";

import type { PrintFormat } from "./print";
import type { Sheet } from "./sheets";

let show: (() => void) | null = null;
/** open print preview */
export const openPrint = () => show?.();

const PREVIEW_DPI = 24;

const Page = ({
  sheet,
  on,
  onToggle,
}: {
  sheet: Sheet;
  on: boolean;
  onToggle: () => void;
}) => {
  const api = useExcalidrawAPI();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (api) {
      // one page after another, so the preview doesn't stall the board
      const t = window.setTimeout(async () => {
        try {
          const c = await sheetCanvas(api, sheet.frame, PREVIEW_DPI);
          if (live) {
            setSrc(c.toDataURL("image/jpeg", 0.8));
          }
        } catch {
          // a sheet that can't draw just shows its outline
        }
      }, 30);
      return () => {
        live = false;
        window.clearTimeout(t);
      };
    }
  }, [api, sheet.frame.id, sheet.frame.version]);
  const ratio = sheet.frame.height / sheet.frame.width;
  return (
    <label className={`jb-print-page${on ? "" : " is-off"}`}>
      <div className="jb-print-paper" style={{ aspectRatio: `${1 / ratio}` }}>
        {src && <img src={src} alt="" />}
      </div>
      <div className="jb-print-caption">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <span
          className="jb-chip"
          style={{ background: disciplineOf(sheet.data.discipline).color }}
        />
        <b>{sheet.data.code || sheet.data.number}</b>
        <span className="jb-print-title">{sheet.title}</span>
      </div>
    </label>
  );
};

const Dialog = ({ boardName, onClose }: { boardName: string; onClose: () => void }) => {
  const api = useExcalidrawAPI();
  const sheets = useMemo(() => (api ? sheetsInOrder(api) : []), [api]);
  const [chosen, setChosen] = useState<Set<string>>(() => {
    // the selected sheets if any are, otherwise all of them
    const sel = api ? api.getAppState().selectedElementIds : {};
    const picked = sheets.filter((s) => sel[s.frame.id]);
    return new Set((picked.length ? picked : sheets).map((s) => s.frame.id));
  });
  const [format, setFormat] = useState<PrintFormat>("pdf-vector");
  const [dpi, setDpi] = useState(300);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [busy, onClose]);

  const groups = getGroups().filter((g) =>
    sheets.some((s) => disciplineOf(s.data.discipline).code === g.code),
  );
  const toggle = (ids: string[], on: boolean) =>
    setChosen((c) => {
      const next = new Set(c);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const picked = sheets.filter((s) => chosen.has(s.frame.id));
  const fmt = FORMATS.find((f) => f.format === format)!;

  const run = async () => {
    if (!api || !picked.length) {
      return;
    }
    setError(null);
    setBusy(`0 of ${picked.length}`);
    try {
      await exportSheets(api, picked, format, dpi, boardName, (done, total) =>
        setBusy(`${done} of ${total}`),
      );
      setBusy(null);
    } catch (e) {
      console.error(e);
      setBusy(null);
      setError("That didn't work. Try the image PDF.");
    }
  };

  return (
    <div className="jb-print" role="dialog" aria-label="Print">
      <div className="jb-print-side">
        <div className="jb-print-head">
          <h2>Print</h2>
          <button type="button" className="jb-print-x" title="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <fieldset>
          <legend>Sheets</legend>
          <label className="jb-print-check">
            <input
              type="checkbox"
              checked={picked.length === sheets.length && sheets.length > 0}
              ref={(el) => {
                if (el) {
                  el.indeterminate = picked.length > 0 && picked.length < sheets.length;
                }
              }}
              onChange={(e) => toggle(sheets.map((s) => s.frame.id), e.target.checked)}
            />
            All <span className="jb-count">{sheets.length}</span>
          </label>
          {groups.map((g) => {
            const ids = sheets
              .filter((s) => disciplineOf(s.data.discipline).code === g.code)
              .map((s) => s.frame.id);
            const n = ids.filter((id) => chosen.has(id)).length;
            return (
              <label key={g.code} className="jb-print-check">
                <input
                  type="checkbox"
                  checked={n === ids.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = n > 0 && n < ids.length;
                    }
                  }}
                  onChange={(e) => toggle(ids, e.target.checked)}
                />
                <span className="jb-chip" style={{ background: g.color }} />
                {g.name} <span className="jb-count">{ids.length}</span>
              </label>
            );
          })}
        </fieldset>

        <fieldset>
          <legend>Format</legend>
          <div className="jb-print-formats">
            {FORMATS.map((f) => (
              <label key={f.format} className="jb-print-check">
                <input
                  type="radio"
                  name="jb-print-format"
                  checked={format === f.format}
                  onChange={() => setFormat(f.format)}
                />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>

        {fmt.dpi && (
          <fieldset>
            <legend>Resolution</legend>
            <div className="jb-print-dpi" role="group">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={dpi === r ? "is-on" : ""}
                  onClick={() => setDpi(r)}
                >
                  {r} dpi
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="jb-print-go">
          {error && <p className="jb-print-error">{error}</p>}
          <button
            type="button"
            className="jb-print-download"
            disabled={!picked.length || !!busy}
            onClick={run}
            data-ref="print-download"
          >
            {busy
              ? `Exporting ${busy}…`
              : `Download ${picked.length} sheet${picked.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>

      <div className="jb-print-pages">
        {!sheets.length && <p className="jb-empty">No sheets yet.</p>}
        {sheets.map((s) => (
          <Page
            key={s.frame.id}
            sheet={s}
            on={chosen.has(s.frame.id)}
            onToggle={() => toggle([s.frame.id], !chosen.has(s.frame.id))}
          />
        ))}
      </div>
    </div>
  );
};

export const PrintHost = ({ boardName }: { boardName: string }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    show = () => setOpen(true);
    return () => {
      show = null;
    };
  }, []);
  if (!open) {
    return null;
  }
  return createPortal(
    <Dialog boardName={boardName} onClose={() => setOpen(false)} />,
    document.querySelector(".excalidraw") ?? document.body,
  );
};
