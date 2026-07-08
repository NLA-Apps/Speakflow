/* SpeakFlow — local word statistics + insights panel rendering */
window.SF_INSIGHTS = (function () {
  const cfg = window.SF_CONFIG;
  const store = window.SF_STORAGE;
  const progress = window.SF_PROGRESS;
  const srs = window.SF_SRS;

  // --- session state ---
  let sessionWordCount = 0;
  const sessionUniqueWords = new Set();
  const sessionNewWords = new Set();      // words never used before this session
  let allTimeVocab = store.getVocabulary();

  function tokenize(text) {
    return (text.toLowerCase().match(/[a-z']+/g) || [])
      .map((w) => w.replace(/^'+|'+$/g, ""))
      .filter((w) => w.length > 1);
  }

  /* Update local stats from a user utterance (works in demo mode too) */
  function trackUtterance(text) {
    const words = tokenize(text);
    sessionWordCount += words.length;

    let newCount = 0;
    for (const w of words) {
      sessionUniqueWords.add(w);
      if (!allTimeVocab.has(w)) {
        allTimeVocab.add(w);
        if (!cfg.STOP_WORDS.has(w)) { sessionNewWords.add(w); newCount++; }
      }
    }
    store.setVocabulary(allTimeVocab);
    progress.recordWords(words.length, newCount);
    renderStats();
  }

  // --- DOM rendering ---
  const el = (id) => document.getElementById(id);

  function popValue(node, value) {
    if (node.textContent !== String(value)) {
      node.textContent = value;
      node.classList.remove("pop");
      void node.offsetWidth; // restart animation
      node.classList.add("pop");
    }
  }

  function renderStats() {
    popValue(el("statWords"), sessionWordCount);
    popValue(el("statUnique"), sessionUniqueWords.size);
    popValue(el("statNew"), sessionNewWords.size);
    popValue(el("statTotal"), allTimeVocab.size);
    renderGoal();
    document.dispatchEvent(new CustomEvent("sf:statsChanged"));
  }

  function renderGoal() {
    const goal = store.getSettings().goal || cfg.DEFAULT_GOAL;
    const today = progress.todayWords();
    const pct = Math.min(100, Math.round((today / goal) * 100));

    el("goalRing").style.setProperty("--p", pct);
    el("goalPercent").textContent = pct + "%";
    el("goalText").textContent = today + " / " + goal + " מילים";
    el("goalSub").textContent =
      pct >= 100 ? "כל הכבוד! עמדת ביעד היומי 🎉"
      : pct >= 60 ? "כמעט שם — עוד קצת! 💪"
      : "דבר עוד כדי לשמור על הרצף 🔥";
  }

  function renderLevel(level) {
    if (!level || !cfg.LEVELS.includes(level)) return;
    store.setLevel(level);
    progress.recordLevel(level);

    el("levelValue").textContent = level;
    el("levelHint").textContent = cfg.LEVEL_HINTS_HE[level] || "";

    const idx = cfg.LEVELS.indexOf(level);
    el("levelFill").style.width = ((idx + 1) / cfg.LEVELS.length) * 100 + "%";

    document.querySelectorAll("#levelSteps span").forEach((s) => {
      const sIdx = cfg.LEVELS.indexOf(s.dataset.level);
      s.classList.toggle("active", sIdx <= idx);
      s.classList.toggle("current", sIdx === idx);
    });
  }

  function renderNewWords(words) {
    if (!words || words.length === 0) return;
    const card = el("newWordsCard");
    const list = el("newWordsList");
    card.hidden = false;

    for (const { word, translation_he } of words) {
      // words the model highlights are auto-added to the flashcard deck
      srs.addCard("word", word, translation_he);

      if ([...list.children].some((li) => li.dataset.word === word.toLowerCase())) continue;
      const li = document.createElement("li");
      li.dataset.word = word.toLowerCase();
      li.innerHTML = `<span class="w-en"></span><span class="w-he"></span>`;
      li.querySelector(".w-en").textContent = word;
      li.querySelector(".w-he").textContent = translation_he;
      list.prepend(li);
    }
    while (list.children.length > 8) list.removeChild(list.lastChild);
    document.dispatchEvent(new CustomEvent("sf:deckChanged"));
  }

  function hideFeedbackEmpty() {
    const empty = el("feedbackEmpty");
    if (empty) empty.hidden = true;
  }

  function renderCorrections(corrections) {
    if (!corrections || corrections.length === 0) return;
    hideFeedbackEmpty();
    const card = el("correctionsCard");
    const list = el("correctionsList");
    card.hidden = false;

    for (const { original, corrected, explanation_he } of corrections) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="corr-pair">
          <span class="corr-orig"></span><span class="corr-arrow">→</span><span class="corr-fixed"></span>
        </div>
        <div class="corr-expl"></div>`;
      li.querySelector(".corr-orig").textContent = original;
      li.querySelector(".corr-fixed").textContent = corrected;
      li.querySelector(".corr-expl").textContent = explanation_he;
      list.prepend(li);
    }
    while (list.children.length > 5) list.removeChild(list.lastChild);
  }

  function renderTip(tip) {
    if (!tip) return;
    hideFeedbackEmpty();
    el("tipCard").hidden = false;
    el("tipText").textContent = tip;
  }

  /* Apply a full insights object coming from the model (or demo) */
  function applyInsights(insights) {
    if (!insights) return;
    renderLevel(insights.level);
    renderNewWords(insights.new_words);
    renderCorrections(insights.corrections);
    renderTip(insights.tip_he);
  }

  function restore() {
    renderStats();
    const savedLevel = store.getLevel();
    if (savedLevel) renderLevel(savedLevel);
  }

  return { trackUtterance, applyInsights, restore, renderGoal };
})();
