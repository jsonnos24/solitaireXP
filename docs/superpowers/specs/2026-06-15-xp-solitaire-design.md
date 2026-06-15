# Windows XP Solitaire Replica — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Goal

A single, self-contained `solitaire.html` file that recreates the Windows XP
version of Klondike Solitaire — the "definitive" one — capturing both its Luna
visual style and its fast, frictionless gameplay flow. Double-clicking the file
plays the game; no build step, no network, no external assets.

## Guiding principles

- **Instant and lightweight.** Opens immediately, cards snap into place, no slow
  forced animations (except the win cascade).
- **Distraction-free.** No ads, achievements, currencies, accounts, or pop-ups.
- **Authentic XP feel.** Luna window chrome, green felt table, classic card
  designs, status bar, and the iconic win animation.
- **Pure flow for power users.** Double-click/right-click auto-to-foundation,
  auto-complete, unlimited undo, keyboard shortcuts.

## Tech approach

Vanilla HTML/CSS/JS in one file. No frameworks, no build step, no external
files. Cards, card backs, and chrome are drawn with CSS and Unicode suit glyphs
(♠ ♥ ♦ ♣). Chosen over a framework/library because the single-file, zero-build,
instant-load constraint is central to the project and a framework adds weight
for no benefit.

## Layout & window chrome

A fake XP "Luna" window centered on a desktop-blue background.

- **Title bar:** blue gradient, "♠ Solitaire" label, and minimize/maximize/close
  buttons (decorative; they may no-op or fade the window).
- **Menu bar:** `Game` and `Help`.
  - **Game** dropdown: New Game (F2), Undo (Ctrl+Z), Deck… (card-back picker),
    Options… (Draw One/Three, Standard/Timed scoring), Exit.
  - **Help** → small About dialog.
- **Play area (green felt):**
  - Top-left: stock pile + waste pile.
  - Top-right: 4 foundation piles.
  - Below: 7 tableau columns.
- **Status bar (bottom):** `Score`, `Time`, and current draw/scoring mode.

## Game model & rules (Klondike)

- Standard 52-card shuffled deck.
- Deal: 7 tableau columns of 1–7 cards; the last card of each column is face-up,
  the rest face-down. Remaining 24 cards form the stock.
- **Tableau:** build down by alternating color. Move a single face-up card or a
  valid descending alternating-color sequence. Empty columns accept a King (or a
  King-led sequence).
- **Foundations:** build up by suit starting at Ace. Game is won when all four
  foundations are complete (A→K).
- **Stock/waste:** clicking the stock deals cards to the waste (1 or 3 per the
  draw mode). When the stock is empty, clicking it recycles the waste back into
  the stock.

## Interactions

- **Drag & drop:** single cards or valid sequences onto legal targets.
- **Double-click:** auto-send a card to its foundation if the move is legal.
- **Right-click:** same auto-to-foundation behavior; the browser context menu is
  suppressed over the play area.
- **Click stock:** draw (or recycle when empty). Cards snap instantly.
- **Unlimited undo:** each move is pushed to an undo stack; Undo reverts the last
  move and applies the appropriate scoring adjustment.
- **Auto-complete:** once every card in the tableau is face-up and the only
  remaining moves are to foundations, the game automatically plays all cards to
  the foundations (XP default behavior — no button required).
- **Keyboard shortcuts:** F2 = New Game, Ctrl+Z = Undo, Space/Enter = draw from
  stock.

## Scoring

Two modes selectable in Options (status bar shows the active mode):

- **Standard scoring** (classic XP values):
  - +10: waste → foundation
  - +5: waste → tableau
  - +5: turn over a tableau card (reveal)
  - −15: foundation → tableau
  - −20 (Draw Three) / −100 (Draw One) per pass through the stock after the
    third recycle, matching XP's recycle penalties (final exact values confirmed
    during implementation).
  - Score never displays below 0.
- **Timed game (toggle on top of standard):** a timer counts up during play. On a
  win, a time bonus is added to the score (faster wins → larger bonus, per XP's
  `bonus = 700000 / seconds` style formula, applied for games longer than 30s).
  When the timed option is off, no bonus is applied and the timer is purely
  informational.

Draw mode default: **Draw Three**, with a toggle to Draw One in Options.

## Win animation

On a win, cards launch one by one from the foundation piles and bounce/cascade
around the play area: each card is given a horizontal velocity and gravity, and
bounces off the bottom edge with damping, leaving a trail of card images as it
falls (the classic XP cascade). The animation runs until the user clicks or
starts a new game.

## Persistence

`localStorage` remembers the selected card back, draw mode, and scoring mode
between sessions. No accounts, no network.

## File structure

Single file `solitaire.html` with inline `<style>` and `<script>`. The script is
organized into clearly delimited sections:

- **Model:** deck creation, shuffle, deal, pile state, move validation.
- **Rendering:** drawing piles/cards from state into the DOM.
- **Interaction:** drag-and-drop, double-click/right-click auto-move, stock draw.
- **Scoring:** standard scoring, timer, timed bonus, undo adjustments.
- **Win animation:** the bounce/cascade loop.
- **Menus/dialogs:** Game/Help menus, Deck picker, Options, About.

## Out of scope (YAGNI)

- Vegas scoring (standard + timed only).
- Sound effects.
- Multiple solitaire variants (Klondike only).
- Online features, accounts, syncing, leaderboards.
- Detailed court-card figure art (clean rank-index card faces instead).
