# Solitaire — Controls & Interaction Fixes

**Date:** 2026-06-21
**Status:** Approved design

## Problem

Four player-reported issues with the XP-style Solitaire (`index.html`, mirrored in
the byte-identical `solitaire.html`):

1. **Dragging is unreliable** with both mouse and finger — a card begins to move,
   stops shortly after, and then becomes hard to select.
2. **Mobile has no tap-friendly controls** — actions like New and Undo live only in
   desktop dropdown menus.
3. **No redo** — there is an undo history but no way to redo.
4. **Stacked tableau cards overlap too much** — every card uses the same small
   vertical offset, so it is hard to see the cards underneath.

## Goals

- Make card dragging reliable across mouse and touch.
- Add an always-visible on-screen button bar (mobile **and** desktop): New, Undo,
  Redo, Hint.
- Implement redo, paired with undo.
- Space face-up tableau cards farther apart than face-down cards for readability.

## Non-goals

- No change to game rules, scoring, solver/hint logic, or card artwork.
- No general refactor beyond what these changes require.

## Current implementation (reference)

- Single file `index.html` (1431 lines), vanilla JS; `solitaire.html` is identical.
- Drag uses Pointer Events on `#felt` with `setPointerCapture`; a `#drag-layer`
  holds the moving cards while originals are hidden. A 5px movement threshold
  distinguishes a tap (auto-move) from a deliberate drag.
- `#felt` has **no `touch-action`** declared, and there is **no `pointercancel`
  handler**.
- Controls: only desktop dropdown menus (`Game`, `Help`); no on-screen buttons.
- History: `history = []` with `pushHistory()` / `undo()`. **No redo stack.**
- Layout constants: `COL_W, ROW, TOP, GAP` (desktop `ROW=16`; mobile `ROW=17`).
  Tableau cards are placed at `tableauTop + ri * ROW` — one flat offset for every
  card regardless of `card.faceUp`.
- Cards expose `card.faceUp`; `cardEl()` renders a face-down card as `.card.back`.

## Design

### 1. Drag reliability (mouse + touch)

Root cause (touch): with the default `touch-action: auto`, the browser claims the
gesture as a scroll once the finger moves, firing `pointercancel` and aborting the
drag. With no `pointercancel` handler the drag state is left half-torn-down, which
also degrades subsequent selection.

Changes:

- Add `touch-action: none` to `#felt` (and/or `.card`) so touch gestures stay with
  the drag handler.
- Add a `pointercancel` / `lostpointercapture` handler that cleanly tears down the
  drag: remove the `#drag-layer` cards, call `render()` to restore visibility, and
  set `drag = null`.
- Guard against native HTML5 drag of the glyph text (set `draggable=false` on cards
  and/or `preventDefault` on `dragstart`) — the most likely cause of the *mouse*
  "stops quickly" symptom. **Reproduce and confirm the mouse case during
  implementation** (systematic-debugging) rather than assuming.
- Preserve the existing 5px tap-vs-drag threshold so single-tap auto-move still
  works.

### 2. On-screen button bar (mobile and desktop)

- Add a `#toolbar` strip between `#felt` and `#statusbar` containing four buttons:
  **New · Undo · Redo · Hint**.
- XP-styled to match the existing chrome. On mobile, touch targets are ≥44px tall.
- Additive only: desktop dropdown menus and keyboard shortcuts are unchanged.
- Wiring to existing logic:
  - **New** → `newGame()` via the existing confirm dialog.
  - **Undo** → `undo()`.
  - **Redo** → new `redo()` (see below).
  - **Hint** → existing hint logic.
- Undo and Redo buttons reflect a disabled state when their stacks are empty.

### 3. Redo

- Add `redoStack = []` alongside `history`.
- **Undo:** push current state onto `redoStack`, restore the top of `history`.
- **Redo:** push current state onto `history`, restore the top of `redoStack`.
- **Any new move** (real `pushHistory()` followed by a successful move) clears
  `redoStack` — standard redo semantics.
- Keyboard: `Ctrl/Cmd+Y` and `Ctrl/Cmd+Shift+Z` trigger redo. Existing `Ctrl+Z`
  undo is unchanged.
- After undo/redo, refresh the toolbar button disabled states.

### 4. Tableau stacking — tight face-down, wider face-up

- Replace the single `ROW` offset with two constants:
  - `ROW_DOWN` — tight offset for face-down (hidden) cards.
  - `ROW_UP` — wider offset for face-up cards.
- Place tableau cards by a running vertical offset: after placing each card,
  advance the offset by `ROW_UP` if that card is face-up, else `ROW_DOWN`.
- Proposed starting values (tuned during implementation to avoid long columns
  overflowing the felt, especially on mobile):
  - Desktop: `ROW_DOWN ≈ 9`, `ROW_UP ≈ 24`.
  - Mobile: `ROW_DOWN ≈ 10`, `ROW_UP ≈ 26`.
- The dragged stack uses `ROW_UP` for its internal spacing (moving cards are always
  face-up).

## File sync

`index.html` and `solitaire.html` are byte-identical. Every change is applied to
**both** files so they stay in sync. (A follow-up to deduplicate them is out of
scope here.)

## Testing / verification

- Manual: drag a single card and a multi-card sequence with both mouse and touch
  (or touch emulation); confirm cards follow the pointer to release without
  stalling, and that a cancelled gesture leaves the board in a clean state.
- Manual: tap each toolbar button on mobile and desktop; confirm New/Undo/Redo/Hint
  behave correctly and Undo/Redo disable when their stacks are empty.
- Manual: undo several moves, redo them, then make a new move and confirm the redo
  stack is cleared.
- Manual: deal a game and confirm face-up cards reveal more than face-down cards and
  long columns still fit on screen (desktop and mobile).
- Existing automated tests in `tests/` continue to pass.
