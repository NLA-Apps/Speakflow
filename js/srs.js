/* SpeakFlow — spaced-repetition deck (simplified SM-2) */
window.SF_SRS = (function () {
  const store = window.SF_STORAGE;
  let deck = store.getDeck();

  const DAY = 24 * 60 * 60 * 1000;

  function save() { store.setDeck(deck); }

  function normalizeFront(text) {
    return text.trim().toLowerCase();
  }

  function has(front) {
    const n = normalizeFront(front);
    return deck.some((c) => normalizeFront(c.front) === n);
  }

  /**
   * Add a card. type: 'word' | 'sentence'.
   * Returns true if added, false if it already exists.
   */
  function addCard(type, front, back) {
    if (!front || has(front)) return false;
    deck.push({
      id: "c" + Date.now() + Math.random().toString(36).slice(2, 7),
      type,
      front: front.trim(),
      back: (back || "").trim(),
      due: Date.now(),       // new cards are due immediately
      interval: 0,           // days
      ease: 2.5,
      reps: 0,
      addedAt: Date.now()
    });
    save();
    return true;
  }

  function remove(id) {
    deck = deck.filter((c) => c.id !== id);
    save();
  }

  function all() { return [...deck]; }

  function dueCards() {
    const now = Date.now();
    return deck
      .filter((c) => c.due <= now)
      .sort((a, b) => a.due - b.due);
  }

  /** Preview of the next interval (in days) for the rating buttons */
  function previewIntervals(card) {
    const good = card.interval === 0 ? 1 : Math.round(card.interval * card.ease);
    const easy = card.interval === 0 ? 3 : Math.round(card.interval * card.ease * 1.3);
    return { good, easy };
  }

  /** rating: 'again' | 'hard' | 'good' | 'easy' */
  function rate(id, rating) {
    const card = deck.find((c) => c.id === id);
    if (!card) return;

    card.reps++;
    switch (rating) {
      case "again":
        card.interval = 0;
        card.ease = Math.max(1.3, card.ease - 0.2);
        card.due = Date.now() + 10 * 60 * 1000; // 10 minutes
        break;
      case "hard":
        card.interval = Math.max(1, Math.round(card.interval * 1.2)) || 1;
        card.ease = Math.max(1.3, card.ease - 0.15);
        card.due = Date.now() + card.interval * DAY;
        break;
      case "good":
        card.interval = card.interval === 0 ? 1 : Math.round(card.interval * card.ease);
        card.due = Date.now() + card.interval * DAY;
        break;
      case "easy":
        card.interval = card.interval === 0 ? 3 : Math.round(card.interval * card.ease * 1.3);
        card.ease = Math.min(3.2, card.ease + 0.1);
        card.due = Date.now() + card.interval * DAY;
        break;
    }
    save();
  }

  function updateBack(id, back) {
    const card = deck.find((c) => c.id === id);
    if (card) { card.back = back; save(); }
  }

  return { addCard, remove, all, dueCards, rate, previewIntervals, has, updateBack };
})();
