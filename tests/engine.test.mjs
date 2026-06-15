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
