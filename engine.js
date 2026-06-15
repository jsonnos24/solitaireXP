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
        card.faceUp = row === col;
        tableau[col].push(card);
      }
    }
    const stock = deck.slice(idx);
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

  function canStackTableau(moving, ontoTop) {
    if (!ontoTop) return moving.rank === 13;
    return ontoTop.rank === moving.rank + 1 &&
           isRed(ontoTop.suit) !== isRed(moving.suit);
  }

  function canStackFoundation(moving, foundationPile) {
    const top = foundationPile[foundationPile.length - 1];
    if (!top) return moving.rank === 1;
    return top.suit === moving.suit && moving.rank === top.rank + 1;
  }

  function isValidSequence(cards) {
    for (let i = 0; i < cards.length; i++) {
      if (!cards[i].faceUp) return false;
      if (i > 0 && !canStackTableau(cards[i], cards[i - 1])) return false;
    }
    return true;
  }

  const Solitaire = { SUITS, isRed, makeDeck, makeRng, shuffle, deal, canStackTableau, canStackFoundation, isValidSequence };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Solitaire };
  } else {
    root.Solitaire = Solitaire;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
