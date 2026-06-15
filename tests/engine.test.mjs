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
