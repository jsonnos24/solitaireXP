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

  function clampScore(s) { return s < 0 ? 0 : s; }

  function drawStock(state) {
    if (state.stock.length === 0) {
      // Recycle: move waste back to stock, face-down.
      while (state.waste.length) {
        const c = state.waste.pop();
        c.faceUp = false;
        state.stock.push(c);
      }
      state.recycles += 1;
      const penalty = state.drawCount === 1 ? 100 : 20;
      if (state.recycles > 3) state.score = clampScore(state.score - penalty);
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
    if (dst.pile === 'foundation') return 10;
    if (dst.pile === 'tableau' && src.pile === 'waste') return 5;
    if (dst.pile === 'tableau' && src.pile === 'foundation') return -15;
    return 0;
  }

  // Mutates and returns state on success; returns null if the move is illegal.
  function moveCards(state, src, dst) {
    const moving = peekSource(state, src);
    if (!isLegalMove(state, moving, dst)) return null;

    if (src.pile === 'waste') state.waste.pop();
    else if (src.pile === 'foundation') state.foundations[src.index].pop();
    else if (src.pile === 'tableau') state.tableau[src.index].splice(src.cardIndex);

    if (dst.pile === 'tableau') state.tableau[dst.index].push(...moving);
    else if (dst.pile === 'foundation') state.foundations[dst.index].push(moving[0]);

    let delta = scoreForMove(src, dst);

    if (src.pile === 'tableau') {
      const col = state.tableau[src.index];
      const top = col[col.length - 1];
      if (top && !top.faceUp) { top.faceUp = true; delta += 5; }
    }

    state.score = clampScore(state.score + delta);
    return state;
  }

  // Tries to send the top card of the given source to any legal foundation.
  // Returns true if a move happened.
  function autoToFoundation(state, src) {
    // Normalize tableau source: if cardIndex is undefined, target only the top card
    if (src.pile === 'tableau' && src.cardIndex === undefined) {
      const col = state.tableau[src.index];
      src = { ...src, cardIndex: col.length - 1 };
    }

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

  const Solitaire = { SUITS, isRed, makeDeck, makeRng, shuffle, deal, canStackTableau, canStackFoundation, isValidSequence, moveCards, drawStock, autoToFoundation, isWon, canAutoComplete, autoCompleteStep };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Solitaire };
  } else {
    root.Solitaire = Solitaire;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
