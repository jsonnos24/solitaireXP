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
