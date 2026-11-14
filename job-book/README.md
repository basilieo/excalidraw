# job book

A sheet-set board built on this fork of Excalidraw, embedded in the NP
fabrication library at `/job-book/` (that repo: `catalog/backend/jobbook/`,
whose `JOBBOOK.md` has the whole picture).

Frames are **sheets**. Each carries a number, a discipline, a revision and an
issue date in `customData.sheet`; the panel on the right lists them grouped by
discipline, and every sheet gets a generated title block that follows its
data. Reorder by dragging in the panel, or "renumber" a discipline in reading
order on the board.

## Files

- `sheets.ts`: the sheet model, disciplines, numbering, title block generation
  and the sync that keeps title blocks in step with their frames
- `SheetsPanel.tsx`: the sheet index and the selected sheet's editor
- `JobBook.tsx`: the editor wrapper: loading, autosave with a version check,
  theme shared with the fab library
- `storage.ts`: where a board lives (the fab library's API, or localStorage
  when run on its own)
- `settings.ts`: the board's own settings (units, paper, frame snapping,
  color scheme, connector style), saved in the scene under `jobbook`
- `paper.ts`: paper sizes and units, 100 px to the inch
- `pdf.ts`: PDF pages in as images (pdf.js, loaded on first use)
- `table.ts`: a plain grouped grid of boxes
- `table/`: Numbers-style tables. `model.ts` (data, sort, filter),
  `formula.ts` (+ tests), `layout.ts` (wrapping, row heights), `render.ts`
  (the locked canvas drawing, kept in step like title blocks) and
  `TableLayer.tsx` (click-to-type cells, the table handle, toolbars)
- `SheetTable.tsx`: the sheet index as a spreadsheet, for bulk edits
- `Attach.tsx`: the paperclip and the ⋮ menu's "Attach PDF or image"
- `SyncStatus.tsx`: the save status icon in the bottom bar
- `Connectors.tsx`: the four dots beside a selected shape; dragging one
  starts Excalidraw's own arrow tool at that edge, so binding and routing are
  the editor's

## Changes to Excalidraw itself

Kept small so merging upstream stays easy. `getFrameSheetAccent` in
`packages/element/src/frame.ts` reads `customData.sheetNumber` and
`customData.sheetColor`; the frame label (`components/App.tsx`), the canvas
outline (`renderElement.ts`) and SVG export (`staticSvgScene.ts`) use it.
Frames without those fields look exactly as upstream.

Also small, and marked `job book (fork)` in the code:

- `renderToolbarExtras` and `renderExtraToolsItems` props
  (`types.ts`, `index.tsx`, `components/Toolbar.tsx`): the host adds buttons
  to the main toolbar and entries to its ⋮ more-tools menu.
- The lock action (`actions/actionElementLock.ts`) gets a button, shown in
  the selected shape's left panel beside duplicate and delete
  (`components/Actions.tsx`).

## Running

```
npx vite                 # on its own, port 3010, boards in localStorage
JOBBOOK_BASE=/static/jobbook/ JOBBOOK_OUT=<fab library>/catalog/backend/jobbook/static/jobbook npx vite build
```

The fab library's `catalog/backend/jobbook/build.sh` runs the build for you.

## Keeping up with upstream

```
git fetch upstream
git merge upstream/master
```
