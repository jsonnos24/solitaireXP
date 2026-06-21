# Controls & Interaction Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix unreliable card dragging, add an on-screen New/Undo/Redo/Hint button bar, implement redo, and space face-up tableau cards farther apart than face-down ones.

**Architecture:** All changes live in the single-file vanilla-JS game `index.html`. Drag uses Pointer Events on `#felt` with `setPointerCapture`; we harden it for touch. A new `#toolbar` strip sits between `#felt` and `#statusbar`. Redo is a second history stack mirroring the existing `history` array. Tableau layout switches from one flat row offset to two (face-down vs face-up).

**Tech Stack:** Plain HTML/CSS/JS (no build, no framework). Game engine in `engine.js`, mirrored inline inside the HTML. Tests use Node's built-in test runner (`node --test`).

## Global Constraints

- **Two files must stay byte-identical:** `index.html` and `solitaire.html` are identical. Apply every change to **both**. After each task, verify with `diff -q index.html solitaire.html` → must print nothing (identical).
- **No new test infrastructure:** These are DOM/CSS/interaction changes. There is no DOM test harness and adding one (jsdom/Playwright) is out of scope. Each task is verified by opening the app in a browser and observing behavior, plus running the engine suite as a regression guard.
- **Engine regression guard:** `node --test tests/engine.test.mjs` must continue to report `pass 47 / fail 0` after every task (no task should change `engine.js` or the inlined engine).
- **No changes to game rules, scoring, solver/hint logic, or card artwork.**
- **Manual verification command (macOS):** `open index.html` opens the app in the default browser. For touch behavior, use the browser devtools device-toolbar (touch emulation) or a real phone.

---

## File Structure

- `index.html` — the entire app (CSS in `<style>`, engine + UI in `<script>`). All edits land here.
- `solitaire.html` — byte-identical copy; receives the same edits.
- `tests/engine.test.mjs` — existing engine unit tests; unchanged, used as a regression guard.

No new files are created.

---

## Task 1: Harden drag for mouse and touch

**Files:**
- Modify: `index.html` (CSS `#felt` rule ~line 42; new JS listeners near the drag handlers ~line 1109)
- Modify: `solitaire.html` (same edits)

**Interfaces:**
- Consumes: existing module-scope `let drag` (line 1000), `felt` element, `render()` (line 762), `dragLayer`.
- Produces: a `cancelDrag()` function that safely tears down an in-progress drag.

**Background:** `#felt` currently has no `touch-action`, so on touch the browser claims the gesture as a scroll, fires `pointercancel`, and aborts the drag mid-move. There is no `pointercancel` handler, so `drag` is left set and the moving cards stay in `#drag-layer`. We add `touch-action: none`, a clean cancel path, and a guard against native HTML5 element dragging (the likely cause of the mouse "stops quickly" symptom).

- [ ] **Step 1: Add `touch-action: none` to the felt**

In `index.html`, find the `#felt` rule:

```css
  #felt {
    flex: 1; position: relative;
    background: radial-gradient(circle at 50% 0%, var(--felt), var(--felt-dark));
    padding: 16px;
  }
```

Replace it with:

```css
  #felt {
    flex: 1; position: relative;
    background: radial-gradient(circle at 50% 0%, var(--felt), var(--felt-dark));
    padding: 16px;
    touch-action: none;
  }
```

- [ ] **Step 2: Add the cancel/teardown handlers and native-drag guard**

In `index.html`, find the end of the `pointerup` handler block (it ends with `if (moved) afterMove();` and a closing `});` around line 1109). Immediately **after** that closing `});`, add:

```javascript
    function cancelDrag() {
      if (!drag) return;
      drag.els.forEach(({ ce }) => ce.remove());
      drag = null;
      render();
    }
    // A scroll/gesture the browser steals mid-drag fires pointercancel; releasing
    // pointer capture fires lostpointercapture. Both must leave a clean board.
    felt.addEventListener('pointercancel', cancelDrag);
    felt.addEventListener('lostpointercapture', cancelDrag);
    // Block the browser's native element/text drag, which otherwise hijacks a
    // mouse drag a few pixels in.
    felt.addEventListener('dragstart', (e) => e.preventDefault());
```

Note: on a normal `pointerup`, the handler sets `drag = null` first, so the implicit `lostpointercapture` that follows finds `drag` null and no-ops. `cancelDrag` only acts on an interrupted drag.

- [ ] **Step 3: Apply the identical edits to `solitaire.html`**

Repeat Step 1 and Step 2 on `solitaire.html`.

- [ ] **Step 4: Verify the two files are still identical**

Run: `diff -q index.html solitaire.html`
Expected: no output (files identical).

- [ ] **Step 5: Verify engine tests still pass**

Run: `node --test tests/engine.test.mjs`
Expected: `pass 47` / `fail 0`.

- [ ] **Step 6: Manually verify drag in a browser**

Run: `open index.html`

Check all of the following:
- **Mouse:** press a tableau card and drag slowly across the board — the card (or stack) follows the cursor the whole way and drops on release; it does not stall a few pixels in.
- **Touch (devtools device toolbar, touch emulation):** press and drag a card — it follows your finger and drops on release; the board does not scroll instead of dragging.
- **Interrupted gesture:** start a drag and let the gesture get cancelled (e.g. on a real phone, drag then trigger a system gesture). The lifted card returns to its pile and cards remain selectable afterward.
- **Tap still works:** a single tap (no movement) on a playable card still auto-moves it.

- [ ] **Step 7: Commit**

```bash
git add index.html solitaire.html
git commit -m "fix: reliable card dragging on mouse and touch

Add touch-action:none, a pointercancel/lostpointercapture teardown, and a
native-drag guard so drags no longer stall or leave a half-torn-down state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KwTpirAY35JEUMLfWpbH1c"
```

---

## Task 2: Tighter face-down, wider face-up tableau spacing

**Files:**
- Modify: `index.html` (layout constants ~line 678 and ~685; tableau placement ~line 806; drag-layer offsets ~line 1045)
- Modify: `solitaire.html` (same edits)

**Interfaces:**
- Consumes: `card.faceUp` (boolean on each card), `cardEl()`, `place()`, `state.tableau`.
- Produces: module-scope `ROW_DOWN` and `ROW_UP` constants replacing the former single `ROW`.

**Background:** Every tableau card currently uses one offset (`ROW`), so face-down cards waste the same vertical space as face-up ones. We split it: face-down cards stack tight, face-up cards spread wider so their rank/suit shows.

- [ ] **Step 1: Replace the single `ROW` constant (desktop defaults)**

In `index.html`, find:

```javascript
    let COL_W = 86, ROW = 16, TOP = 8, GAP = 14;
```

Replace with:

```javascript
    let COL_W = 86, ROW_DOWN = 9, ROW_UP = 24, TOP = 8, GAP = 14;
```

- [ ] **Step 2: Replace `ROW` in the mobile override**

In `index.html`, find:

```javascript
      COL_W = 80; GAP = 8; ROW = 17; TOP = 6;
```

Replace with:

```javascript
      COL_W = 80; GAP = 8; ROW_DOWN = 10; ROW_UP = 26; TOP = 6;
```

- [ ] **Step 3: Use a running offset when placing tableau cards**

In `index.html`, find the tableau placement loop:

```javascript
      state.tableau.forEach((col, ci) => {
        const x = GAP + ci * COL_W;
        const ts = slot(x, tableauTop);
        ts.dataset.pile = 'tableau'; ts.dataset.index = ci;
        felt.appendChild(ts);
        col.forEach((card, ri) => {
          const el = cardEl(card);
          place(el, x, tableauTop + ri * ROW);
          el.dataset.pile = 'tableau'; el.dataset.index = ci; el.dataset.cardIndex = ri;
          felt.appendChild(el);
        });
      });
```

Replace with:

```javascript
      state.tableau.forEach((col, ci) => {
        const x = GAP + ci * COL_W;
        const ts = slot(x, tableauTop);
        ts.dataset.pile = 'tableau'; ts.dataset.index = ci;
        felt.appendChild(ts);
        let y = tableauTop;
        col.forEach((card, ri) => {
          const el = cardEl(card);
          place(el, x, y);
          el.dataset.pile = 'tableau'; el.dataset.index = ci; el.dataset.cardIndex = ri;
          felt.appendChild(el);
          y += card.faceUp ? ROW_UP : ROW_DOWN;
        });
      });
```

- [ ] **Step 4: Use the face-up offset for the lifted drag stack**

In `index.html`, find the drag-layer card construction inside the `pointerdown` handler:

```javascript
      cards.forEach((card, i) => {
        const ce = cardEl(card);
        ce.style.left = baseLeft + 'px';
        ce.style.top = (baseTop + i * ROW) + 'px';
        dragLayer.appendChild(ce);
        drag.els.push({ ce, offset: i * ROW });
      });
```

Replace with:

```javascript
      cards.forEach((card, i) => {
        const ce = cardEl(card);
        ce.style.left = baseLeft + 'px';
        ce.style.top = (baseTop + i * ROW_UP) + 'px';
        dragLayer.appendChild(ce);
        drag.els.push({ ce, offset: i * ROW_UP });
      });
```

- [ ] **Step 5: Confirm no stray `ROW` references remain**

Run: `grep -n "\bROW\b" index.html`
Expected: no output (all references are now `ROW_DOWN` / `ROW_UP`).

- [ ] **Step 6: Apply the identical edits to `solitaire.html`**

Repeat Steps 1–4 on `solitaire.html`, then run `grep -n "\bROW\b" solitaire.html` and expect no output.

- [ ] **Step 7: Verify the two files are still identical**

Run: `diff -q index.html solitaire.html`
Expected: no output.

- [ ] **Step 8: Verify engine tests still pass**

Run: `node --test tests/engine.test.mjs`
Expected: `pass 47` / `fail 0`.

- [ ] **Step 9: Manually verify spacing in a browser**

Run: `open index.html`

Check:
- In a tableau column with both face-down and face-up cards, face-down cards are stacked tight and face-up cards are clearly more spread out — you can read the rank/suit of each face-up card beneath the next.
- The longest reachable column (deal/play until one column is long) still fits within the felt without cards running off the bottom; check on the mobile viewport (device toolbar) too.
- Dragging a multi-card sequence shows the lifted cards spaced like the face-up cards on the board.

- [ ] **Step 10: Commit**

```bash
git add index.html solitaire.html
git commit -m "feat: wider spacing for face-up tableau cards

Split the single ROW offset into ROW_DOWN (tight, hidden cards) and ROW_UP
(wider, face-up cards) so covered face-up cards stay readable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KwTpirAY35JEUMLfWpbH1c"
```

---

## Task 3: Redo

**Files:**
- Modify: `index.html` (`history` declaration ~line 713; `applyDeal` reset ~line 841; `pushHistory` ~line 988; `undo` + new `redo` ~line 1168; keydown handler ~line 1175)
- Modify: `solitaire.html` (same edits)

**Interfaces:**
- Consumes: existing `history` array, `Solitaire.cloneState(state)`, `render()`, `autoCompleteTimer`.
- Produces: module-scope `redoStack` array and a `redo()` function (called by Task 4's toolbar). `undo()` keeps its existing signature.

**Background:** Undo pops `history` into `state`. Redo needs a mirror stack. Any new forward move invalidates redo. The simplest correct hook is to clear `redoStack` inside `pushHistory()`, which runs before every forward move. Tradeoff: a move *attempt* that fails (e.g. an illegal drop) also calls `pushHistory()` and therefore clears redo even though the board didn't change. That is acceptable for this app and keeps the change to one line; `undo()`/`redo()` deliberately do **not** call `pushHistory()`, so stepping through history does not clear redo.

- [ ] **Step 1: Declare the redo stack**

In `index.html`, find:

```javascript
    let history = [];
```

Replace with:

```javascript
    let history = [];
    let redoStack = [];
```

- [ ] **Step 2: Reset the redo stack on a new deal**

In `index.html`, find (inside `applyDeal`):

```javascript
      state.timed = timed;
      history = [];
      render();
```

Replace with:

```javascript
      state.timed = timed;
      history = [];
      redoStack = [];
      render();
```

- [ ] **Step 3: Clear redo whenever a new forward move is recorded**

In `index.html`, find:

```javascript
    function pushHistory() { history.push(Solitaire.cloneState(state)); }
```

Replace with:

```javascript
    function pushHistory() { history.push(Solitaire.cloneState(state)); redoStack = []; }
```

- [ ] **Step 4: Add `redo()` and have `undo()` feed the redo stack**

In `index.html`, find:

```javascript
    function undo() {
      if (autoCompleteTimer) { clearInterval(autoCompleteTimer); autoCompleteTimer = null; }
      if (!history.length) return;
      state = history.pop();
      render();
    }
```

Replace with:

```javascript
    function undo() {
      if (autoCompleteTimer) { clearInterval(autoCompleteTimer); autoCompleteTimer = null; }
      if (!history.length) return;
      redoStack.push(Solitaire.cloneState(state));
      state = history.pop();
      render();
    }

    function redo() {
      if (autoCompleteTimer) { clearInterval(autoCompleteTimer); autoCompleteTimer = null; }
      if (!redoStack.length) return;
      history.push(Solitaire.cloneState(state));
      state = redoStack.pop();
      render();
    }
```

- [ ] **Step 5: Add redo keyboard shortcuts**

In `index.html`, find the undo line in the keydown handler:

```javascript
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
```

Replace with (redo cases must come first, because the undo case matches `z` regardless of Shift):

```javascript
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
```

- [ ] **Step 6: Apply the identical edits to `solitaire.html`**

Repeat Steps 1–5 on `solitaire.html`.

- [ ] **Step 7: Verify the two files are still identical**

Run: `diff -q index.html solitaire.html`
Expected: no output.

- [ ] **Step 8: Verify engine tests still pass**

Run: `node --test tests/engine.test.mjs`
Expected: `pass 47` / `fail 0`.

- [ ] **Step 9: Manually verify redo in a browser**

Run: `open index.html`

Check:
- Make 3 moves. Press `Ctrl+Z` three times — the board steps back to the start. Press `Ctrl+Y` (and separately `Ctrl+Shift+Z`) three times — the board steps forward to where you were.
- After undoing one or more moves, make a *different* move. Pressing redo now does nothing (the redo stack was cleared).

- [ ] **Step 10: Commit**

```bash
git add index.html solitaire.html
git commit -m "feat: add redo (Ctrl+Y / Ctrl+Shift+Z)

Mirror the undo history with a redoStack; undo feeds it and any new forward
move clears it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KwTpirAY35JEUMLfWpbH1c"
```

---

## Task 4: On-screen button bar (New / Undo / Redo / Hint)

**Files:**
- Modify: `index.html` (HTML between `#felt` and `#statusbar` ~line 144; new CSS in `<style>`; JS wiring before the bootstrap call ~line 1189; a call inside `render()` ~line 813)
- Modify: `solitaire.html` (same edits)

**Interfaces:**
- Consumes: `confirmNewGame()` (line 1307), `undo()` and `redo()` (Task 3), `hint()` (line 952), `history`, `redoStack`, `render()`.
- Produces: an `updateButtons()` function (called from `render()`) that reflects undo/redo availability.

**Background:** Controls currently live only in desktop dropdown menus. We add an always-visible bar usable by mouse and finger. It reuses the existing action functions, so there is no new game logic.

- [ ] **Step 1: Add the toolbar markup**

In `index.html`, find:

```html
    <div id="felt"></div>
    <div id="statusbar">
```

Replace with:

```html
    <div id="felt"></div>
    <div id="toolbar">
      <button id="btn-new" type="button">New</button>
      <button id="btn-undo" type="button">Undo</button>
      <button id="btn-redo" type="button">Redo</button>
      <button id="btn-hint" type="button">Hint</button>
    </div>
    <div id="statusbar">
```

- [ ] **Step 2: Add the toolbar styles**

In `index.html`, find the `#statusbar` CSS rule:

```css
  #statusbar {
    display: flex; gap: 24px; padding: 3px 10px; font-size: 12px;
    background: #ece9d8; border-top: 1px solid #fff;
  }
```

Immediately **before** it, add:

```css
  #toolbar {
    display: flex; gap: 6px; padding: 6px 8px; justify-content: center;
    background: #ece9d8; border-top: 1px solid #fff;
  }
  #toolbar button {
    flex: 0 1 120px; padding: 6px 10px; font: inherit; font-size: 13px;
    cursor: pointer; border: 1px solid #aca899; border-radius: 4px;
    background: linear-gradient(#fdfdfd, #dcd8c8);
  }
  #toolbar button:hover { background: linear-gradient(#fff, #cfe2ff); }
  #toolbar button:disabled { color: #999; cursor: default; background: #e4e1d4; }
  .mobile #toolbar { gap: 8px; padding: 8px; }
  .mobile #toolbar button { flex: 1 1 0; min-height: 44px; font-size: 15px; }
```

- [ ] **Step 3: Wire the buttons and add `updateButtons()`**

In `index.html`, find the closing of the keydown handler:

```javascript
      else if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
        if (drag || document.querySelector('.overlay') || document.getElementById('searching')) return;
        e.preventDefault();
        confirmNewGame();
      }
    });
```

Immediately **after** that closing `});`, add:

```javascript
    const btnNew  = document.getElementById('btn-new');
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnHint = document.getElementById('btn-hint');
    btnNew.addEventListener('click', confirmNewGame);
    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);
    btnHint.addEventListener('click', hint);

    function updateButtons() {
      btnUndo.disabled = history.length === 0;
      btnRedo.disabled = redoStack.length === 0;
    }
```

- [ ] **Step 4: Refresh button state on every render**

In `index.html`, find the end of `render()`:

```javascript
      updateStatus();
      felt.appendChild(dragLayer);
      applyCardBack();
```

Replace with:

```javascript
      updateStatus();
      updateButtons();
      felt.appendChild(dragLayer);
      applyCardBack();
```

Note on ordering: `render()` is only *called* at runtime (first call via `newGame()` at the end of the script), by which point the `btn*` consts from Step 3 are initialized — so `updateButtons()` resolves them safely.

- [ ] **Step 5: Apply the identical edits to `solitaire.html`**

Repeat Steps 1–4 on `solitaire.html`.

- [ ] **Step 6: Verify the two files are still identical**

Run: `diff -q index.html solitaire.html`
Expected: no output.

- [ ] **Step 7: Verify engine tests still pass**

Run: `node --test tests/engine.test.mjs`
Expected: `pass 47` / `fail 0`.

- [ ] **Step 8: Manually verify the toolbar in a browser**

Run: `open index.html`

Check:
- The bar shows **New · Undo · Redo · Hint** below the felt, above the status bar.
- **New** opens the "Deal a new game?" confirm; confirming deals a fresh game.
- **Undo** / **Redo** step the board back and forward and match the keyboard shortcuts.
- **Hint** highlights a move (or shows the "no winning move" dialog).
- At the start of a fresh game, **Undo** and **Redo** are disabled. After a move, **Undo** enables; after an undo, **Redo** enables; after a new move, **Redo** disables again.
- In the mobile viewport (device toolbar), the four buttons stretch to fill the width and are tall enough (≥44px) to tap comfortably.

- [ ] **Step 9: Commit**

```bash
git add index.html solitaire.html
git commit -m "feat: on-screen New/Undo/Redo/Hint button bar

Add an always-visible toolbar (mouse + touch) wired to the existing actions,
with Undo/Redo disabled states reflecting the history stacks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KwTpirAY35JEUMLfWpbH1c"
```

---

## Self-Review

**Spec coverage:**
- Drag reliability (mouse + touch) → Task 1 (touch-action, cancel teardown, native-drag guard). ✓
- Button bar (mobile **and** desktop), New/Undo/Redo/Hint → Task 4. ✓
- Redo + `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z`, cleared on new move → Task 3. ✓
- Tight face-down / wider face-up stacking → Task 2. ✓
- Both files kept in sync → Global Constraints + per-task `diff -q` step. ✓

**Type/name consistency:** `redo()` (Task 3) is consumed by Task 4's `btnRedo` wiring. `redoStack` (Task 3) is read by `updateButtons()` (Task 4). `updateButtons()` (Task 4 Step 3) is called in `render()` (Task 4 Step 4). `ROW_DOWN`/`ROW_UP` (Task 2) replace all `ROW` uses, checked by `grep`. No dangling references.

**Placeholder scan:** No TBD/TODO; every code step shows the full before/after. Verification steps give exact commands and expected output.
