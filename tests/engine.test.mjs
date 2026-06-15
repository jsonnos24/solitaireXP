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
