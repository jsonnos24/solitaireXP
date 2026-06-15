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

const C = (rank, suit, faceUp = true) => ({ rank, suit, faceUp });

test('canStackTableau: descending, alternating color', () => {
  assert.equal(Solitaire.canStackTableau(C(6, 'H'), C(7, 'S')), true);
  assert.equal(Solitaire.canStackTableau(C(6, 'D'), C(7, 'H')), false);
  assert.equal(Solitaire.canStackTableau(C(5, 'S'), C(7, 'H')), false);
});

test('canStackTableau: only a King goes on an empty column', () => {
  assert.equal(Solitaire.canStackTableau(C(13, 'S'), null), true);
  assert.equal(Solitaire.canStackTableau(C(12, 'S'), null), false);
});

test('canStackFoundation: Ace starts, then same suit ascending', () => {
  assert.equal(Solitaire.canStackFoundation(C(1, 'H'), []), true);
  assert.equal(Solitaire.canStackFoundation(C(2, 'H'), []), false);
  assert.equal(Solitaire.canStackFoundation(C(2, 'H'), [C(1, 'H')]), true);
  assert.equal(Solitaire.canStackFoundation(C(2, 'S'), [C(1, 'H')]), false);
  assert.equal(Solitaire.canStackFoundation(C(3, 'H'), [C(1, 'H')]), false);
});

test('isValidSequence: descending alternating face-up run', () => {
  assert.equal(Solitaire.isValidSequence([C(7, 'S'), C(6, 'H'), C(5, 'S')]), true);
  assert.equal(Solitaire.isValidSequence([C(7, 'S'), C(6, 'S')]), false);
  assert.equal(Solitaire.isValidSequence([C(7, 'S', false), C(6, 'H')]), false);
  assert.equal(Solitaire.isValidSequence([C(9, 'D')]), true);
});

function tableauState(columns) {
  return {
    stock: [], waste: [], foundations: [[], [], [], []],
    tableau: columns, drawCount: 3, scoringMode: 'standard',
    timed: false, score: 0, recycles: 0,
  };
}

test('moveCards: tableau→tableau moves a valid run and flips the exposed card', () => {
  const s = tableauState([
    [C(9, 'C', false), C(7, 'H')],
    [C(8, 'S')],
    [], [], [], [], [],
  ]);
  const out = Solitaire.moveCards(s, { pile: 'tableau', index: 0, cardIndex: 1 },
                                     { pile: 'tableau', index: 1 });
  assert.deepEqual(out.tableau[1].map(c => c.rank + c.suit), ['8S', '7H']);
  assert.equal(out.tableau[0].length, 1);
  assert.equal(out.tableau[0][0].faceUp, true);
  assert.equal(out.score, 5);
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
  const s = tableauState([[C(3, 'S')], [], [], [], [], [], []]);
  s.foundations[0] = [C(1, 'H'), C(2, 'H')];
  const out = Solitaire.moveCards(s, { pile: 'foundation', index: 0 },
                                     { pile: 'tableau', index: 0 });
  assert.equal(out.score, 0);
});

test('moveCards: rejects an illegal move and leaves state unchanged', () => {
  const s = tableauState([[C(7, 'H')], [C(7, 'S')], [], [], [], [], []]);
  const out = Solitaire.moveCards(s, { pile: 'tableau', index: 0, cardIndex: 0 },
                                     { pile: 'tableau', index: 1 });
  assert.equal(out, null);
});

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

test('drawStock recycles waste back to stock (face-down) and counts recycle', () => {
  const s = stockState([], 1);
  s.waste = [C(2, 'S'), C(3, 'S'), C(4, 'S')];
  Solitaire.drawStock(s);
  assert.equal(s.waste.length, 0);
  assert.equal(s.stock.length, 3);
  assert.ok(s.stock.every(c => !c.faceUp));
  assert.deepEqual(s.stock.map(c => c.rank), [4, 3, 2]);
  assert.equal(s.recycles, 1);
  assert.equal(s.score, 0);
});

test('drawStock applies no penalty on recycles 1-3', () => {
  const s = stockState([], 1);
  s.score = 500; s.recycles = 2; // next recycle will be #3
  Solitaire.drawStock(s);
  assert.equal(s.recycles, 3);
  assert.equal(s.score, 500); // no penalty through the 3rd pass
});

test('drawStock applies penalty starting on the 4th recycle (100 Draw1, 20 Draw3)', () => {
  const s1 = stockState([], 1);
  s1.score = 500; s1.recycles = 3; // next recycle will be #4
  Solitaire.drawStock(s1);
  assert.equal(s1.recycles, 4);
  assert.equal(s1.score, 400); // -100 for Draw One

  const s3 = stockState([], 3);
  s3.score = 500; s3.recycles = 3;
  Solitaire.drawStock(s3);
  assert.equal(s3.recycles, 4);
  assert.equal(s3.score, 480); // -20 for Draw Three
});

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
  assert.equal(Solitaire.autoCompleteStep(s), false);
});

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
  assert.equal(Solitaire.timeBonus(20), 0);
  const fast = Solitaire.timeBonus(60);
  const slow = Solitaire.timeBonus(300);
  assert.ok(fast > slow);
  assert.ok(Number.isInteger(fast));
});

test('autoPlace: moves a card to a tableau build when no foundation move exists', () => {
  // red 8 on waste, black 9 available on a tableau column → should build onto the 9
  const s = tableauState([[C(9, 'S')], [], [], [], [], [], []]);
  s.waste = [C(8, 'H')];
  const moved = Solitaire.autoPlace(s, { pile: 'waste' });
  assert.equal(moved, true);
  assert.equal(s.waste.length, 0);
  assert.deepEqual(s.tableau[0].map(c => c.rank + c.suit), ['9S', '8H']);
});

test('autoPlace: prefers the foundation over a tableau build', () => {
  // Ace of hearts can go to foundation; also a black 2 sits in tableau but Ace cannot build there anyway
  const s = tableauState([[C(2, 'S')], [], [], [], [], [], []]);
  s.waste = [C(1, 'H')];
  const moved = Solitaire.autoPlace(s, { pile: 'waste' });
  assert.equal(moved, true);
  assert.equal(s.waste.length, 0);
  assert.ok(s.foundations.some(f => f.length === 1 && f[0].rank === 1 && f[0].suit === 'H'));
});

test('autoPlace: moves a valid tableau run onto another column', () => {
  // column 0: 9C(down) then run 8H,7S ; column 1: 9S → run should move onto 9S? No: 8H on 9S works
  const s = tableauState([
    [C(9, 'C', false), C(8, 'H'), C(7, 'S')],
    [C(9, 'S')],
    [], [], [], [], [],
  ]);
  const moved = Solitaire.autoPlace(s, { pile: 'tableau', index: 0, cardIndex: 1 });
  assert.equal(moved, true);
  assert.deepEqual(s.tableau[1].map(c => c.rank + c.suit), ['9S', '8H', '7S']);
  assert.equal(s.tableau[0].length, 1);
  assert.equal(s.tableau[0][0].faceUp, true); // 9C flipped
});

test('autoPlace: returns false when nothing legal is available', () => {
  const s = tableauState([[C(8, 'H')], [], [], [], [], [], []]);
  // no black 9 anywhere, no foundation move
  const moved = Solitaire.autoPlace(s, { pile: 'tableau', index: 0 });
  assert.equal(moved, false);
  assert.equal(s.tableau[0].length, 1);
});

test('autoPlace: does not move a card onto an empty column', () => {
  // lone red 8 on waste, all tableau columns empty → no build target, should stay
  const s = tableauState([[], [], [], [], [], [], []]);
  s.waste = [C(8, 'H')];
  const moved = Solitaire.autoPlace(s, { pile: 'waste' });
  assert.equal(moved, false);
  assert.equal(s.waste.length, 1);
});
