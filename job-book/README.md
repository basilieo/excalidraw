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

## Changes to Excalidraw itself

Kept small so merging upstream stays easy. `getFrameSheetAccent` in
`packages/element/src/frame.ts` reads `customData.sheetNumber` and
`customData.sheetColor`; the frame label (`components/App.tsx`), the canvas
outline (`renderElement.ts`) and SVG export (`staticSvgScene.ts`) use it.
Frames without those fields look exactly as upstream.

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
