# XP Solitaire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single, self-contained `solitaire.html` file that recreates Windows XP Klondike Solitaire — Luna window chrome, green felt table, classic cards, the iconic win cascade, and XP's fast interaction flow.

**Architecture:** Pure game logic lives in a zero-dependency `engine.js` (a UMD-style script that attaches a global `Solitaire` namespace in the browser and exports for Node tests). The UI, chrome, rendering, drag/drop, menus, and win animation live in `solitaire.html`, which loads `engine.js` as a classic script during development. The final task inlines `engine.js` into `solitaire.html` so the shipped artifact is a single file that runs from `file://`.

**Tech Stack:** Vanilla HTML/CSS/JavaScript. No frameworks, no build tooling. Tests use Node's built-in test runner (`node --test`, Node 18+). Cards and chrome are drawn with CSS + Unicode suit glyphs.

---

## File Structure

- `engine.js` — Create. Pure game model: deck, shuffle, deal, move validation, move execution, stock/waste, auto-to-foundation, win/auto-complete detection, scoring, timer math, snapshot undo. No DOM access.
- `tests/engine.test.mjs` — Create. Node `--test` suite covering all of `engine.js`.
- `solitaire.html` — Create. XP chrome, felt layout, CSS, card rendering, interaction wiring, menus/dialogs, status bar, win animation, persistence. Loads `engine.js` during dev; engine inlined at the end.
- `README.md` — Create. One-paragraph "open solitaire.html in a browser" note + how to run tests.

The engine exposes a single global object `Solitaire` with all functions. State is a plain object (see Task 1) so it deep-clones cleanly for undo and serializes for tests.

---

## Conventions used throughout

- **Card:** `{ rank: 1..13, suit: 'S'|'H'|'D'|'C', faceUp: boolean }`. Rank 1 = Ace, 11 = Jack, 12 = Queen, 13 = King.
- **State shape:**
  ```js
  {
    stock: [card, ...],        // face-down; top of pile = last element
    waste: [card, ...],        // face-up; top = last element
    foundations: [[],[],[],[]],// 4 piles, build up by suit; top = last
    tableau: [[card,...] x7],  // 7 columns; top = last element
    drawCount: 1 | 3,
    scoringMode: 'standard',   // 'standard' (timed bonus handled by timer layer)
    timed: boolean,
    score: number,             // never rendered below 0
    recycles: number           // count of stock recycles (for penalties)
  }
  ```
- **Suit color:** S, C = black; H, D = red.
- All engine mutators take `state` and mutate-and-return it (so the UI can also read the returned value). Undo is handled by snapshotting whole states, so mutation is safe.

---

### Task 1: Project scaffold + deck creation

**Files:**
- Create: `engine.js`
- Create: `tests/engine.test.mjs`
- Create: `README.md`

- [ ] **Step 1: Write the failing test**

Create `tests/engine.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solitaire } from '../engine.js';

test('makeDeck returns 52 unique cards', () => {
  const deck = Solitaire.makeDeck();
  assert.equal(deck.length, 52);
  const ids = new Set(deck.map(c => c.rank + c.suit));
  assert.equal(ids.size, 52);
  assert.ok(deck.every(c => c.rank >= 1 && c.rank <= 13));
  assert.ok(deck.every(c => 'SHDC'.includes(c.suit)));
  assert.ok(deck.every(c => c.faceUp === false));
});

test('isRed identifies red suits', () => {
  assert.equal(Solitaire.isRed('H'), true);
  assert.equal(Solitaire.isRed('D'), true);
  assert.equal(Solitaire.isRed('S'), false);
  assert.equal(Solitaire.isRed('C'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — cannot find module `../engine.js` (or `Solitaire` undefined).

- [ ] **Step 3: Write minimal implementation**

Create `engine.js`:

```js
(function (root) {
  const SUITS = ['S', 'H', 'D', 'C'];

  function isRed(suit) {
    return suit === 'H' || suit === 'D';
  }

  function makeDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ rank, suit, faceUp: false });
      }
    }
    return deck;
  }

  const Solitaire = { SUITS, isRed, makeDeck };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Solitaire };
  } else {
    root.Solitaire = Solitaire;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Create `README.md`:

```markdown
# Windows XP Solitaire (replica)

A single-file recreation of Windows XP Klondike Solitaire.

## Play
Open `solitaire.html` in any modern browser (double-click works — no server needed).

## Develop / test
Game logic lives in `engine.js` and is tested with Node's built-in runner:

    node --test

`solitaire.html` loads `engine.js` during development; the engine is inlined into
`solitaire.html` as the final build step so the shipped file is self-contained.
```

> Note: `tests/engine.test.mjs` uses `import { Solitaire } from '../engine.js'`. The UMD wrapper sets `module.exports = { Solitaire }`, which Node's ESM loader exposes as a named `Solitaire` export via CJS interop. Verify in Step 4; if the named import fails on your Node version, change the test import to `import pkg from '../engine.js'; const { Solitaire } = pkg;` and use that form in all later test files.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs README.md
git commit -m "feat: deck creation and suit color helper"
```

---

### Task 2: Seedable shuffle + Klondike deal

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
test('makeRng is deterministic for a given seed', () => {
  const a = Solitaire.makeRng(42);
  const b = Solitaire.makeRng(42);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test('shuffle preserves all 52 cards and reorders deterministically by seed', () => {
  const d1 = Solitaire.shuffle(Solitaire.makeDeck(), Solitaire.makeRng(7));
  const d2 = Solitaire.shuffle(Solitaire.makeDeck(), Solitaire.makeRng(7));
  assert.equal(d1.length, 52);
  assert.deepEqual(d1.map(c => c.rank + c.suit), d2.map(c => c.rank + c.suit));
  const ids = new Set(d1.map(c => c.rank + c.suit));
  assert.equal(ids.size, 52);
});

test('deal builds 7 tableau columns and a 24-card stock', () => {
  const state = Solitaire.deal(Solitaire.makeRng(1), 3);
  assert.equal(state.tableau.length, 7);
  state.tableau.forEach((col, i) => assert.equal(col.length, i + 1));
  // only the last card of each column is face-up
  state.tableau.forEach(col => {
    col.forEach((card, idx) => assert.equal(card.faceUp, idx === col.length - 1));
  });
  assert.equal(state.stock.length, 24);
  assert.ok(state.stock.every(c => c.faceUp === false));
  assert.equal(state.waste.length, 0);
  assert.deepEqual(state.foundations, [[], [], [], []]);
  assert.equal(state.drawCount, 3);
  assert.equal(state.score, 0);
  assert.equal(state.recycles, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `makeRng`/`shuffle`/`deal` not functions.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add these functions before the `const Solitaire = {...}` line:

```js
  // Mulberry32 — small deterministic PRNG returning [0,1)
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(deck, rng) {
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function deal(rng, drawCount) {
    const deck = shuffle(makeDeck(), rng);
    const tableau = [[], [], [], [], [], [], []];
    let idx = 0;
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck[idx++];
        card.faceUp = row === col; // last dealt card in the column is face up
        tableau[col].push(card);
      }
    }
    const stock = deck.slice(idx); // remaining 24, all face-down
    stock.forEach(c => (c.faceUp = false));
    return {
      stock,
      waste: [],
      foundations: [[], [], [], []],
      tableau,
      drawCount: drawCount === 1 ? 1 : 3,
      scoringMode: 'standard',
      timed: false,
      score: 0,
      recycles: 0,
    };
  }
```

Then add `makeRng, shuffle, deal` to the `Solitaire` object literal.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: seedable shuffle and Klondike deal"
```

---

### Task 3: Move validation rules

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
const C = (rank, suit, faceUp = true) => ({ rank, suit, faceUp });

test('canStackTableau: descending, alternating color', () => {
  assert.equal(Solitaire.canStackTableau(C(6, 'H'), C(7, 'S')), true);  // red 6 on black 7
  assert.equal(Solitaire.canStackTableau(C(6, 'D'), C(7, 'H')), false); // red on red
  assert.equal(Solitaire.canStackTableau(C(5, 'S'), C(7, 'H')), false); // wrong rank gap
});

test('canStackTableau: only a King goes on an empty column', () => {
  assert.equal(Solitaire.canStackTableau(C(13, 'S'), null), true);
  assert.equal(Solitaire.canStackTableau(C(12, 'S'), null), false);
});

test('canStackFoundation: Ace starts, then same suit ascending', () => {
  assert.equal(Solitaire.canStackFoundation(C(1, 'H'), []), true);    // Ace on empty
  assert.equal(Solitaire.canStackFoundation(C(2, 'H'), []), false);   // non-Ace on empty
  assert.equal(Solitaire.canStackFoundation(C(2, 'H'), [C(1, 'H')]), true);
  assert.equal(Solitaire.canStackFoundation(C(2, 'S'), [C(1, 'H')]), false); // wrong suit
  assert.equal(Solitaire.canStackFoundation(C(3, 'H'), [C(1, 'H')]), false); // skip rank
});

test('isValidSequence: descending alternating face-up run', () => {
  assert.equal(Solitaire.isValidSequence([C(7, 'S'), C(6, 'H'), C(5, 'S')]), true);
  assert.equal(Solitaire.isValidSequence([C(7, 'S'), C(6, 'S')]), false); // same color
  assert.equal(Solitaire.isValidSequence([C(7, 'S', false), C(6, 'H')]), false); // face-down
  assert.equal(Solitaire.isValidSequence([C(9, 'D')]), true); // single card
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — validation functions undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  function canStackTableau(moving, ontoTop) {
    if (!ontoTop) return moving.rank === 13;          // empty column → King only
    return ontoTop.rank === moving.rank + 1 &&
           isRed(ontoTop.suit) !== isRed(moving.suit); // alternating color
  }

  function canStackFoundation(moving, foundationPile) {
    const top = foundationPile[foundationPile.length - 1];
    if (!top) return moving.rank === 1;               // empty → Ace
    return top.suit === moving.suit && moving.rank === top.rank + 1;
  }

  function isValidSequence(cards) {
    for (let i = 0; i < cards.length; i++) {
      if (!cards[i].faceUp) return false;
      if (i > 0 && !canStackTableau(cards[i], cards[i - 1])) return false;
    }
    return true;
  }
```

Add `canStackTableau, canStackFoundation, isValidSequence` to the `Solitaire` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: move validation rules"
```

---

### Task 4: Move execution + auto-flip + scoring deltas

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

Scoring values (standard XP): waste→tableau +5; waste→foundation +10; tableau→foundation +10; turn-over tableau card +5; foundation→tableau −15. Score is clamped at ≥ 0.

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
function tableauState(columns) {
  return {
    stock: [], waste: [], foundations: [[], [], [], []],
    tableau: columns, drawCount: 3, scoringMode: 'standard',
    timed: false, score: 0, recycles: 0,
  };
}

test('moveCards: tableau→tableau moves a valid run and flips the exposed card', () => {
  const s = tableauState([
    [C(9, 'C', false), C(7, 'H')],   // col 0: face-down 9C, face-up 7H
    [C(8, 'S')],                     // col 1: 8S
    [], [], [], [], [],
  ]);
  const out = Solitaire.moveCards(s, { pile: 'tableau', index: 0, cardIndex: 1 },
                                     { pile: 'tableau', index: 1 });
  assert.deepEqual(out.tableau[1].map(c => c.rank + c.suit), ['8S', '7H']);
  assert.equal(out.tableau[0].length, 1);
  assert.equal(out.tableau[0][0].faceUp, true); // 9C flipped
  assert.equal(out.score, 5);                   // +5 for turning over a card
});

test('moveCards: waste→foundation scores +10', () => {
  const s = tableauState([[], [], [], [], [], [], []]);
  s.waste = [C(1, 'H')];
  const out = Solitaire.moveCards(s, { pile: 'waste' }, { pile: 'foundation', index: 0 });
  assert.deepEqual(out.foundations[0].map(c => c.rank + c.suit), ['1H']);
  assert.equal(out.waste.length, 0);
  assert.equal(out.score, 10);
});

test('moveCards: foundation→tableau subtracts 15 but never below 0', () => {
  const s = tableauState([[C(13, 'S')], [], [], [], [], [], []]);
  s.foundations[0] = [C(1, 'H'), C(2, 'H')];
  const out = Solitaire.moveCards(s, { pile: 'foundation', index: 0 },
                                     { pile: 'tableau', index: 0 });
  assert.equal(out.score, 0); // 0 - 15 clamped to 0
});

test('moveCards: rejects an illegal move and leaves state unchanged', () => {
  const s = tableauState([[C(7, 'H')], [C(7, 'S')], [], [], [], [], []]);
  const out = Solitaire.moveCards(s, { pile: 'tableau', index: 0, cardIndex: 0 },
                                     { pile: 'tableau', index: 1 });
  assert.equal(out, null); // null signals illegal move
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `moveCards` undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  function clampScore(s) { return s < 0 ? 0 : s; }

  // Returns the moving cards (array) for a source without removing them.
  function peekSource(state, src) {
    if (src.pile === 'waste') {
      const top = state.waste[state.waste.length - 1];
      return top ? [top] : [];
    }
    if (src.pile === 'foundation') {
      const f = state.foundations[src.index];
      const top = f[f.length - 1];
      return top ? [top] : [];
    }
    if (src.pile === 'tableau') {
      return state.tableau[src.index].slice(src.cardIndex);
    }
    return [];
  }

  function destTop(state, dst) {
    if (dst.pile === 'tableau') {
      const col = state.tableau[dst.index];
      return col[col.length - 1] || null;
    }
    if (dst.pile === 'foundation') {
      const f = state.foundations[dst.index];
      return f[f.length - 1] || null;
    }
    return null;
  }

  function isLegalMove(state, moving, dst) {
    if (moving.length === 0) return false;
    if (dst.pile === 'foundation') {
      if (moving.length !== 1) return false;
      return canStackFoundation(moving[0], state.foundations[dst.index]);
    }
    if (dst.pile === 'tableau') {
      if (!isValidSequence(moving)) return false;
      return canStackTableau(moving[0], destTop(state, dst));
    }
    return false;
  }

  function scoreForMove(src, dst) {
    if (dst.pile === 'foundation') return 10;            // waste/tableau → foundation
    if (dst.pile === 'tableau' && src.pile === 'waste') return 5;
    if (dst.pile === 'tableau' && src.pile === 'foundation') return -15;
    return 0;
  }

  // Mutates and returns state on success; returns null if the move is illegal.
  function moveCards(state, src, dst) {
    const moving = peekSource(state, src);
    if (!isLegalMove(state, moving, dst)) return null;

    // Remove from source
    if (src.pile === 'waste') state.waste.pop();
    else if (src.pile === 'foundation') state.foundations[src.index].pop();
    else if (src.pile === 'tableau') state.tableau[src.index].splice(src.cardIndex);

    // Add to destination
    if (dst.pile === 'tableau') state.tableau[dst.index].push(...moving);
    else if (dst.pile === 'foundation') state.foundations[dst.index].push(moving[0]);

    let delta = scoreForMove(src, dst);

    // Flip newly-exposed tableau card
    if (src.pile === 'tableau') {
      const col = state.tableau[src.index];
      const top = col[col.length - 1];
      if (top && !top.faceUp) { top.faceUp = true; delta += 5; }
    }

    state.score = clampScore(state.score + delta);
    return state;
  }
```

Add `moveCards` to the `Solitaire` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: move execution, auto-flip, and scoring deltas"
```

---

### Task 5: Stock draw + recycle (Draw 1 / Draw 3)

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

Recycle penalty (standard): Draw-1 deal subtracts 100 per recycle after the first 3 stock passes is *not* modeled here for simplicity; instead, match the widely-used XP rule: Draw-3 has no per-recycle penalty, Draw-1 subtracts 100 starting on the 4th pass. We model: `recycles` increments each recycle; `drawStock` applies −100 when `drawCount===1 && recycles >= 3` and −20 when `drawCount===3 && recycles >= 0`? To keep this deterministic and testable, the rule implemented is: **on each recycle, subtract 100 in Draw-1 and 20 in Draw-3 once `recycles > 0`.** (Exact arcade-accurate values can be tuned later; tests pin the implemented rule.)

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
function stockState(stockRanks, drawCount) {
  return {
    stock: stockRanks.map(r => C(r, 'S', false)),
    waste: [], foundations: [[], [], [], []],
    tableau: [[], [], [], [], [], [], []],
    drawCount, scoringMode: 'standard', timed: false, score: 0, recycles: 0,
  };
}

test('drawStock (Draw 3) moves up to 3 cards to waste, face-up', () => {
  const s = stockState([2, 3, 4, 5], 3);
  Solitaire.drawStock(s);
  assert.equal(s.waste.length, 3);
  assert.ok(s.waste.every(c => c.faceUp));
  assert.equal(s.stock.length, 1);
});

test('drawStock (Draw 3) moves remaining when fewer than 3 left', () => {
  const s = stockState([2, 3], 3);
  Solitaire.drawStock(s);
  assert.equal(s.waste.length, 2);
  assert.equal(s.stock.length, 0);
});

test('drawStock (Draw 1) moves one card', () => {
  const s = stockState([2, 3, 4], 1);
  Solitaire.drawStock(s);
  assert.equal(s.waste.length, 1);
  assert.equal(s.stock.length, 2);
});

test('drawStock recycles waste back to stock (face-down, reversed) and counts recycle', () => {
  const s = stockState([], 1);
  s.waste = [C(2, 'S'), C(3, 'S'), C(4, 'S')]; // top is 4S
  Solitaire.drawStock(s);
  assert.equal(s.waste.length, 0);
  assert.equal(s.stock.length, 3);
  assert.ok(s.stock.every(c => !c.faceUp));
  // recycle restores original draw order: next draw should yield 2S (bottom became top of stock)
  assert.deepEqual(s.stock.map(c => c.rank), [4, 3, 2]);
  assert.equal(s.recycles, 1);
  assert.equal(s.score, 100); // wait: penalty subtracts; see note
});
```

> Correction for the last assertion: a penalty *subtracts*, so with score starting at 0 and clamping at 0, the score stays 0. Replace the final assertion with `assert.equal(s.score, 0);`. Use that corrected line.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `drawStock` undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  function drawStock(state) {
    if (state.stock.length === 0) {
      // Recycle: move waste back to stock, face-down, preserving redeal order.
      // waste top (end) should become the next card drawn, so reverse into stock.
      while (state.waste.length) {
        const c = state.waste.pop();
        c.faceUp = false;
        state.stock.push(c);
      }
      state.recycles += 1;
      const penalty = state.drawCount === 1 ? 100 : 20;
      if (state.recycles > 0) state.score = clampScore(state.score - penalty);
      return state;
    }
    const n = Math.min(state.drawCount, state.stock.length);
    for (let i = 0; i < n; i++) {
      const c = state.stock.pop();
      c.faceUp = true;
      state.waste.push(c);
    }
    return state;
  }
```

Add `drawStock` to the `Solitaire` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (with the corrected final assertion).

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: stock draw and recycle for Draw 1 and Draw 3"
```

---

### Task 6: Auto-move-to-foundation (double-click / right-click)

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
test('autoToFoundation moves an eligible top card and returns true', () => {
  const s = tableauState([[C(1, 'H')], [], [], [], [], [], []]);
  const moved = Solitaire.autoToFoundation(s, { pile: 'tableau', index: 0 });
  assert.equal(moved, true);
  assert.equal(s.tableau[0].length, 0);
  assert.equal(s.foundations.some(f => f.length === 1 && f[0].suit === 'H'), true);
});

test('autoToFoundation returns false when no foundation accepts the card', () => {
  const s = tableauState([[C(7, 'H')], [], [], [], [], [], []]);
  const moved = Solitaire.autoToFoundation(s, { pile: 'tableau', index: 0 });
  assert.equal(moved, false);
  assert.equal(s.tableau[0].length, 1);
});

test('autoToFoundation works from waste', () => {
  const s = tableauState([[], [], [], [], [], [], []]);
  s.waste = [C(1, 'S')];
  const moved = Solitaire.autoToFoundation(s, { pile: 'waste' });
  assert.equal(moved, true);
  assert.equal(s.waste.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `autoToFoundation` undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  // Tries to send the top card of the given source to any legal foundation.
  // Returns true if a move happened.
  function autoToFoundation(state, src) {
    const moving = peekSource(state, src);
    if (moving.length !== 1) return false;
    for (let i = 0; i < 4; i++) {
      if (canStackFoundation(moving[0], state.foundations[i])) {
        const ok = moveCards(state, src, { pile: 'foundation', index: i });
        return ok !== null;
      }
    }
    return false;
  }
```

Add `autoToFoundation` to the `Solitaire` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: auto-move card to foundation"
```

---

### Task 7: Win detection + auto-complete readiness + auto-complete step

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
test('isWon true only when all four foundations are complete', () => {
  const s = tableauState([[], [], [], [], [], [], []]);
  assert.equal(Solitaire.isWon(s), false);
  s.foundations = Solitaire.SUITS.map(suit =>
    Array.from({ length: 13 }, (_, i) => C(i + 1, suit)));
  assert.equal(Solitaire.isWon(s), true);
});

test('canAutoComplete true when stock+waste empty and all tableau face-up', () => {
  const s = tableauState([[C(13, 'S')], [], [], [], [], [], []]);
  assert.equal(Solitaire.canAutoComplete(s), true);
  s.tableau[0] = [C(13, 'S', false)];
  assert.equal(Solitaire.canAutoComplete(s), false);
  s.tableau[0] = [C(13, 'S')];
  s.stock = [C(2, 'S', false)];
  assert.equal(Solitaire.canAutoComplete(s), false);
});

test('autoCompleteStep makes one foundation move and returns true, false when done', () => {
  const s = tableauState([[C(1, 'H')], [C(1, 'S')], [], [], [], [], []]);
  assert.equal(Solitaire.autoCompleteStep(s), true);
  assert.equal(Solitaire.autoCompleteStep(s), true);
  assert.equal(Solitaire.autoCompleteStep(s), false); // nothing left to place
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — functions undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  function isWon(state) {
    return state.foundations.every(f => f.length === 13);
  }

  function canAutoComplete(state) {
    if (isWon(state)) return false;
    if (state.stock.length > 0 || state.waste.length > 0) return false;
    return state.tableau.every(col => col.every(c => c.faceUp));
  }

  // Performs a single auto-complete move (tableau or waste top → foundation).
  // Returns true if a card was placed, false when no move is available.
  function autoCompleteStep(state) {
    for (let i = 0; i < 7; i++) {
      if (state.tableau[i].length &&
          autoToFoundation(state, { pile: 'tableau', index: i })) {
        return true;
      }
    }
    if (state.waste.length && autoToFoundation(state, { pile: 'waste' })) {
      return true;
    }
    return false;
  }
```

Add `isWon, canAutoComplete, autoCompleteStep` to the `Solitaire` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: win detection and auto-complete"
```

---

### Task 8: Snapshot undo + timed bonus math

**Files:**
- Modify: `engine.js`
- Test: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/engine.test.mjs`:

```js
test('cloneState produces an independent deep copy', () => {
  const s = tableauState([[C(7, 'H')], [], [], [], [], [], []]);
  const c = Solitaire.cloneState(s);
  c.tableau[0][0].rank = 99;
  c.score = 50;
  assert.equal(s.tableau[0][0].rank, 7);
  assert.equal(s.score, 0);
});

test('timeBonus: 0 for short/zero games, larger for faster wins', () => {
  assert.equal(Solitaire.timeBonus(0), 0);
  assert.equal(Solitaire.timeBonus(20), 0); // under 30s threshold → no bonus
  const fast = Solitaire.timeBonus(60);
  const slow = Solitaire.timeBonus(300);
  assert.ok(fast > slow);
  assert.ok(Number.isInteger(fast));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `cloneState`/`timeBonus` undefined.

- [ ] **Step 3: Write minimal implementation**

In `engine.js`, add before the `Solitaire` object:

```js
  function cloneState(state) {
    return {
      stock: state.stock.map(c => ({ ...c })),
      waste: state.waste.map(c => ({ ...c })),
      foundations: state.foundations.map(f => f.map(c => ({ ...c }))),
      tableau: state.tableau.map(col => col.map(c => ({ ...c }))),
      drawCount: state.drawCount,
      scoringMode: state.scoringMode,
      timed: state.timed,
      score: state.score,
      recycles: state.recycles,
    };
  }

  // XP-style time bonus: only for games longer than 30s, rewards speed.
  function timeBonus(seconds) {
    if (seconds <= 30) return 0;
    return Math.floor(700000 / seconds);
  }
```

Add `cloneState, timeBonus` to the `Solitaire` object.

> Undo itself (pushing/popping snapshots) is orchestrated by the UI layer in `solitaire.html` using `cloneState`. The engine provides the clone; the history stack lives in the UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS. This completes the engine; the full suite should be green.

- [ ] **Step 5: Commit**

```bash
git add engine.js tests/engine.test.mjs
git commit -m "feat: state cloning for undo and timed bonus math"
```

---

### Task 9: HTML scaffold + XP Luna chrome + felt layout

**Files:**
- Create: `solitaire.html`

This task is UI; verification is by opening the file in a browser (no automated test). Each UI task lists explicit **Verify** steps.

- [ ] **Step 1: Create `solitaire.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Solitaire</title>
<style>
  :root { --felt: #0a7d3e; --felt-dark: #096a35; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; height: 100%;
    background: #3a6ea5; /* XP desktop blue */
    font-family: Tahoma, "Segoe UI", sans-serif;
    -webkit-user-select: none; user-select: none;
  }
  #window {
    position: absolute; inset: 16px;
    display: flex; flex-direction: column;
    border: 1px solid #0831a0; border-radius: 8px 8px 0 0;
    box-shadow: 0 8px 30px rgba(0,0,0,.45); overflow: hidden;
  }
  #titlebar {
    display: flex; align-items: center; gap: 6px;
    padding: 4px 6px; color: #fff; font-weight: bold; font-size: 13px;
    background: linear-gradient(#2a64d4, #1941a5);
  }
  #titlebar .spacer { flex: 1; }
  .winbtn {
    width: 21px; height: 21px; border-radius: 3px; border: 1px solid #1b3a8a;
    background: linear-gradient(#5a8de0, #2a5bc0); color: #fff; font-size: 12px;
    display: grid; place-items: center; cursor: pointer;
  }
  .winbtn.close { background: linear-gradient(#e08a5a, #c0402a); }
  #menubar {
    display: flex; gap: 2px; padding: 2px 4px; font-size: 13px;
    background: #ece9d8; border-bottom: 1px solid #aca899;
  }
  .menu { padding: 2px 8px; cursor: pointer; position: relative; }
  .menu:hover { background: #cfe2ff; }
  #felt {
    flex: 1; position: relative;
    background: radial-gradient(circle at 50% 0%, var(--felt), var(--felt-dark));
    padding: 16px;
  }
  #statusbar {
    display: flex; gap: 24px; padding: 3px 10px; font-size: 12px;
    background: #ece9d8; border-top: 1px solid #fff;
  }
  #statusbar .spacer { flex: 1; }
</style>
</head>
<body>
  <div id="window">
    <div id="titlebar">
      <span>&#9824; Solitaire</span>
      <span class="spacer"></span>
      <div class="winbtn" title="Minimize">_</div>
      <div class="winbtn" title="Maximize">&#9633;</div>
      <div class="winbtn close" title="Close">&times;</div>
    </div>
    <div id="menubar">
      <div class="menu" id="menu-game">Game</div>
      <div class="menu" id="menu-help">Help</div>
    </div>
    <div id="felt"></div>
    <div id="statusbar">
      <span id="status-score">Score: 0</span>
      <span id="status-time">Time: 0</span>
      <span class="spacer"></span>
      <span id="status-mode">Draw Three &middot; Standard</span>
    </div>
  </div>

  <script src="engine.js"></script>
  <script>
    // Game wiring is added in later tasks.
  </script>
</body>
</html>
```

- [ ] **Step 2: Verify in browser**

Open `solitaire.html` (double-click). Expected: a Luna-blue title bar reading "♠ Solitaire" with three window buttons; a beige menu bar with "Game" and "Help" (hover highlights them); a green felt area; a status bar showing "Score: 0", "Time: 0", and "Draw Three · Standard".

- [ ] **Step 3: Commit**

```bash
git add solitaire.html
git commit -m "feat: XP window chrome and felt layout scaffold"
```

---

### Task 10: Pile slots + card rendering from engine state

**Files:**
- Modify: `solitaire.html`

Adds the pile layout (stock, waste, 4 foundations, 7 tableau columns), a `renderCard` helper, and a `render(state)` function that paints the whole board. Cards are absolutely positioned within their pile slots; tableau cards fan downward.

- [ ] **Step 1: Add CSS for piles and cards**

Inside the `<style>` block, before `</style>`, add:

```css
  .pile {
    position: absolute; width: 72px; height: 100px; border-radius: 6px;
  }
  .pile.slot { border: 2px dashed rgba(255,255,255,.35); }
  .card {
    position: absolute; width: 72px; height: 100px; border-radius: 6px;
    background: #fff; border: 1px solid #999; box-shadow: 0 1px 2px rgba(0,0,0,.3);
    font-family: Georgia, "Times New Roman", serif; cursor: pointer;
  }
  .card .corner {
    position: absolute; top: 4px; left: 5px; font-size: 15px; font-weight: bold;
    line-height: 1; text-align: center;
  }
  .card .corner.br {
    top: auto; left: auto; bottom: 4px; right: 5px; transform: rotate(180deg);
  }
  .card .pip {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    font-size: 34px;
  }
  .card.face .pip { font-weight: bold; font-size: 30px; }
  .card.red { color: #c00; }
  .card.black { color: #111; }
  .card.back {
    background: repeating-linear-gradient(45deg, #1b4ea8 0 4px, #3a6fd0 4px 8px);
    border: 2px solid #fff;
  }
  .card.dragging { opacity: .6; }
```

- [ ] **Step 2: Add layout constants, render helpers, and a deal call**

Replace the inline `<script>` at the bottom (the one with the "later tasks" comment) with:

```html
  <script>
    const RANKS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
    const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
    const COL_W = 86, ROW = 16, TOP = 8, GAP = 14;

    const felt = document.getElementById('felt');
    let state = null;
    let history = [];

    function rankLabel(r) { return RANKS[r] || String(r); }

    function cardEl(card) {
      const el = document.createElement('div');
      el.className = 'card ' + (Solitaire.isRed(card.suit) ? 'red' : 'black');
      if (!card.faceUp) { el.className = 'card back'; return el; }
      if (card.rank > 10) el.classList.add('face');
      const label = rankLabel(card.rank) + '\n' + SUIT_GLYPH[card.suit];
      const tl = document.createElement('div');
      tl.className = 'corner';
      tl.style.whiteSpace = 'pre';
      tl.textContent = label;
      const br = document.createElement('div');
      br.className = 'corner br';
      br.style.whiteSpace = 'pre';
      br.textContent = label;
      const pip = document.createElement('div');
      pip.className = 'pip';
      pip.textContent = card.rank > 10 ? rankLabel(card.rank) : SUIT_GLYPH[card.suit];
      el.append(tl, br, pip);
      return el;
    }

    function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

    function slot(x, y) {
      const s = document.createElement('div');
      s.className = 'pile slot';
      place(s, x, y);
      return s;
    }

    function render() {
      felt.innerHTML = '';
      // Stock + waste (top-left)
      felt.appendChild(slot(GAP, TOP));
      felt.appendChild(slot(GAP + COL_W, TOP));
      // Foundations (top-right, 4 slots starting at column 3)
      for (let i = 0; i < 4; i++) felt.appendChild(slot(GAP + (3 + i) * COL_W, TOP));

      // Stock cards (show a back if any remain)
      if (state.stock.length) {
        const b = cardEl({ rank: 0, suit: 'S', faceUp: false });
        place(b, GAP, TOP); b.dataset.pile = 'stock';
        felt.appendChild(b);
      } else {
        const r = slot(GAP, TOP); r.dataset.pile = 'stock';
        r.style.cursor = 'pointer'; r.textContent = '';
        felt.appendChild(r);
      }
      // Waste: show top card
      if (state.waste.length) {
        const c = state.waste[state.waste.length - 1];
        const el = cardEl(c); place(el, GAP + COL_W, TOP);
        el.dataset.pile = 'waste';
        felt.appendChild(el);
      }
      // Foundations: show top card
      state.foundations.forEach((f, i) => {
        if (f.length) {
          const el = cardEl(f[f.length - 1]);
          place(el, GAP + (3 + i) * COL_W, TOP);
          el.dataset.pile = 'foundation'; el.dataset.index = i;
          felt.appendChild(el);
        }
      });
      // Tableau
      const tableauTop = TOP + 120;
      state.tableau.forEach((col, ci) => {
        const x = GAP + ci * COL_W;
        felt.appendChild(slot(x, tableauTop));
        col.forEach((card, ri) => {
          const el = cardEl(card);
          place(el, x, tableauTop + ri * ROW);
          el.dataset.pile = 'tableau'; el.dataset.index = ci; el.dataset.cardIndex = ri;
          felt.appendChild(el);
        });
      });
      updateStatus();
    }

    function updateStatus() {
      document.getElementById('status-score').textContent = 'Score: ' + state.score;
      document.getElementById('status-mode').textContent =
        (state.drawCount === 1 ? 'Draw One' : 'Draw Three') +
        ' · ' + (state.timed ? 'Timed' : 'Standard');
    }

    function newGame(opts = {}) {
      const drawCount = opts.drawCount || (state ? state.drawCount : 3);
      const timed = opts.timed != null ? opts.timed : (state ? state.timed : false);
      state = Solitaire.deal(Solitaire.makeRng((Math.random() * 2 ** 32) >>> 0), drawCount);
      state.timed = timed;
      history = [];
      render();
    }

    newGame();
  </script>
```

- [ ] **Step 3: Verify in browser**

Open/refresh `solitaire.html`. Expected: a fresh deal — 7 tableau columns (1–7 cards, only the bottom card of each face-up), a face-down stock at top-left, empty waste slot, and 4 empty foundation slots at top-right. Card faces show rank + suit in two corners and a large center pip; face cards show a large letter. Refreshing reshuffles.

- [ ] **Step 4: Commit**

```bash
git add solitaire.html
git commit -m "feat: pile layout and card rendering from engine state"
```

---

### Task 11: Stock click to draw / recycle

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add a click handler and history push helper**

In the bottom `<script>`, add before `newGame();`:

```js
    function pushHistory() { history.push(Solitaire.cloneState(state)); }

    felt.addEventListener('click', (e) => {
      const el = e.target.closest('[data-pile]');
      if (!el) return;
      if (el.dataset.pile === 'stock') {
        pushHistory();
        Solitaire.drawStock(state);
        render();
      }
    });
```

- [ ] **Step 2: Verify in browser**

Open/refresh. Click the face-down stock: in Draw Three, up to three cards appear face-up on the waste (top card fully visible). Keep clicking until the stock empties; the stock becomes an empty slot. Click the empty slot: the waste recycles back into a face-down stock. The status score may drop by the recycle penalty (clamped at 0).

- [ ] **Step 3: Commit**

```bash
git add solitaire.html
git commit -m "feat: stock click to draw and recycle"
```

---

### Task 12: Drag and drop (single cards + valid sequences)

**Files:**
- Modify: `solitaire.html`

Implements pointer-based dragging. On pointer-down on a face-up card, compute the source location and the moving run (for tableau, all cards from that index down — only if they form a valid sequence). On pointer-up over a target pile, attempt `Solitaire.moveCards`.

- [ ] **Step 1: Add drag CSS for the floating stack**

In `<style>` add:

```css
  #drag-layer { position: absolute; inset: 0; pointer-events: none; z-index: 50; }
  #drag-layer .card { box-shadow: 0 6px 14px rgba(0,0,0,.4); }
```

- [ ] **Step 2: Add the drag-layer element**

In the HTML, immediately after `<div id="felt"></div>`'s contents are rendered, we instead add a persistent layer. Add this line right after `const felt = document.getElementById('felt');`:

```js
    const dragLayer = document.createElement('div');
    dragLayer.id = 'drag-layer';
    felt.appendChild(dragLayer);
```

And in `render()`, change `felt.innerHTML = '';` to preserve the drag layer:

```js
      felt.querySelectorAll('.pile, .card:not(#drag-layer .card)').forEach(n => n.remove());
```

> Simpler and robust: keep `felt.innerHTML = ''` but re-append the drag layer at the end of `render()`. Use this approach — add `felt.appendChild(dragLayer);` as the last line of `render()` (after `updateStatus()`), and remove the `dragLayer` creation/append from setup so it is only ever attached via render. Define `const dragLayer = document.createElement('div'); dragLayer.id = 'drag-layer';` once at top (without appending).

- [ ] **Step 3: Implement drag logic**

Add to the bottom `<script>` (before `newGame();`):

```js
    let drag = null; // { cards, src, els, dx, dy }

    function sourceFromEl(el) {
      const p = el.dataset.pile;
      if (p === 'waste') return { pile: 'waste' };
      if (p === 'foundation') return { pile: 'foundation', index: +el.dataset.index };
      if (p === 'tableau') return { pile: 'tableau', index: +el.dataset.index, cardIndex: +el.dataset.cardIndex };
      return null;
    }

    function movingCards(src) {
      if (src.pile === 'waste') {
        const c = state.waste[state.waste.length - 1];
        return c ? [c] : [];
      }
      if (src.pile === 'foundation') {
        const f = state.foundations[src.index];
        const c = f[f.length - 1];
        return c ? [c] : [];
      }
      if (src.pile === 'tableau') {
        return state.tableau[src.index].slice(src.cardIndex);
      }
      return [];
    }

    felt.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.card');
      if (!el || el.classList.contains('back')) return;
      if (el.dataset.pile === 'stock') return;
      const src = sourceFromEl(el);
      if (!src) return;
      const cards = movingCards(src);
      if (cards.length === 0) return;
      if (src.pile === 'tableau' && !Solitaire.isValidSequence(cards)) return;

      const feltRect = felt.getBoundingClientRect();
      const startX = e.clientX - feltRect.left;
      const startY = e.clientY - feltRect.top;
      const baseTop = parseFloat(el.style.top);
      const baseLeft = parseFloat(el.style.left);

      drag = { cards, src, els: [], dx: startX - baseLeft, dy: startY - baseTop };
      cards.forEach((card, i) => {
        const ce = cardEl(card);
        ce.style.left = baseLeft + 'px';
        ce.style.top = (baseTop + i * ROW) + 'px';
        dragLayer.appendChild(ce);
        drag.els.push({ ce, offset: i * ROW });
      });
      // Hide the originals
      felt.querySelectorAll('.card').forEach(c => {
        if (c.dataset.pile === src.pile &&
            (src.pile !== 'tableau' || +c.dataset.index === src.index) &&
            (src.pile !== 'tableau' || +c.dataset.cardIndex >= src.cardIndex)) {
          if (!dragLayer.contains(c)) c.style.visibility = 'hidden';
        }
      });
      felt.setPointerCapture(e.pointerId);
    });

    felt.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const r = felt.getBoundingClientRect();
      const x = e.clientX - r.left - drag.dx;
      const y = e.clientY - r.top - drag.dy;
      drag.els.forEach(({ ce, offset }) => { ce.style.left = x + 'px'; ce.style.top = (y + offset) + 'px'; });
    });

    function pileAtPoint(x, y) {
      // Returns the best drop target {pile,index} by hit-testing pile slots/cards.
      const els = document.elementsFromPoint(x, y);
      for (const el of els) {
        const t = el.closest('[data-pile]');
        if (t && t.dataset.pile !== 'stock' && !dragLayer.contains(t)) {
          if (t.dataset.pile === 'foundation') return { pile: 'foundation', index: +t.dataset.index };
          if (t.dataset.pile === 'tableau') return { pile: 'tableau', index: +t.dataset.index };
        }
      }
      return null;
    }

    felt.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const target = pileAtPoint(e.clientX, e.clientY);
      let moved = false;
      if (target) {
        pushHistory();
        const result = Solitaire.moveCards(state, drag.src, target);
        if (result) moved = true; else history.pop();
      }
      drag.els.forEach(({ ce }) => ce.remove());
      drag = null;
      render();
      if (moved) afterMove();
    });

    function afterMove() {
      // hooks added in later tasks (win check, auto-complete, persistence)
    }
```

> Note: foundation drops only accept a single card; `moveCards` already enforces that, so dragging a multi-card run onto a foundation simply fails and snaps back.

- [ ] **Step 4: Verify in browser**

Open/refresh. Drag a face-up card onto a legal tableau target (one rank lower, alternating color) — it sticks and the exposed card flips. Drag an Ace onto an empty foundation, then the 2 of the same suit — both stick. Drag a valid multi-card run (e.g., red-black-red descending) onto a black/red target — the whole run moves. Illegal drops snap back with no change. Drag a King onto an empty column.

- [ ] **Step 5: Commit**

```bash
git add solitaire.html
git commit -m "feat: drag and drop for cards and sequences"
```

---

### Task 13: Double-click and right-click auto-to-foundation

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add handlers**

In the bottom `<script>`, add before `newGame();`:

```js
    function tryAutoFoundation(el) {
      const src = sourceFromEl(el);
      if (!src) return;
      pushHistory();
      if (Solitaire.autoToFoundation(state, src)) { render(); afterMove(); }
      else history.pop();
    }

    felt.addEventListener('dblclick', (e) => {
      const el = e.target.closest('.card');
      if (!el || el.classList.contains('back') || el.dataset.pile === 'stock') return;
      tryAutoFoundation(el);
    });

    felt.addEventListener('contextmenu', (e) => {
      e.preventDefault(); // suppress browser menu over the felt
      const el = e.target.closest('.card');
      if (!el || el.classList.contains('back') || el.dataset.pile === 'stock') return;
      tryAutoFoundation(el);
    });
```

- [ ] **Step 2: Verify in browser**

Open/refresh. Double-click an exposed Ace → it jumps to a foundation. Double-click the next card of that suit → it follows. Right-click a card that can go to a foundation → same behavior, and no browser context menu appears. Double/right-clicking a card with no legal foundation does nothing.

- [ ] **Step 3: Commit**

```bash
git add solitaire.html
git commit -m "feat: double-click and right-click auto-to-foundation"
```

---

### Task 14: Undo + keyboard shortcuts

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add undo and key handling**

In the bottom `<script>`, add before `newGame();`:

```js
    function undo() {
      if (!history.length) return;
      state = history.pop();
      render();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'F2') { e.preventDefault(); newGame(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        pushHistory(); Solitaire.drawStock(state); render();
      }
    });
```

- [ ] **Step 2: Verify in browser**

Open/refresh. Make a few moves, press Ctrl+Z (Cmd+Z on macOS) repeatedly — each press reverts one move including score. Press Space/Enter to draw from stock. Press F2 to start a new game. Undo at the very start does nothing.

- [ ] **Step 3: Commit**

```bash
git add solitaire.html
git commit -m "feat: unlimited undo and keyboard shortcuts"
```

---

### Task 15: Game/Help menus + dialogs (New Game, Deck picker, Options, About)

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add dialog + dropdown CSS**

In `<style>` add:

```css
  .dropdown {
    position: absolute; top: 100%; left: 0; min-width: 160px; z-index: 100;
    background: #fff; border: 1px solid #aca899; box-shadow: 2px 2px 6px rgba(0,0,0,.3);
    font-size: 13px;
  }
  .dropdown div { padding: 5px 14px; cursor: pointer; }
  .dropdown div:hover { background: #cfe2ff; }
  .dropdown hr { border: none; border-top: 1px solid #ddd; margin: 2px 0; }
  .overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,.25); z-index: 200;
    display: grid; place-items: center;
  }
  .dialog {
    background: #ece9d8; border: 2px solid #0831a0; border-radius: 6px;
    min-width: 280px; font-size: 13px;
  }
  .dialog .bar { background: linear-gradient(#2a64d4,#1941a5); color:#fff; font-weight:bold; padding:4px 8px; }
  .dialog .body { padding: 12px; }
  .dialog .row { margin: 6px 0; }
  .dialog button { margin: 8px 4px 0; padding: 3px 14px; }
  .deck-grid { display: grid; grid-template-columns: repeat(4, 48px); gap: 10px; }
  .deck-grid .opt { height: 68px; border-radius: 6px; border: 2px solid #fff; cursor: pointer; }
  .deck-grid .opt.selected { outline: 3px solid #ffd400; }
```

- [ ] **Step 2: Add card-back definitions + dialog/menu logic**

In the bottom `<script>`, add before `newGame();`:

```js
    const CARD_BACKS = {
      blue:  'repeating-linear-gradient(45deg,#1b4ea8 0 4px,#3a6fd0 4px 8px)',
      red:   'repeating-linear-gradient(45deg,#a81b1b 0 4px,#d03a3a 4px 8px)',
      green: 'radial-gradient(circle at 50% 50%, #2a9d5a 0 5px, #0a7d3e 6px) 0 0/14px 14px, #0a7d3e',
      purple:'linear-gradient(135deg,#6a3fb5,#b53f9a)',
    };
    let cardBack = 'blue';

    function applyCardBack() {
      const css = CARD_BACKS[cardBack];
      document.querySelectorAll('.card.back').forEach(el => { el.style.background = css; });
    }

    function closeMenus() { document.querySelectorAll('.dropdown, .overlay').forEach(n => n.remove()); }

    function openDropdown(anchor, items) {
      closeMenus();
      const dd = document.createElement('div');
      dd.className = 'dropdown';
      items.forEach(it => {
        if (it === '-') { dd.appendChild(document.createElement('hr')); return; }
        const d = document.createElement('div');
        d.textContent = it.label;
        d.onclick = (ev) => { ev.stopPropagation(); closeMenus(); it.action(); };
        dd.appendChild(d);
      });
      anchor.appendChild(dd);
    }

    function dialog(title, bodyEl, onOk) {
      closeMenus();
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      const dlg = document.createElement('div');
      dlg.className = 'dialog';
      const bar = document.createElement('div'); bar.className = 'bar'; bar.textContent = title;
      const body = document.createElement('div'); body.className = 'body';
      body.appendChild(bodyEl);
      const ok = document.createElement('button'); ok.textContent = 'OK';
      ok.onclick = () => { if (onOk) onOk(); overlay.remove(); };
      const cancel = document.createElement('button'); cancel.textContent = 'Cancel';
      cancel.onclick = () => overlay.remove();
      body.append(document.createElement('br'), ok, cancel);
      dlg.append(bar, body); overlay.appendChild(dlg);
      document.getElementById('window').appendChild(overlay);
    }

    document.getElementById('menu-game').addEventListener('click', (e) => {
      e.stopPropagation();
      openDropdown(e.currentTarget, [
        { label: 'New Game', action: () => newGame() },
        { label: 'Undo', action: () => undo() },
        '-',
        { label: 'Deck…', action: openDeckPicker },
        { label: 'Options…', action: openOptions },
        '-',
        { label: 'Exit', action: () => { document.getElementById('window').style.display = 'none'; } },
      ]);
    });

    document.getElementById('menu-help').addEventListener('click', (e) => {
      e.stopPropagation();
      openDropdown(e.currentTarget, [
        { label: 'About Solitaire', action: openAbout },
      ]);
    });

    document.addEventListener('click', closeMenus);

    function openDeckPicker() {
      const grid = document.createElement('div');
      grid.className = 'deck-grid';
      let choice = cardBack;
      Object.entries(CARD_BACKS).forEach(([key, css]) => {
        const o = document.createElement('div');
        o.className = 'opt' + (key === cardBack ? ' selected' : '');
        o.style.background = css;
        o.onclick = () => {
          choice = key;
          grid.querySelectorAll('.opt').forEach(n => n.classList.remove('selected'));
          o.classList.add('selected');
        };
        grid.appendChild(o);
      });
      dialog('Select Card Back', grid, () => { cardBack = choice; render(); savePrefs(); });
    }

    function openOptions() {
      const wrap = document.createElement('div');
      wrap.innerHTML =
        '<div class="row"><label><input type="radio" name="draw" value="1"> Draw One</label> ' +
        '<label><input type="radio" name="draw" value="3"> Draw Three</label></div>' +
        '<div class="row"><label><input type="checkbox" id="opt-timed"> Timed game</label></div>';
      wrap.querySelector('input[value="' + state.drawCount + '"]').checked = true;
      wrap.querySelector('#opt-timed').checked = state.timed;
      dialog('Options', wrap, () => {
        const draw = +wrap.querySelector('input[name="draw"]:checked').value;
        const timed = wrap.querySelector('#opt-timed').checked;
        newGame({ drawCount: draw, timed });
        savePrefs();
      });
    }

    function openAbout() {
      const p = document.createElement('div');
      p.innerHTML = 'Solitaire — a Windows XP tribute.<br>Klondike, Draw 1 or 3.<br>Built with vanilla HTML/CSS/JS.';
      dialog('About Solitaire', p, null);
    }

    function savePrefs() { /* implemented in Task 18 */ }
```

- [ ] **Step 3: Call applyCardBack in render**

In `render()`, add `applyCardBack();` as the last line (after `felt.appendChild(dragLayer);`).

- [ ] **Step 4: Verify in browser**

Open/refresh. Click **Game** → dropdown shows New Game, Undo, Deck…, Options…, Exit. Open **Deck…** → a 4-back grid; selecting one and clicking OK changes all face-down card backs. Open **Options…** → choose Draw One/Three and toggle Timed, click OK → a new game deals with those settings and the status bar updates. **Help → About** shows the dialog. Clicking elsewhere closes menus. Exit hides the window.

- [ ] **Step 5: Commit**

```bash
git add solitaire.html
git commit -m "feat: Game/Help menus, deck picker, options, and about dialogs"
```

---

### Task 16: Timer + score/time status bar updates

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add a timer**

In the bottom `<script>`, add before `newGame();`:

```js
    let elapsed = 0, timerId = null;

    function startTimer() {
      stopTimer();
      elapsed = 0;
      document.getElementById('status-time').textContent = 'Time: 0';
      timerId = setInterval(() => {
        elapsed++;
        document.getElementById('status-time').textContent = 'Time: ' + elapsed;
      }, 1000);
    }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
```

- [ ] **Step 2: Start the timer on each new game**

In `newGame()`, add `startTimer();` as the last line (after `render();`).

- [ ] **Step 3: Verify in browser**

Open/refresh. The status bar "Time:" counts up once per second from 0. Starting a new game (F2 or menu) resets it to 0.

- [ ] **Step 4: Commit**

```bash
git add solitaire.html
git commit -m "feat: game timer and status bar time display"
```

---

### Task 17: Auto-complete trigger + win detection + timed bonus

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Implement afterMove with auto-complete and win handling**

Replace the placeholder `afterMove` function with:

```js
    function afterMove() {
      if (Solitaire.canAutoComplete(state)) { runAutoComplete(); return; }
      if (Solitaire.isWon(state)) winGame();
    }

    function runAutoComplete() {
      const tick = setInterval(() => {
        const moved = Solitaire.autoCompleteStep(state);
        render();
        if (!moved) {
          clearInterval(tick);
          if (Solitaire.isWon(state)) winGame();
        }
      }, 120);
    }

    function winGame() {
      stopTimer();
      if (state.timed) {
        state.score += Solitaire.timeBonus(elapsed);
        updateStatus();
      }
      startWinAnimation(); // implemented in Task 18
    }
```

- [ ] **Step 2: Add a temporary stub for the animation**

Add before `newGame();` (it will be replaced in Task 18):

```js
    function startWinAnimation() { /* replaced in Task 18 */ }
```

- [ ] **Step 3: Verify in browser**

This is best tested with a near-won game. Temporarily, in the console, force a state close to completion is awkward; instead verify the mechanism: play a winnable deal until all tableau cards are face-up and the stock/waste are empty — the remaining cards should fly to the foundations automatically (one every ~120ms), and the timer stops. (Full win visuals come in Task 18.)

- [ ] **Step 4: Commit**

```bash
git add solitaire.html
git commit -m "feat: auto-complete trigger, win detection, timed bonus"
```

---

### Task 18: Win cascade animation + persistence

**Files:**
- Modify: `solitaire.html`

- [ ] **Step 1: Add an animation canvas-free DOM cascade**

Replace the `startWinAnimation` stub with:

```js
    let winRaf = null;
    function startWinAnimation() {
      const sources = [];
      state.foundations.forEach((f, i) => {
        const x = GAP + (3 + i) * COL_W;
        f.slice().reverse().forEach(card => sources.push({ card, x, y: TOP }));
      });
      let queue = sources.slice();
      const sprites = [];
      const feltRect = felt.getBoundingClientRect();
      const W = feltRect.width, H = feltRect.height;

      function launch() {
        if (!queue.length) return;
        const s = queue.shift();
        const el = cardEl(s.card);
        el.style.left = s.x + 'px'; el.style.top = s.y + 'px';
        applyOneBack(el);
        felt.appendChild(el);
        sprites.push({
          el, x: s.x, y: s.y,
          vx: (Math.random() * 6 - 3) || 2,
          vy: -(Math.random() * 6 + 4),
        });
      }
      const launcher = setInterval(() => {
        launch();
        if (!queue.length) clearInterval(launcher);
      }, 140);

      function step() {
        sprites.forEach(s => {
          s.vy += 0.5;           // gravity
          s.x += s.vx; s.y += s.vy;
          if (s.y > H - 100) {   // bounce off bottom
            s.y = H - 100; s.vy *= -0.75;
            if (Math.abs(s.vy) < 2) s.vy = -(Math.random() * 6 + 6);
          }
          s.el.style.left = s.x + 'px';
          s.el.style.top = s.y + 'px';
        });
        winRaf = requestAnimationFrame(step);
      }
      step();
    }

    function applyOneBack(el) {
      if (el.classList.contains('back')) el.style.background = CARD_BACKS[cardBack];
    }

    function stopWinAnimation() {
      if (winRaf) { cancelAnimationFrame(winRaf); winRaf = null; }
    }
```

> The cascade leaves a trail because each sprite is a persistent DOM card that keeps moving; we never clear them, matching XP's accumulating cascade. Starting a new game clears the felt.

- [ ] **Step 2: Stop the animation on new game and on click**

In `newGame()`, add `stopWinAnimation();` as the first line. Also add, before `newGame();`:

```js
    felt.addEventListener('pointerdown', () => { if (winRaf) { stopWinAnimation(); } }, true);
```

- [ ] **Step 3: Implement persistence**

Replace the `savePrefs` stub with:

```js
    function savePrefs() {
      try {
        localStorage.setItem('xp-solitaire', JSON.stringify({
          cardBack, drawCount: state.drawCount, timed: state.timed,
        }));
      } catch (_) {}
    }
    function loadPrefs() {
      try {
        const p = JSON.parse(localStorage.getItem('xp-solitaire') || '{}');
        if (p.cardBack && CARD_BACKS[p.cardBack]) cardBack = p.cardBack;
        return p;
      } catch (_) { return {}; }
    }
```

Change the final `newGame();` call to honor saved prefs:

```js
    const prefs = loadPrefs();
    newGame({ drawCount: prefs.drawCount || 3, timed: !!prefs.timed });
```

- [ ] **Step 4: Verify in browser**

Open/refresh. Win a game (or finish via auto-complete): cards launch from the foundations and bounce/cascade down the felt, leaving trails. Click anywhere to stop. Pick a card back in Deck… and reload the page — the chosen back persists. Change Draw mode/Timed in Options and reload — those persist too.

- [ ] **Step 5: Commit**

```bash
git add solitaire.html
git commit -m "feat: win cascade animation and localStorage persistence"
```

---

### Task 19: Inline engine → single-file build + final verification

**Files:**
- Modify: `solitaire.html`

This produces the shipped single-file artifact. ES-module `file://` imports are blocked in some browsers, so inlining the classic engine script guarantees double-click works everywhere.

- [ ] **Step 1: Inline the engine**

Open `engine.js` and copy its entire contents. In `solitaire.html`, replace the line:

```html
  <script src="engine.js"></script>
```

with:

```html
  <script>
  /* ===== inlined engine.js (source of truth: ./engine.js) ===== */
  // (paste the full contents of engine.js here, unchanged)
  </script>
```

Keep `engine.js` and `tests/engine.test.mjs` in the repo as the tested source of truth. If the engine changes later, re-run this inlining step.

- [ ] **Step 2: Verify the single file runs standalone**

Move/copy `solitaire.html` to a location without `engine.js` present (e.g. a temp folder) and double-click it (open via `file://`). Expected: the game loads and is fully playable — deal, draw, drag, double/right-click to foundation, undo, menus, deck picker, options, timer, auto-complete, and win cascade all work with no console errors and no network requests.

- [ ] **Step 3: Run the engine tests one final time**

Run: `node --test`
Expected: PASS — the canonical engine is still green.

- [ ] **Step 4: Commit**

```bash
git add solitaire.html
git commit -m "build: inline engine into single-file solitaire.html"
```

---

## Self-Review

**Spec coverage:**
- Luna window chrome (title bar, Game/Help menu, status bar) → Tasks 9, 15, 16. ✓
- Green felt + pile layout → Tasks 9, 10. ✓
- Clean classic card faces + Unicode pips → Task 10. ✓
- Card-back deck picker (multiple backs) → Task 15. ✓
- Klondike rules (deal, tableau, foundations, stock/waste) → Tasks 2–5. ✓
- Drag single + sequences → Task 12. ✓
- Double-click + right-click auto-to-foundation → Task 13. ✓
- Click stock to draw / recycle → Task 11. ✓
- Unlimited undo → Task 14. ✓
- Auto-complete → Tasks 7, 17. ✓
- Keyboard shortcuts (F2, Ctrl+Z, Space/Enter) → Task 14. ✓
- Standard scoring + Timed bonus + Draw 3 default → Tasks 4, 5, 8, 17; default set in `newGame`/deal. ✓
- Win cascade animation → Task 18. ✓
- localStorage persistence (card back, draw mode, scoring/timed) → Task 18. ✓
- Single self-contained file → Task 19. ✓

**Placeholder scan:** `afterMove`, `startWinAnimation`, and `savePrefs` are intentionally introduced as stubs and explicitly replaced in later tasks (17, 18) — each replacement shows full code. No unresolved placeholders remain.

**Type consistency:** State shape and card shape are fixed in the Conventions section and used consistently. Engine function names referenced by the UI (`makeRng`, `deal`, `drawStock`, `moveCards`, `autoToFoundation`, `isValidSequence`, `isWon`, `canAutoComplete`, `autoCompleteStep`, `cloneState`, `timeBonus`, `isRed`, `SUITS`) all match their definitions in Tasks 1–8. Source/destination location objects use `{pile, index, cardIndex}` consistently across engine and UI.

**Note on scoring exactness:** Recycle penalties and the time-bonus formula use commonly-cited XP values; the spec already flags exact constants as tunable. Tests pin the implemented behavior so changes are safe.
