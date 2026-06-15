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

  // Smart auto-move for double/right-click: send the clicked card (and any valid
  // run below it) to the best legal spot — foundation first, then a tableau build
  // onto a non-empty column. Empty columns are skipped to avoid surprising moves.
  // Returns true if a move happened.
  function autoPlace(state, src) {
    if (src.pile === 'tableau' && src.cardIndex === undefined) {
      const col = state.tableau[src.index];
      src = { ...src, cardIndex: col.length - 1 };
    }

    const moving = peekSource(state, src);
    if (moving.length === 0) return false;
    if (src.pile === 'tableau' && !isValidSequence(moving)) return false;

    // 1) Foundation — only a single card can go to a foundation.
    if (moving.length === 1) {
      for (let i = 0; i < 4; i++) {
        if (canStackFoundation(moving[0], state.foundations[i])) {
          return moveCards(state, src, { pile: 'foundation', index: i }) !== null;
        }
      }
    }

    // 2) Tableau build onto a non-empty column whose top card accepts the run.
    for (let i = 0; i < 7; i++) {
      if (src.pile === 'tableau' && i === src.index) continue; // don't move onto itself
      const col = state.tableau[i];
      if (col.length === 0) continue;
      if (canStackTableau(moving[0], col[col.length - 1])) {
        return moveCards(state, src, { pile: 'tableau', index: i }) !== null;
      }
    }
    return false;
  }

  // Right-clicking empty space auto-advances: play the best available move.
  // Foundations first (waste top, then tableau tops), then a tableau build —
  // the waste top, then the longest movable run of each column — onto a matching
  // non-empty column (e.g. a red 8-run onto a black 9). Returns true if moved.
  function autoAdvance(state) {
    if (state.waste.length && autoToFoundation(state, { pile: 'waste' })) return true;
    for (let i = 0; i < 7; i++) {
      if (state.tableau[i].length && autoToFoundation(state, { pile: 'tableau', index: i })) return true;
    }
    if (state.waste.length && autoPlace(state, { pile: 'waste' })) return true;
    for (let i = 0; i < 7; i++) {
      const col = state.tableau[i];
      if (!col.length) continue;
      let k = col.length - 1; // walk down to the start of the longest movable run
      while (k > 0 && col[k - 1].faceUp && canStackTableau(col[k], col[k - 1])) k--;
      if (autoPlace(state, { pile: 'tableau', index: i, cardIndex: k })) return true;
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

  // ---------- Solver (used to generate guaranteed-winnable deals) ----------
  // Soundness over completeness: if isWinnable returns true a real winning line
  // exists. It may give up (return false) on hard/over-budget deals — that's fine,
  // the caller just reshuffles and tries another deal.

  function foundationRank(state, suit) {
    for (const f of state.foundations) {
      if (f.length && f[0].suit === suit) return f[f.length - 1].rank;
    }
    return 0;
  }

  // A card is safe to force onto a foundation when it can never be needed to
  // receive a lower card of the opposite color (classic Microsoft autoplay rule).
  function isSafeToFoundation(state, card) {
    if (card.rank <= 2) return true;
    const opp = isRed(card.suit) ? ['S', 'C'] : ['H', 'D'];
    const oppMin = Math.min(foundationRank(state, opp[0]), foundationRank(state, opp[1]));
    return oppMin >= card.rank - 1;
  }

  // Deterministically play all currently-safe cards to the foundations.
  // Play all currently-safe cards to the foundations, recording each as a
  // replayable descriptor in `log` (used by solve() to return a full move list).
  function forcedAutoplayLog(state, log) {
    let changed = true;
    while (changed) {
      changed = false;
      if (state.waste.length) {
        const c = state.waste[state.waste.length - 1];
        if (isSafeToFoundation(state, c) && autoToFoundation(state, { pile: 'waste' })) { log.push({ t: 'wf' }); changed = true; continue; }
      }
      for (let i = 0; i < 7; i++) {
        const col = state.tableau[i];
        if (!col.length) continue;
        const c = col[col.length - 1];
        if (c.faceUp && isSafeToFoundation(state, c) && autoToFoundation(state, { pile: 'tableau', index: i })) {
          log.push({ t: 'tf', i }); changed = true; break;
        }
      }
    }
  }
  function forcedAutoplay(state) { forcedAutoplayLog(state, []); }

  // Canonical key for the transposition table. Tableau columns are sorted so that
  // column permutations collapse to one state.
  function canonicalKey(state) {
    const cols = state.tableau
      .map(col => col.map(c => (c.faceUp ? '+' : '-') + c.rank + c.suit).join(','))
      .sort().join('|');
    const f = state.foundations
      .map(p => (p.length ? p[0].suit + p[p.length - 1].rank : '_')).sort().join(',');
    const stock = state.stock.map(c => c.rank + c.suit).join(',');
    const waste = state.waste.map(c => c.rank + c.suit).join(',');
    return cols + '#' + f + '#' + stock + '#' + waste + '#' + state.drawCount;
  }

  // Generate successors as { c: childState, desc: replayableMove }, ordered
  // best-first (lower priority = tried first). The child has the explicit move
  // applied but NOT the subsequent safe autoplay (the caller does that).
  // Descriptor forms: {t:'wf'} {t:'tf',i} {t:'wt',j} {t:'tt',i,ci,j} {t:'draw'}.
  function genMovesDesc(state) {
    const out = [];
    const add = (c, desc, priority) => { if (c) out.push({ c, desc, priority }); };

    // Non-safe foundation moves (safe ones are already auto-played): waste + tableau tops.
    if (state.waste.length) {
      const c = cloneState(state);
      if (autoToFoundation(c, { pile: 'waste' })) add(c, { t: 'wf' }, 1);
    }
    for (let i = 0; i < 7; i++) {
      if (!state.tableau[i].length) continue;
      const c = cloneState(state);
      if (autoToFoundation(c, { pile: 'tableau', index: i })) add(c, { t: 'tf', i }, 1);
    }

    // Waste top → tableau build.
    if (state.waste.length) {
      const wc = state.waste[state.waste.length - 1];
      for (let j = 0; j < 7; j++) {
        const dcol = state.tableau[j];
        const dtop = dcol.length ? dcol[dcol.length - 1] : null;
        if (!canStackTableau(wc, dtop)) continue;
        const c = cloneState(state);
        if (moveCards(c, { pile: 'waste' }, { pile: 'tableau', index: j }) !== null) add(c, { t: 'wt', j }, 2);
      }
    }

    // Tableau run → tableau (any face-up suffix onto a matching column).
    for (let i = 0; i < 7; i++) {
      const col = state.tableau[i];
      let f = col.length;
      for (let x = 0; x < col.length; x++) { if (col[x].faceUp) { f = x; break; } }
      for (let s = f; s < col.length; s++) {
        const card = col[s];
        const flips = s > 0 && !col[s - 1].faceUp;
        for (let j = 0; j < 7; j++) {
          if (j === i) continue;
          const dcol = state.tableau[j];
          const dtop = dcol.length ? dcol[dcol.length - 1] : null;
          if (!canStackTableau(card, dtop)) continue;
          if (dcol.length === 0 && s === f && f === 0) continue; // relocating a whole column to empty = useless
          const c = cloneState(state);
          if (moveCards(c, { pile: 'tableau', index: i, cardIndex: s }, { pile: 'tableau', index: j }) !== null) {
            add(c, { t: 'tt', i, ci: s, j }, flips ? 0 : 2);
          }
        }
      }
    }

    // Draw / recycle (lowest priority).
    if (state.stock.length > 0) {
      const c = cloneState(state); drawStock(c); add(c, { t: 'draw' }, 3);
    } else if (state.waste.length > 0) {
      const c = cloneState(state); drawStock(c); add(c, { t: 'draw' }, 4);
    }

    out.sort((a, b) => a.priority - b.priority);
    return out;
  }

  function genMoves(state) { return genMovesDesc(state).map(o => o.c); }

  // Resumable iterative depth-first search with a transposition table and a node
  // budget. `step(slice)` advances up to `slice` node expansions and returns
  // 'win' | 'fail' | 'pending', so a caller can spread a search across many
  // animation/timeout slices without blocking the UI thread.
  function makeSolver(initial, maxNodes = 200000) {
    let nodes = 0;
    let finished = false, won = false;
    const visited = new Set();
    const root = cloneState(initial);
    forcedAutoplay(root);
    let stack = null;
    if (isWon(root)) { finished = true; won = true; }
    else { visited.add(canonicalKey(root)); stack = [{ moves: genMoves(root), i: 0 }]; }
    return {
      step(slice = 8000) {
        if (finished) return won ? 'win' : 'fail';
        let used = 0;
        while (stack.length) {
          if (++nodes > maxNodes) { finished = true; return 'fail'; }
          if (++used > slice) return 'pending';
          const top = stack[stack.length - 1];
          if (top.i >= top.moves.length) { stack.pop(); continue; }
          const next = top.moves[top.i++];
          forcedAutoplay(next);
          if (isWon(next)) { finished = true; won = true; return 'win'; }
          const key = canonicalKey(next);
          if (visited.has(key)) continue;
          visited.add(key);
          stack.push({ moves: genMoves(next), i: 0 });
        }
        finished = true;
        return 'fail';
      },
    };
  }

  // Synchronous convenience wrapper: true if a winning line exists within budget.
  function isWinnable(initial, maxNodes = 200000) {
    const solver = makeSolver(initial, maxNodes);
    let r;
    do { r = solver.step(Infinity); } while (r === 'pending');
    return r === 'win';
  }

  // Find a winning move sequence from `initial`, or null if none within budget.
  // The result is an array of replayable descriptors (see genMovesDesc) that can
  // be applied with applyMove() in order to reach a completed game. Used by the
  // UI's Hint and Auto-solve. Operates on the CURRENT position, so it returns
  // null when the player has already played into a dead end.
  function solve(initial, maxNodes = 600000) {
    let nodes = 0;
    const visited = new Set();
    const root = cloneState(initial);
    const rootLog = [];
    forcedAutoplayLog(root, rootLog);
    if (isWon(root)) return rootLog;
    visited.add(canonicalKey(root));
    const stack = [{ gen: genMovesDesc(root), i: 0, path: rootLog }];
    while (stack.length) {
      if (++nodes > maxNodes) return null;
      const top = stack[stack.length - 1];
      if (top.i >= top.gen.length) { stack.pop(); continue; }
      const mv = top.gen[top.i++];
      const child = mv.c;                 // explicit move already applied
      const log = [mv.desc];
      forcedAutoplayLog(child, log);      // record the safe autoplays that follow
      const path = top.path.concat(log);
      if (isWon(child)) return path;
      const key = canonicalKey(child);
      if (visited.has(key)) continue;
      visited.add(key);
      stack.push({ gen: genMovesDesc(child), i: 0, path });
    }
    return null;
  }

  // Apply a single solver descriptor to a live state using public operations.
  // Returns the state (mutated) or null if the move was not legal.
  function applyMove(state, d) {
    if (d.t === 'draw') return drawStock(state);
    if (d.t === 'wf') return autoToFoundation(state, { pile: 'waste' }) ? state : null;
    if (d.t === 'tf') return autoToFoundation(state, { pile: 'tableau', index: d.i }) ? state : null;
    if (d.t === 'wt') return moveCards(state, { pile: 'waste' }, { pile: 'tableau', index: d.j });
    if (d.t === 'tt') return moveCards(state, { pile: 'tableau', index: d.i, cardIndex: d.ci }, { pile: 'tableau', index: d.j });
    return null;
  }

  const Solitaire = { SUITS, isRed, makeDeck, makeRng, shuffle, deal, canStackTableau, canStackFoundation, isValidSequence, moveCards, drawStock, autoToFoundation, autoPlace, autoAdvance, isWon, canAutoComplete, autoCompleteStep, cloneState, timeBonus, isWinnable, makeSolver, solve, applyMove };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Solitaire };
  } else {
    root.Solitaire = Solitaire;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
