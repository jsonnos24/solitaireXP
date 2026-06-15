# Windows XP Solitaire (replica)

A single-file recreation of Windows XP Klondike Solitaire.

## Play
Open `solitaire.html` in any modern browser (double-click works — no server needed).

## Develop / test
Game logic lives in `engine.js` and is tested with Node's built-in runner:

    node --test

`solitaire.html` loads `engine.js` during development; the engine is inlined into
`solitaire.html` as the final build step so the shipped file is self-contained.
