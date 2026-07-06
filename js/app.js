/* SpeakFlow — main application logic */
(function () {
  const cfg = window.SF_CONFIG;
  const speech = window.SF_SPEECH;
  const api = window.SF_API;
  const insights = window.SF_INSIGHTS;
  const store = window.SF_STORAGE;
  const translate = window.SF_TRANSLATE;
  const srs = window.SF_SRS;
  const progress = window.SF_PROGRESS;
  const log = window.SF_LOG;

  const $ = (id) => document.getElementById(id);

  // Flag iOS home-screen (standalone) launches so CSS can switch to 100vh —
  // the only viewport unit that reaches the true physical bottom there.
  if (window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)) {
    document.documentElement.classList.add("ios-standalone");
  }

  // On mobile, physically move the input-bar (mic/text-input/speaker row)
  // inside #bottomDock, right above the bottom-nav, so it and the nav+footer
  // are ONE real DOM element with one shared background/border — not two
  // separately positioned pieces that only look alike (which could drift
  // apart or leave a seam/gap on some devices). On desktop it moves back to
  // its original spot inside the chat column, in normal flow.
  const inputBarEl = $("inputBar");
  const bottomDockEl = $("bottomDock");
  const chatPanelEl = document.getElementById("view-chat");
  const MOBILE_BREAKPOINT = 900;

  function layoutBottomDock() {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    if (!inputBarEl || !bottomDockEl || !chatPanelEl) return;
    if (isMobile && inputBarEl.parentElement !== bottomDockEl) {
      bottomDockEl.insertBefore(inputBarEl, bottomDockEl.firstChild);
    } else if (!isMobile && inputBarEl.parentElement !== chatPanelEl) {
      chatPanelEl.appendChild(inputBarEl);
    }
  }

  // Measure the dock's real total height (input-bar + nav + footer) so the
  // chat area reserves exactly that much room — a hardcoded guess left a
  // visible gap when the real height didn't match it.
  function syncDockOffset() {
    layoutBottomDock();
    if (bottomDockEl && window.innerWidth <= MOBILE_BREAKPOINT) {
      document.documentElement.style.setProperty("--dock-total-h", bottomDockEl.offsetHeight + "px");
    }
  }
  syncDockOffset();
  window.addEventListener("resize", syncDockOffset);
  window.addEventListener("orientationchange", () => setTimeout(syncDockOffset, 100));
  // iOS standalone launches can report a transient/incorrect viewport size
  // for the first moment after cold-launch from the home-screen icon —
  // re-check shortly after load and when the page becomes visible again.
  window.addEventListener("pageshow", () => setTimeout(syncDockOffset, 300));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(syncDockOffset, 100); });

  const chatMessages = $("chatMessages");
  const micBtn = $("micBtn");
  const textInput = $("textInput");
  const liveTranscript = $("liveTranscript");
  const liveTranscriptText = $("liveTranscriptText");
  const demoBanner = $("demoBanner");

  let settings = store.getSettings();
  let busy = false;

  // ================= Views / navigation =================
  function setView(view) {
    document.body.dataset.view = view;
    document.querySelectorAll("#desktopNav button, #bottomNav button").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view ||
        // on desktop, insights lives next to chat
        (b.dataset.view === "chat" && view === "insights" && window.innerWidth > 900));
    });
    if (view === "practice") renderPracticeHome();
    if (view === "progress") renderProgressView();
  }

  document.querySelectorAll("#desktopNav button, #bottomNav button").forEach((b) => {
    b.addEventListener("click", () => setView(b.dataset.view));
  });

  // ================= Toast =================
  let toastTimer = null;
  function showToast(message, isError) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 4000);
  }

  // ================= Chat rendering =================
  function removeWelcome() {
    $("chatWelcome")?.remove();
  }

  /* Wrap each English word in a tappable span */
  function buildTappableText(container, text) {
    const parts = text.split(/(\s+)/);
    for (const part of parts) {
      const core = part.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, "");
      if (core && /[A-Za-z]/.test(core)) {
        const idx = part.indexOf(core);
        if (idx > 0) container.appendChild(document.createTextNode(part.slice(0, idx)));
        const span = document.createElement("span");
        span.className = "tap-word";
        span.textContent = core;
        container.appendChild(span);
        const rest = part.slice(idx + core.length);
        if (rest) container.appendChild(document.createTextNode(rest));
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  function addMessage(role, text, opts = {}) {
    removeWelcome();

    const row = document.createElement("div");
    row.className = "msg-row " + role;
    // stored on the element (not a DOM attribute) so edit-in-place can update
    // it and every button below automatically reads the current text
    row._text = text;
    row._historyIndex = typeof opts.historyIndex === "number" ? opts.historyIndex : null;

    const bubble = document.createElement("div");
    bubble.className = "msg " + role;
    if (role === "bot") {
      const name = document.createElement("span");
      name.className = "bot-name";
      name.textContent = "SKY";
      bubble.appendChild(name);
    }
    const textWrap = document.createElement("span");
    textWrap.className = "msg-text";
    buildTappableText(textWrap, text);
    bubble.appendChild(textWrap);
    row.appendChild(bubble);

    // action buttons under the bubble
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    if (role === "user") {
      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️ ערוך";
      editBtn.title = "ערוך את ההודעה ושלח מחדש";
      editBtn.addEventListener("click", () => enterEditMode(row, bubble, textWrap));
      actions.appendChild(editBtn);
    }

    const trBtn = document.createElement("button");
    trBtn.textContent = "🌐 תרגם";
    trBtn.title = "תרגם את כל המשפט";
    trBtn.addEventListener("click", () => translateMessage(bubble, row._text, trBtn));

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "🔖 שמור";
    saveBtn.title = "שמור את המשפט ללימוד";
    saveBtn.addEventListener("click", () => saveSentence(row._text, saveBtn));

    const speakBtn = document.createElement("button");
    speakBtn.textContent = "🔊";
    speakBtn.title = "השמע";
    speakBtn.addEventListener("click", () => speech.speak(row._text, settings.rate));

    actions.append(trBtn, saveBtn, speakBtn);
    row.appendChild(actions);

    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return row;
  }

  /* Removes every message row that comes after `row` (used when an earlier
     message is edited — everything that followed it is now stale). */
  function removeMessagesAfter(row) {
    let sibling = row.nextElementSibling;
    while (sibling) {
      const toRemove = sibling;
      sibling = sibling.nextElementSibling;
      toRemove.remove();
    }
  }

  /* Turns a sent user bubble into an inline editor. Saving truncates the
     conversation from that point on and resends the corrected text. */
  function enterEditMode(row, bubble, textWrap) {
    if (busy) { showToast("חכה לתשובה של סקיי לפני עריכה 🙂", true); return; }
    if (bubble.querySelector(".msg-edit-wrap")) return; // already editing

    const original = row._text;
    textWrap.style.display = "none";

    const editWrap = document.createElement("div");
    editWrap.className = "msg-edit-wrap";

    const input = document.createElement("textarea");
    input.className = "msg-edit-input";
    input.dir = "ltr";
    input.value = original;
    input.rows = 2;

    const editActions = document.createElement("div");
    editActions.className = "msg-edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "msg-edit-save";
    saveBtn.textContent = "✓ עדכן ושלח";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "msg-edit-cancel";
    cancelBtn.textContent = "✕ ביטול";

    editActions.append(saveBtn, cancelBtn);
    editWrap.append(input, editActions);
    bubble.appendChild(editWrap);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    function exitEdit() {
      editWrap.remove();
      textWrap.style.display = "";
    }

    cancelBtn.addEventListener("click", exitEdit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); exitEdit(); }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
    });

    saveBtn.addEventListener("click", async () => {
      const newText = input.value.trim();
      if (!newText) { showToast("אי אפשר לשלוח הודעה ריקה", true); return; }
      if (newText === original) { exitEdit(); return; }
      if (busy) return;
      busy = true;

      exitEdit();
      row._text = newText;
      textWrap.innerHTML = "";
      buildTappableText(textWrap, newText);
      removeMessagesAfter(row);

      const typing = addTypingIndicator();
      try {
        const result = await api.editAndResend(row._historyIndex, newText);
        typing.remove();
        addMessage("bot", result.reply);
        insights.applyInsights(result.insights);
        if (settings.tts) speech.speak(result.reply, settings.rate);
        showToast("ההודעה עודכנה ✏️");
      } catch (err) {
        typing.remove();
        showToast(err.userMessage || "משהו השתבש בעדכון ההודעה", true);
      } finally {
        busy = false;
      }
    });
  }

  function addTypingIndicator() {
    removeWelcome();
    const row = document.createElement("div");
    row.className = "msg-row bot";
    row.innerHTML =
      '<div class="msg bot typing">' +
      '<span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
      '<span class="typing-hint"></span>' +
      '</div>';
    chatMessages.appendChild(row);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // reassure the user during a slower-than-usual reply instead of leaving
    // them staring at bare dots with no feedback
    const hintTimer = setTimeout(() => {
      const hint = row.querySelector(".typing-hint");
      if (hint) hint.textContent = "עדיין עובד על זה...";
    }, 4000);

    const originalRemove = row.remove.bind(row);
    row.remove = () => { clearTimeout(hintTimer); originalRemove(); };
    return row;
  }

  // ================= Sentence translation & saving =================
  async function translateMessage(bubble, text, btn) {
    const existing = bubble.querySelector(".msg-translation");
    if (existing) { existing.remove(); btn.classList.remove("done"); return; }

    btn.disabled = true;
    btn.textContent = "...מתרגם";
    try {
      const he = await translate.translate(text);
      const div = document.createElement("div");
      div.className = "msg-translation";
      div.textContent = he;
      bubble.appendChild(div);
      btn.classList.add("done");
    } catch (err) {
      log?.error("Translate message failed", { text, error: err.userMessage || String(err) });
      showToast(err.userMessage || "התרגום נכשל", true);
    } finally {
      btn.disabled = false;
      btn.textContent = "🌐 תרגם";
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  async function saveSentence(text, btn) {
    const sentences = store.getSentences();
    if (sentences.some((s) => s.text === text)) {
      showToast("המשפט כבר שמור 👍");
      return;
    }
    btn.disabled = true;
    let he = "";
    try { he = await translate.translate(text); } catch { /* save without translation */ }

    sentences.push({ text, translation: he, addedAt: Date.now() });
    store.setSentences(sentences);
    srs.addCard("sentence", text, he);
    btn.classList.add("done");
    btn.textContent = "✓ נשמר";
    btn.disabled = false;
    updateDueBadges();
    showToast("המשפט נשמר ללימוד 🔖");
  }

  // ================= Word tooltip (small bubble anchored above the tapped word) =================
  const wordTooltip = $("wordTooltip");
  let tooltipWord = "";
  let tooltipTranslation = "";
  let activeWordSpan = null;

  chatMessages.addEventListener("click", (e) => {
    const span = e.target.closest(".tap-word");
    if (!span) return;
    if (span === activeWordSpan && !wordTooltip.hidden) { closeWordTooltip(); return; }
    openWordTooltip(span.textContent, span);
  });

  chatMessages.addEventListener("scroll", () => closeWordTooltip());

  function positionTooltip(span) {
    const rect = span.getBoundingClientRect();
    const tw = wordTooltip.offsetWidth;
    const th = wordTooltip.offsetHeight;

    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));

    let top = rect.top - th - 10;
    let below = false;
    if (top < 8) { top = rect.bottom + 10; below = true; }

    wordTooltip.style.left = left + "px";
    wordTooltip.style.top = top + "px";
    wordTooltip.classList.toggle("below", below);

    const arrowLeft = rect.left + rect.width / 2 - left;
    wordTooltip.querySelector(".wt-arrow").style.left = Math.max(10, Math.min(arrowLeft, tw - 10)) + "px";
  }

  async function openWordTooltip(word, span) {
    tooltipWord = word;
    tooltipTranslation = "";
    activeWordSpan?.classList.remove("active");
    activeWordSpan = span;
    activeWordSpan.classList.add("active");

    $("wtWord").textContent = word;
    $("wtTrans").textContent = "...מתרגם";
    const saveBtn = $("wtSaveBtn");
    saveBtn.classList.toggle("saved", srs.has(word));
    wordTooltip.hidden = false;
    positionTooltip(span);

    try {
      tooltipTranslation = await translate.translate(word);
      if (tooltipWord === word) {
        $("wtTrans").textContent = tooltipTranslation;
        positionTooltip(span); // bubble width may have changed with the real text
      }
    } catch {
      if (tooltipWord === word) $("wtTrans").textContent = "התרגום לא זמין כרגע";
    }
  }

  function closeWordTooltip() {
    wordTooltip.hidden = true;
    activeWordSpan?.classList.remove("active");
    activeWordSpan = null;
  }

  document.addEventListener("click", (e) => {
    if (wordTooltip.hidden) return;
    if (wordTooltip.contains(e.target) || e.target.closest(".tap-word")) return;
    closeWordTooltip();
  });

  $("wtSpeakBtn").addEventListener("click", () => speech.speak(tooltipWord, settings.rate));

  $("wtSaveBtn").addEventListener("click", () => {
    const added = srs.addCard("word", tooltipWord, tooltipTranslation);
    $("wtSaveBtn").classList.add("saved");
    updateDueBadges();
    log?.info("Word saved from tooltip", { word: tooltipWord });
    showToast(added ? "המילה נוספה לכרטיסיות הלימוד 🔖" : "המילה כבר שמורה 👍");
  });

  // ================= Core chat flow =================
  /* A "cancel send" pill under a just-sent message. Stays visible for as
     long as Sky is thinking — not just a few seconds — so a slow reply can
     always be aborted, not only an instant typo. */
  function addSendCancelBar(row, onCancel) {
    const bar = document.createElement("div");
    bar.className = "send-cancel-bar";
    bar.innerHTML = '<button class="send-cancel-btn">✕ בטל שליחה</button>';
    bar.querySelector(".send-cancel-btn").addEventListener("click", () => {
      onCancel();
      bar.remove();
    });
    row.insertBefore(bar, row.querySelector(".msg-actions"));
    return bar;
  }

  async function handleUserMessage(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;

    const historyIndexForThisMsg = api.getHistory().length;
    const row = addMessage("user", text, { historyIndex: historyIndexForThisMsg });

    const cancelToken = { cancelled: false };
    const cancelBar = addSendCancelBar(row, () => {
      cancelToken.cancelled = true;
      api.cancelPending();
    });

    const typing = addTypingIndicator();
    try {
      const result = await api.sendMessage(text);
      cancelBar.remove();
      typing.remove();

      if (cancelToken.cancelled) {
        // the reply beat the cancel click (e.g. demo mode) — discard it
        api.undoLastExchange();
        row.remove();
        showToast("ההודעה בוטלה — לא נשלח כלום 👍");
        return;
      }

      insights.trackUtterance(text);
      updateStreakBadge();
      addMessage("bot", result.reply);
      insights.applyInsights(result.insights);
      if (settings.tts) speech.speak(result.reply, settings.rate);
    } catch (err) {
      cancelBar.remove();
      typing.remove();
      if (cancelToken.cancelled || err.aborted) {
        row.remove();
        showToast("ההודעה בוטלה — לא נשלח כלום 👍");
      } else {
        showToast(err.userMessage || "משהו השתבש — נסה שוב.", true);
      }
    } finally {
      busy = false;
    }
  }

  // ================= Scenarios =================
  /* Desktop: mouse wheel over the chip row scrolls it sideways, and two
     fade-edge arrow buttons give an explicit, discoverable way to scroll. */
  function initScenarioScroll() {
    const bar = $("scenarioBar");
    bar.addEventListener("wheel", (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      bar.scrollLeft -= e.deltaY; // RTL: scrollLeft decreases toward more content
    }, { passive: false });

    // RTL: the bar's own scrollLeft goes negative as more (later) chips are revealed
    $("scenarioArrowRight").addEventListener("click", () => bar.scrollBy({ left: -220, behavior: "smooth" }));
    $("scenarioArrowLeft").addEventListener("click", () => bar.scrollBy({ left: 220, behavior: "smooth" }));
  }

  function renderScenarioBar() {
    const bar = $("scenarioBar");
    bar.innerHTML = "";
    for (const sc of cfg.SCENARIOS) {
      const chip = document.createElement("button");
      chip.className = "scenario-chip" + (sc.id === api.currentScenarioId() ? " active" : "");
      chip.innerHTML = `<span>${sc.emoji}</span><span>${sc.name_he}</span>`;
      chip.addEventListener("click", () => selectScenario(sc.id));
      bar.appendChild(chip);
    }
  }

  function selectScenario(id) {
    if (id === api.currentScenarioId()) return;
    const sc = api.setScenario(id);
    log?.info("Scenario changed", { id });
    // clear chat area
    chatMessages.innerHTML = "";
    renderScenarioBar();

    if (sc.opener) {
      addMessage("bot", sc.opener);
      if (settings.tts) speech.speak(sc.opener, settings.rate);
      showToast(sc.emoji + " נכנסת לתרחיש: " + sc.name_he);
    } else {
      showToast("💬 שיחה חופשית — דבר על מה שבא לך");
    }
  }

  // ================= Dictation review (cancel before sending) =================
  const dictationReview = $("dictationReview");
  let reviewPendingText = "";

  function showDictationReview(text) {
    reviewPendingText = text;
    $("reviewText").textContent = text;
    dictationReview.hidden = false;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideDictationReview() {
    dictationReview.hidden = true;
    reviewPendingText = "";
  }

  $("reviewSendBtn").addEventListener("click", () => {
    const text = reviewPendingText;
    hideDictationReview();
    handleUserMessage(text);
  });

  $("reviewEditBtn").addEventListener("click", () => {
    textInput.value = reviewPendingText;
    hideDictationReview();
    textInput.focus();
  });

  $("reviewCancelBtn").addEventListener("click", () => {
    hideDictationReview();
    showToast("ההקלטה בוטלה — לא נשלח כלום 👍");
  });

  // cancel while still recording — discards the recognition entirely
  $("cancelDictationBtn").addEventListener("click", () => {
    speech.abort();
    liveTranscript.hidden = true;
    liveTranscriptText.textContent = "";
    showToast("ההקלטה בוטלה 👍");
  });

  // ================= Speech wiring =================
  speech.init({
    onInterim(text) {
      liveTranscript.hidden = false;
      liveTranscriptText.textContent = text;
    },
    onFinal(text) {
      liveTranscript.hidden = true;
      liveTranscriptText.textContent = "";
      if (settings.autoSend) handleUserMessage(text);
      else showDictationReview(text);
    },
    onStateChange(isListening) {
      micBtn.classList.toggle("listening", isListening);
      if (!isListening) liveTranscript.hidden = true;
    },
    onError(code) {
      if (code === "not-allowed" || code === "service-not-allowed") {
        showToast("אין הרשאה למיקרופון — אפשר גישה בהגדרות הדפדפן.", true);
      } else if (code === "no-speech") {
        showToast("לא שמעתי כלום — נסה לדבר קרוב יותר למיקרופון.");
      } else if (code !== "aborted") {
        showToast("שגיאת זיהוי דיבור: " + code, true);
      }
    }
  });

  micBtn.addEventListener("click", () => {
    if (!speech.supported) {
      showToast("זיהוי דיבור לא נתמך בדפדפן הזה — מומלץ Chrome. אפשר להקליד למטה.", true);
      return;
    }
    hideDictationReview(); // a new recording replaces a pending review
    speech.toggle();
  });

  // ================= Text input =================
  function sendFromInput() {
    const text = textInput.value;
    textInput.value = "";
    handleUserMessage(text);
  }
  $("sendBtn").addEventListener("click", sendFromInput);
  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendFromInput();
  });

  document.querySelectorAll(".suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => handleUserMessage(chip.dataset.text));
  });

  // ================= TTS toggle =================
  const speakerBtn = $("speakerBtn");
  function renderSpeakerBtn() {
    speakerBtn.classList.toggle("active", settings.tts);
  }
  speakerBtn.addEventListener("click", () => {
    settings.tts = !settings.tts;
    store.setSettings(settings);
    if (!settings.tts) speech.stopSpeaking();
    renderSpeakerBtn();
    $("ttsToggle").checked = settings.tts;
  });

  // ================= Practice: flashcards =================
  let flashQueue = [];
  let flashIndex = 0;
  let flashDoneCount = 0;

  function updateDueBadges() {
    const due = srs.dueCards().length;
    for (const id of ["dueBadgeDesktop", "dueBadgeMobile"]) {
      const badge = $(id);
      badge.hidden = due === 0;
      badge.textContent = due;
    }
  }

  function renderPracticeHome() {
    $("practiceHome").hidden = false;
    $("flashcardSession").hidden = true;
    $("pronounceSession").hidden = true;

    const total = srs.all().length;
    const due = srs.dueCards().length;
    const meta = $("flashcardsMeta");
    if (total === 0) {
      meta.textContent = "אין כרטיסיות עדיין — שמור מילים מהשיחה!";
      $("startFlashcardsBtn").disabled = true;
    } else if (due === 0) {
      meta.textContent = `כל ה-${total} הכרטיסיות נלמדו להיום 🎉 חזור מחר!`;
      $("startFlashcardsBtn").disabled = true;
    } else {
      meta.textContent = `${due} כרטיסיות ממתינות לך (מתוך ${total})`;
      $("startFlashcardsBtn").disabled = false;
    }

    const sentCount = store.getSentences().length;
    $("pronounceMeta").textContent = sentCount > 0
      ? `כולל ${sentCount} משפטים ששמרת מהשיחות`
      : "משפטים מותאמים לרמה שלך";
  }

  $("startFlashcardsBtn").addEventListener("click", () => {
    flashQueue = srs.dueCards();
    flashIndex = 0;
    flashDoneCount = 0;
    if (!flashQueue.length) return;
    $("practiceHome").hidden = true;
    $("flashcardSession").hidden = false;
    $("flashDone").hidden = true;
    $("flashcard").style.display = "";
    showFlashcard();
  });

  $("flashBackBtn").addEventListener("click", renderPracticeHome);
  $("flashDoneBtn").addEventListener("click", renderPracticeHome);

  function showFlashcard() {
    const card = flashQueue[flashIndex];
    if (!card) { finishFlashcards(); return; }

    $("flashProgress").textContent = (flashIndex + 1) + " / " + flashQueue.length;
    $("flashType").textContent = card.type === "word" ? "מילה" : "משפט";
    $("flashFront").textContent = card.front;
    const back = $("flashBack");
    back.textContent = card.back || "(אין תרגום — לחץ 🔊 והיזכר במשמעות)";
    back.hidden = true;
    $("flipBtn").hidden = false;
    $("ratingRow").hidden = true;

    const p = srs.previewIntervals(card);
    $("goodInterval").textContent = p.good + (p.good === 1 ? " יום" : " ימים");
    $("easyInterval").textContent = p.easy + " ימים";
  }

  $("flipBtn").addEventListener("click", () => {
    $("flashBack").hidden = false;
    $("flipBtn").hidden = true;
    $("ratingRow").hidden = false;
  });

  $("flashSpeakBtn").addEventListener("click", () => {
    const card = flashQueue[flashIndex];
    if (card) speech.speak(card.front, settings.rate);
  });

  document.querySelectorAll(".rate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = flashQueue[flashIndex];
      if (!card) return;
      srs.rate(card.id, btn.dataset.rate);
      flashDoneCount++;
      flashIndex++;
      updateDueBadges();
      if (flashIndex >= flashQueue.length) finishFlashcards();
      else showFlashcard();
    });
  });

  function finishFlashcards() {
    $("flashcard").style.display = "none";
    $("flipBtn").hidden = true;
    $("ratingRow").hidden = true;
    $("flashDone").hidden = false;
    $("flashDoneText").textContent = "עברת על " + flashDoneCount + " כרטיסיות. חלקן יחזרו אליך בדיוק כשתתחיל לשכוח אותן.";
    $("flashProgress").textContent = "";
  }

  // ================= Practice: pronunciation =================
  let pronSentences = [];
  let pronIndex = 0;
  let pronListening = false;

  function buildPronPool() {
    const level = store.getLevel() || "A2";
    const group = ["A1", "A2"].includes(level) ? "easy" : ["B1", "B2"].includes(level) ? "medium" : "hard";
    const saved = store.getSentences().map((s) => s.text);
    const preset = [...cfg.PRON_SENTENCES[group]];
    // saved sentences first, then presets, shuffled lightly
    const pool = [...saved, ...preset.sort(() => Math.random() - 0.5)];
    return pool.slice(0, 10);
  }

  $("startPronounceBtn").addEventListener("click", () => {
    if (!speech.supported) {
      showToast("תרגול הגייה דורש זיהוי דיבור — נסה ב-Chrome או באנדרואיד.", true);
      return;
    }
    pronSentences = buildPronPool();
    pronIndex = 0;
    $("practiceHome").hidden = true;
    $("pronounceSession").hidden = false;
    showPronSentence();
  });

  $("pronBackBtn").addEventListener("click", renderPracticeHome);

  function showPronSentence() {
    if (pronIndex >= pronSentences.length) { renderPracticeHome(); showToast("סיימת את תרגול ההגייה! 🎉"); return; }
    $("pronProgress").textContent = (pronIndex + 1) + " / " + pronSentences.length;
    $("pronSentence").textContent = pronSentences[pronIndex];
    $("pronResult").hidden = true;
    $("pronHint").hidden = false;
    $("pronHint").textContent = "לחץ על המיקרופון וקרא את המשפט";
  }

  $("pronListenBtn").addEventListener("click", () => speech.speak(pronSentences[pronIndex], settings.rate));
  $("pronSkipBtn").addEventListener("click", () => { pronIndex++; showPronSentence(); });
  $("pronNextBtn").addEventListener("click", () => { pronIndex++; showPronSentence(); });
  $("pronRetryBtn").addEventListener("click", () => {
    $("pronResult").hidden = true;
    $("pronHint").hidden = false;
  });

  $("pronMicBtn").addEventListener("click", () => {
    if (pronListening) return;
    speech.recognizeOnce({
      onState(on) {
        pronListening = on;
        $("pronMicBtn").classList.toggle("listening", on);
        if (on) $("pronHint").textContent = "...מקשיב — קרא את המשפט";
      },
      onResult(text) {
        showPronResult(pronSentences[pronIndex], text);
      },
      onError(code) {
        if (code === "no-speech") showToast("לא שמעתי — נסה שוב.", true);
        else if (code === "not-allowed") showToast("אין הרשאה למיקרופון.", true);
      },
      onEnd() {
        $("pronHint").textContent = "לחץ על המיקרופון וקרא את המשפט";
      }
    });
  });

  function pronTokenize(s) {
    return (s.toLowerCase().match(/[a-z']+/g) || []);
  }

  /* Shared word-match scoring used by both pronunciation practice and the
     fill-in-blank game's speak-it-out-loud step. Returns {score, diffHtml}. */
  function scoreSpeech(target, spoken) {
    const targetWords = pronTokenize(target);
    const spokenSet = new Set(pronTokenize(spoken));

    let hits = 0;
    const diffHtml = target.split(/\s+/).map((raw) => {
      const core = raw.toLowerCase().replace(/[^a-z']/g, "");
      const ok = !core || spokenSet.has(core);
      if (core && ok) hits++;
      const span = document.createElement("span");
      span.className = ok ? "hit" : "miss";
      span.textContent = raw;
      return span.outerHTML;
    }).join(" ");

    const denom = targetWords.length || 1;
    const score = Math.round((hits / denom) * 100);
    return { score, diffHtml };
  }

  /* Renders a score + word-diff + optional Claude tip into a given set of
     elements. Shared by pronunciation practice and the fill-in-blank game. */
  function renderSpeechFeedback(target, spoken, els) {
    const { score, diffHtml } = scoreSpeech(target, spoken);

    els.scoreEl.textContent = score + "%";
    els.scoreEl.className = els.scoreEl.className.split(" ")[0] + " " + (score >= 85 ? "great" : score >= 60 ? "ok" : "low");
    els.scoreEl.hidden = false;

    els.diffEl.innerHTML = diffHtml;
    els.diffEl.hidden = false;

    if (score >= 85) showToast("מעולה! 🌟 הגייה ברורה");

    if (els.tipEl) {
      if (api.isDemoMode()) {
        els.tipEl.hidden = true;
      } else {
        els.tipEl.hidden = false;
        els.tipEl.textContent = "💬 מקבל טיפ מסקיי...";
        api.getPronunciationTip(target, spoken, score).then((tip) => {
          if (tip) els.tipEl.textContent = "💬 " + tip;
          else els.tipEl.hidden = true;
        });
      }
    }
    return score;
  }

  function showPronResult(target, spoken) {
    $("pronHint").hidden = true;
    $("pronResult").hidden = false;
    renderSpeechFeedback(target, spoken, {
      scoreEl: $("pronScore"),
      diffEl: $("pronDiff"),
      tipEl: $("pronTip")
    });
  }

  // ================= Vocabulary hub (full-screen overlay) =================
  const vocabOverlay = $("vocabOverlay");

  function renderVocabHub() {
    const wordPoolCount = srs.all().filter((c) => c.type === "word" && c.back).length;
    $("memoryMeta").textContent = wordPoolCount >= 4
      ? `${wordPoolCount} מילים זמינות למשחק`
      : "צריך לפחות 4 מילים שמורות עם תרגום";
    $("startMemoryBtn").disabled = wordPoolCount < 4;

    const fillPoolCount = store.getSentences().map((s) => s.text).filter((t) => t.split(/\s+/).length >= 4).length;
    $("fillMeta").textContent = fillPoolCount >= 1
      ? `${fillPoolCount} משפטים זמינים`
      : "שמור משפט (4+ מילים) מהשיחה כדי לשחק";
    $("startFillBtn").disabled = fillPoolCount < 1;

    renderSavedLists();
  }

  function showVocabHub() {
    $("vocabHub").hidden = false;
    $("memorySession").hidden = true;
    $("fillSession").hidden = true;
    $("vocabBackBtn").hidden = true;
    $("vocabTitle").textContent = "📖 אוצר המילים שלי";
    renderVocabHub();
  }

  function openVocabHub() {
    vocabOverlay.hidden = false;
    showVocabHub();
    log?.info("Vocabulary hub opened");
  }

  function closeVocabOverlay() {
    vocabOverlay.hidden = true;
    setView("chat");
  }

  function showVocabGame(title) {
    $("vocabHub").hidden = true;
    $("vocabBackBtn").hidden = false;
    $("vocabTitle").textContent = title;
  }

  $("vocabBtn").addEventListener("click", openVocabHub);
  $("vocabHomeBtn").addEventListener("click", closeVocabOverlay);
  $("vocabBackBtn").addEventListener("click", showVocabHub);

  // ================= Practice: memory match game =================
  let memoryState = null;

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  $("startMemoryBtn").addEventListener("click", () => {
    const pool = srs.all().filter((c) => c.type === "word" && c.back);
    if (pool.length < 4) return;
    startMemoryRound(pool);
  });

  function startMemoryRound(pool) {
    const roundSize = Math.min(6, pool.length);
    const pairs = shuffleArray([...pool]).slice(0, roundSize);

    memoryState = { pairs, matched: 0, selected: null, locked: false };

    showVocabGame("🧠 משחק הזיכרון");
    $("memorySession").hidden = false;
    $("memoryDone").hidden = true;
    $("memoryBoard").hidden = false;
    renderMemoryBoard();
    log?.info("Memory game started", { pairs: pairs.length });
  }

  function renderMemoryBoard() {
    const board = $("memoryBoard");
    board.innerHTML = "";
    const { pairs } = memoryState;

    const enTiles = shuffleArray(pairs.map((p) => ({ id: p.id, text: p.front, side: "en" })));
    const heTiles = shuffleArray(pairs.map((p) => ({ id: p.id, text: p.back, side: "he" })));

    const enCol = document.createElement("div");
    enCol.className = "memory-col";
    const heCol = document.createElement("div");
    heCol.className = "memory-col";
    for (const t of enTiles) enCol.appendChild(makeMemoryTile(t));
    for (const t of heTiles) heCol.appendChild(makeMemoryTile(t));

    board.append(enCol, heCol);
    $("memoryProgress").textContent = memoryState.matched + " / " + memoryState.pairs.length;
  }

  function makeMemoryTile(t) {
    const btn = document.createElement("button");
    btn.className = "memory-tile";
    btn.textContent = t.text;
    if (t.side === "en") btn.dir = "ltr";
    btn.addEventListener("click", () => onMemoryTileClick(btn, t));
    return btn;
  }

  function onMemoryTileClick(btn, t) {
    if (memoryState.locked || btn.classList.contains("tile-gone")) return;
    const sel = memoryState.selected;

    if (!sel) {
      btn.classList.add("tile-sel");
      memoryState.selected = { btn, id: t.id, side: t.side };
      return;
    }
    if (sel.btn === btn) return;

    if (sel.side === t.side) {
      sel.btn.classList.remove("tile-sel");
      btn.classList.add("tile-sel");
      memoryState.selected = { btn, id: t.id, side: t.side };
      return;
    }

    memoryState.locked = true;
    if (sel.id === t.id) {
      sel.btn.classList.add("tile-correct");
      btn.classList.add("tile-correct");
      setTimeout(() => {
        sel.btn.classList.add("tile-gone");
        btn.classList.add("tile-gone");
        memoryState.selected = null;
        memoryState.locked = false;
        memoryState.matched++;
        $("memoryProgress").textContent = memoryState.matched + " / " + memoryState.pairs.length;
        if (memoryState.matched >= memoryState.pairs.length) finishMemory();
      }, 500);
    } else {
      sel.btn.classList.add("tile-wrong");
      btn.classList.add("tile-wrong");
      setTimeout(() => {
        sel.btn.classList.remove("tile-sel", "tile-wrong");
        btn.classList.remove("tile-wrong");
        memoryState.selected = null;
        memoryState.locked = false;
      }, 600);
    }
  }

  function finishMemory() {
    $("memoryBoard").hidden = true;
    $("memoryDone").hidden = false;
    $("memoryDoneText").textContent = "התאמת את כל " + memoryState.pairs.length + " הזוגות! 🎉";
    log?.info("Memory game completed", { pairs: memoryState.pairs.length });
  }

  $("memoryDoneBtn").addEventListener("click", showVocabHub);

  // ================= Practice: fill-in-the-blank game =================
  let fillState = null;

  function tokenizeForFill(sentence) {
    return sentence.split(/\s+/).map((raw) => ({ raw, clean: raw.toLowerCase().replace(/[^a-z']/g, "") }));
  }

  $("startFillBtn").addEventListener("click", () => {
    const pool = store.getSentences().map((s) => s.text).filter((t) => t.split(/\s+/).length >= 4);
    if (!pool.length) return;
    startFillRound(pool);
  });

  function startFillRound(pool) {
    fillState = { pool: shuffleArray([...pool]), index: 0, correctCount: 0 };
    showVocabGame("📝 השלם את המשפט");
    $("fillSession").hidden = false;
    $("fillDone").hidden = true;
    showFillSentence();
    log?.info("Fill-in-blank game started", { sentences: pool.length });
  }

  function showFillSentence() {
    if (fillState.index >= fillState.pool.length) { finishFill(); return; }
    const sentence = fillState.pool[fillState.index];
    $("fillProgress").textContent = (fillState.index + 1) + " / " + fillState.pool.length;
    $("fillResult").hidden = true;
    $("fillSpeakSection").hidden = true;
    $("fillContinueBtn").hidden = true;
    $("fillPronScore").hidden = true;
    $("fillPronDiff").hidden = true;
    $("fillPronTip").hidden = true;

    fillState.fullSentence = sentence;
    const tokens = tokenizeForFill(sentence);
    const eligible = tokens.map((t, i) => ({ ...t, i })).filter((t) => t.clean.length >= 3);
    const blankCount = Math.min(3, Math.max(1, Math.floor(eligible.length * 0.35)));
    const blankIdxs = new Set(shuffleArray([...eligible]).slice(0, blankCount).map((t) => t.i));

    const others = fillState.pool.filter((_, i) => i !== fillState.index);
    const distractorPool = [];
    for (const s of others) {
      for (const w of tokenizeForFill(s)) if (w.clean.length >= 3) distractorPool.push(w.clean);
    }
    const blankWords = [...blankIdxs].map((i) => tokens[i].clean);
    const uniqueDistractors = [...new Set(distractorPool)].filter((w) => !blankWords.includes(w));
    shuffleArray(uniqueDistractors);
    const bankWords = shuffleArray([...blankWords, ...uniqueDistractors.slice(0, 3)]);

    fillState.tokens = tokens;
    fillState.blankIdxs = blankIdxs;
    fillState.filled = {};

    renderFillSentence();
    renderFillBank(bankWords);
  }

  function renderFillSentence() {
    const { tokens, blankIdxs, filled } = fillState;
    const container = $("fillSentence");
    container.innerHTML = "";
    tokens.forEach((t, i) => {
      if (blankIdxs.has(i)) {
        const slot = document.createElement("button");
        slot.className = "fill-blank" + (filled[i] ? " filled" : "");
        slot.textContent = filled[i] ? filled[i].word : "____";
        slot.addEventListener("click", () => onBlankClick(i));
        container.appendChild(slot);
      } else {
        container.appendChild(document.createTextNode(t.raw));
      }
      container.appendChild(document.createTextNode(" "));
    });
  }

  function renderFillBank(bankWords) {
    const bank = $("fillBank");
    bank.innerHTML = "";
    bankWords.forEach((w, key) => {
      const tile = document.createElement("button");
      tile.className = "fill-tile";
      tile.textContent = w;
      tile.addEventListener("click", () => onBankTileClick(tile, w, key));
      bank.appendChild(tile);
      tile.dataset.key = key;
    });
  }

  function onBankTileClick(tile, word, key) {
    if (tile.disabled) return;
    const nextIdx = [...fillState.blankIdxs].sort((a, b) => a - b).find((i) => !fillState.filled[i]);
    if (nextIdx === undefined) return;
    fillState.filled[nextIdx] = { word, key };
    tile.disabled = true;
    tile.classList.add("used");
    renderFillSentence();

    const allFilled = [...fillState.blankIdxs].every((i) => fillState.filled[i]);
    if (allFilled) checkFillAnswer();
  }

  function onBlankClick(idx) {
    const entry = fillState.filled[idx];
    if (!entry) return;
    delete fillState.filled[idx];
    const tile = $("fillBank").querySelector('[data-key="' + entry.key + '"]');
    if (tile) { tile.disabled = false; tile.classList.remove("used"); }
    renderFillSentence();
  }

  function checkFillAnswer() {
    const { tokens, blankIdxs, filled } = fillState;
    const orderedIdxs = [...blankIdxs].sort((a, b) => a - b);
    let allCorrect = true;
    for (const i of orderedIdxs) {
      if (filled[i].word !== tokens[i].clean) allCorrect = false;
    }

    // blanks render in index order, so pair them up by position to tag correctness
    const container = $("fillSentence");
    [...container.querySelectorAll(".fill-blank")].forEach((slot, order) => {
      const i = orderedIdxs[order];
      const correct = filled[i].word === tokens[i].clean;
      slot.classList.add(correct ? "box-right" : "box-wrong");
      if (!correct) slot.textContent = tokens[i].clean; // reveal the right word immediately
    });

    const resultEl = $("fillResult");
    resultEl.hidden = false;
    resultEl.textContent = allCorrect ? "✓ מעולה! נכון לגמרי" : "✗ לא בדיוק — הנה התשובה הנכונה";
    resultEl.className = "fill-result " + (allCorrect ? "ok" : "bad");

    if (allCorrect) fillState.correctCount++;

    // let the learner speak the completed sentence and get a pronunciation
    // score before moving on, instead of auto-advancing on a timer
    $("fillSpeakSection").hidden = false;
    $("fillContinueBtn").hidden = false;
  }

  let fillMicListening = false;

  $("fillListenBtn").addEventListener("click", () => {
    if (fillState?.fullSentence) speech.speak(fillState.fullSentence, settings.rate);
  });

  $("fillMicBtn").addEventListener("click", () => {
    if (fillMicListening || !fillState) return;
    speech.recognizeOnce({
      onState(on) {
        fillMicListening = on;
        $("fillMicBtn").classList.toggle("listening", on);
      },
      onResult(text) {
        renderSpeechFeedback(fillState.fullSentence, text, {
          scoreEl: $("fillPronScore"),
          diffEl: $("fillPronDiff"),
          tipEl: $("fillPronTip")
        });
      },
      onError(code) {
        if (code === "no-speech") showToast("לא שמעתי — נסה שוב.", true);
        else if (code === "not-allowed") showToast("אין הרשאה למיקרופון.", true);
      },
      onEnd() {}
    });
  });

  $("fillContinueBtn").addEventListener("click", () => {
    fillState.index++;
    showFillSentence();
  });

  function finishFill() {
    $("fillDone").hidden = false;
    $("fillDoneText").textContent = "ענית נכון על " + fillState.correctCount + " מתוך " + fillState.pool.length + " משפטים.";
    log?.info("Fill-in-blank game completed", { correct: fillState.correctCount, total: fillState.pool.length });
  }

  $("fillDoneBtn").addEventListener("click", showVocabHub);

  // ================= Progress view =================
  function renderProgressView() {
    const goal = settings.goal || cfg.DEFAULT_GOAL;
    const s = progress.streak(goal);
    const t = progress.totals();

    $("streakBig").textContent = "🔥 " + s;
    $("streakSub").textContent = s > 0 ? "המשך כך!" : "עמוד ביעד היומי כדי להתחיל רצף";
    $("bestDay").textContent = t.bestDay;
    $("activeDays").textContent = t.activeDays;

    progress.renderChart($("chartWrap"), goal);
    renderAchievements();
  }

  function renderAchievements() {
    const grid = $("achievementsGrid");
    if (!grid) return;
    const goal = settings.goal || cfg.DEFAULT_GOAL;
    const stats = {
      streak: progress.streak(goal),
      vocab: store.getVocabulary().size,
      savedWords: srs.all().filter((c) => c.type === "word").length,
      sentences: store.getSentences().length,
      level: store.getLevel()
    };
    grid.innerHTML = "";
    for (const a of cfg.ACHIEVEMENTS) {
      const unlocked = a.need(stats);
      const el = document.createElement("div");
      el.className = "achievement-badge " + (unlocked ? "unlocked" : "locked");
      el.title = a.name_he;
      el.innerHTML = `<span class="ach-emoji">${a.emoji}</span><span class="ach-name">${a.name_he}</span>`;
      grid.appendChild(el);
    }
  }

  function renderSavedLists() {
    // words (from the SRS deck)
    const words = srs.all().filter((c) => c.type === "word");
    const wl = $("savedWordsList");
    wl.innerHTML = "";
    $("savedWordsCount").textContent = words.length;
    $("savedWordsEmpty").hidden = words.length > 0;
    for (const c of [...words].reverse().slice(0, 50)) {
      const li = document.createElement("li");
      li.innerHTML = `<span class="w-en"></span><span class="w-he"></span><button class="w-del" title="מחק">✕</button>`;
      li.querySelector(".w-en").textContent = c.front;
      li.querySelector(".w-he").textContent = c.back;
      li.querySelector(".w-del").addEventListener("click", () => {
        srs.remove(c.id);
        updateDueBadges();
        renderVocabHub();
      });
      wl.appendChild(li);
    }

    // sentences
    const sentences = store.getSentences();
    const sl = $("savedSentencesList");
    sl.innerHTML = "";
    $("savedSentencesCount").textContent = sentences.length;
    $("savedSentencesEmpty").hidden = sentences.length > 0;
    for (const s of [...sentences].reverse().slice(0, 30)) {
      const li = document.createElement("li");
      li.innerHTML = `<div class="s-body"><span class="s-en"></span><span class="s-he"></span></div><button class="w-del" title="מחק">✕</button>`;
      li.querySelector(".s-en").textContent = s.text;
      li.querySelector(".s-he").textContent = s.translation || "";
      li.querySelector(".w-del").addEventListener("click", () => {
        store.setSentences(store.getSentences().filter((x) => x.text !== s.text));
        const card = srs.all().find((c) => c.type === "sentence" && c.front === s.text);
        if (card) srs.remove(card.id);
        updateDueBadges();
        renderVocabHub();
      });
      sl.appendChild(li);
    }
  }

  // ================= Streak badge =================
  function updateStreakBadge() {
    $("streakValue").textContent = progress.streak(settings.goal || cfg.DEFAULT_GOAL);
  }

  // ================= Settings =================
  const modal = $("settingsModal");

  function populateVoices() {
    const select = $("voiceSelect");
    select.innerHTML = '<option value="">אוטומטי (מומלץ)</option>';

    // Premium OpenAI voices first (when a proxy is configured) — far more natural.
    if (speech.hasOpenAITts()) {
      const group = document.createElement("optgroup");
      group.label = "⭐ קולות פרימיום (OpenAI)";
      speech.getOpenAIVoices().forEach((v) => {
        const opt = document.createElement("option");
        opt.value = "openai:" + v.id;
        opt.textContent = `⭐ ${v.id} — ${v.he}`;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }

    const females = speech.getVoiceOptions("female", 5);
    const males = speech.getVoiceOptions("male", 5);
    const addOptions = (list, heLabel) => {
      list.forEach((voice, i) => {
        const opt = document.createElement("option");
        opt.value = voice.name;
        // gender label + running number + the voice's own name to tell them apart
        opt.textContent = `🎙️ ${heLabel} ${i + 1} — ${voice.name}`;
        select.appendChild(opt);
      });
    };
    addOptions(females, "קול נשי (מכשיר)");
    addOptions(males, "קול גברי (מכשיר)");
    select.value = settings.voice || "";

    const total = females.length + males.length;
    $("voiceCountHint").textContent = speech.hasOpenAITts()
      ? `קולות הפרימיום של OpenAI זמינים למעלה ⭐. בחר אחד ולחץ 🔊 בדיקת קול כדי לשמוע.`
      : (total >= 2
        ? `${females.length} קולות נשיים ו-${males.length} קולות גבריים (של המכשיר). לקולות טבעיים ומקצועיים יותר — הגדר פרוקסי OpenAI למטה.`
        : `⚠️ המכשיר שלך חושף מעט מאוד קולות. לקולות איכותיים באמת — הגדר פרוקסי OpenAI למטה.`);
  }
  document.addEventListener("sf:voicesChanged", populateVoices);

  document.addEventListener("sf:ttsError", (e) => {
    showToast("שגיאת קול פרימיום: " + (e.detail || "נסה שוב"), true);
    log?.error("OpenAI TTS failed", { detail: e.detail });
  });

  // Live pixel measurements for diagnosing device-specific display bugs
  // (e.g. the persistent bottom gap on some iPhones) — a screenshot of this
  // gives exact numbers instead of a verbal description of "there's a gap".
  function renderScreenDiagnostics() {
    const el = $("screenDiagHint");
    if (!el) return;
    const nav = $("bottomNav");
    const dock = $("bottomDock");
    const dockRect = dock ? dock.getBoundingClientRect() : null;
    const probe = $("safeAreaProbe");
    const safeBottom = probe ? getComputedStyle(probe).paddingBottom : "n/a";
    const lines = [
      `window.innerHeight: ${window.innerHeight}`,
      `visualViewport.height: ${window.visualViewport ? Math.round(window.visualViewport.height) : "n/a"}`,
      `document.documentElement.clientHeight: ${document.documentElement.clientHeight}`,
      `body computed height: ${getComputedStyle(document.body).height}`,
      `body getBoundingClientRect: top=${Math.round(document.body.getBoundingClientRect().top)} bottom=${Math.round(document.body.getBoundingClientRect().bottom)}`,
      `safe-area-inset-bottom: ${safeBottom}`,
      `bottom-nav display: ${nav ? getComputedStyle(nav).display : "n/a"}`,
      `input-bar parent: ${inputBarEl && inputBarEl.parentElement ? inputBarEl.parentElement.id || inputBarEl.parentElement.className : "n/a"}`,
      `bottom-dock rect: top=${dockRect ? Math.round(dockRect.top) : "n/a"} bottom=${dockRect ? Math.round(dockRect.bottom) : "n/a"}`,
      `GAP (innerHeight - dock.bottom): ${dockRect ? Math.round(window.innerHeight - dockRect.bottom) : "n/a"}`,
      `devicePixelRatio: ${window.devicePixelRatio}`,
      `standalone: ${window.navigator.standalone}`,
      `userAgent: ${navigator.userAgent}`
    ];
    el.textContent = lines.join("\n");
  }

  function openSettings() {
    $("apiKeyInput").value = store.getApiKey();
    $("ttsProxyInput").value = store.getTtsProxy();
    $("ttsToggle").checked = settings.tts;
    $("autoSendToggle").checked = Boolean(settings.autoSend);
    $("rateInput").value = settings.rate;
    $("rateValue").textContent = settings.rate;
    $("goalInput").value = settings.goal || cfg.DEFAULT_GOAL;
    populateVoices();
    renderLogFolderStatus();
    renderScreenDiagnostics();
    modal.hidden = false;
  }
  function closeSettings() { modal.hidden = true; }

  $("settingsBtn").addEventListener("click", openSettings);
  $("demoBannerSettings").addEventListener("click", openSettings);
  $("closeSettingsBtn").addEventListener("click", closeSettings);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeSettings(); });

  $("rateInput").addEventListener("input", (e) => {
    $("rateValue").textContent = e.target.value;
  });

  $("testVoiceBtn").addEventListener("click", () => {
    // apply the currently-typed proxy so premium voices can be previewed before saving
    speech.setTtsProxy($("ttsProxyInput").value);
    speech.setPreferredVoice($("voiceSelect").value);
    speech.speak("Hi! This is how I sound. Let's practice English together!", parseFloat($("rateInput").value));
  });

  // Re-render the voice list when a proxy URL is typed/pasted, so the premium
  // OpenAI voices appear immediately without needing to save + reopen first.
  $("ttsProxyInput").addEventListener("input", () => {
    speech.setTtsProxy($("ttsProxyInput").value);
    const keep = $("voiceSelect").value;
    populateVoices();
    $("voiceSelect").value = keep;
  });

  $("saveSettingsBtn").addEventListener("click", () => {
    const hadKey = !api.isDemoMode();
    store.setApiKey($("apiKeyInput").value);
    store.setTtsProxy($("ttsProxyInput").value);
    speech.setTtsProxy(store.getTtsProxy());
    settings.tts = $("ttsToggle").checked;
    settings.autoSend = $("autoSendToggle").checked;
    settings.rate = parseFloat($("rateInput").value);
    settings.goal = Math.max(10, parseInt($("goalInput").value, 10) || cfg.DEFAULT_GOAL);
    settings.voice = $("voiceSelect").value;
    store.setSettings(settings);
    speech.setPreferredVoice(settings.voice);

    renderSpeakerBtn();
    renderDemoBanner();
    insights.renderGoal();
    updateStreakBadge();
    closeSettings();

    if (!hadKey && !api.isDemoMode()) showToast("מחובר! 🎉 מעכשיו Sky עונה באמת.");
    else showToast("ההגדרות נשמרו.");
  });

  $("resetBtn").addEventListener("click", () => {
    if (!confirm("לאפס את כל הנתונים? אוצר מילים, כרטיסיות, היסטוריה והתקדמות יימחקו (מפתח ה-API יישמר).")) return;
    log?.info("User reset all data");
    store.resetAll();
    api.resetConversation();
    location.reload();
  });

  $("downloadLogBtn").addEventListener("click", () => {
    log?.download();
    showToast("קובץ הלוג ירד לתיקיית ההורדות 📋");
  });

  function renderLogFolderStatus() {
    const el = $("logFolderStatus");
    if (log?.isFolderConnected()) {
      el.textContent = `✓ מחובר לתיקייה "${log.folderName()}" — הקובץ ${FILE_NAME_HINT} מתעדכן שם אוטומטית.`;
    } else if (!log?.fsAccessSupported) {
      el.textContent = "הדפדפן הזה לא תומך בשמירה אוטומטית לתיקייה (נסה Chrome/Edge) — השתמש בהורדה הידנית.";
    } else {
      el.textContent = "מתעד כל פעולה ושגיאה באפליקציה. חבר תיקייה (למשל תיקיית הפרויקט) כדי שהקובץ יתעדכן שם אוטומטית — כך אפשר לקרוא אותו ישירות מהדיסק.";
    }
  }
  const FILE_NAME_HINT = "speakflow-log.txt";

  $("connectLogFolderBtn").addEventListener("click", async () => {
    try {
      const name = await log.connectLogFolder();
      renderLogFolderStatus();
      showToast(`מחובר לתיקייה "${name}" ✓ — הלוג יתעדכן שם אוטומטית`);
    } catch (err) {
      showToast(err.message || "החיבור לתיקייה נכשל", true);
    }
  });

  // ================= Mobile preview simulator (desktop) =================
  const phoneSim = $("phoneSim");
  const phoneSimFrame = $("phoneSimFrame");

  $("mobileSimBtn").addEventListener("click", () => {
    phoneSimFrame.src = location.href.split("#")[0];
    phoneSim.hidden = false;
  });

  function closePhoneSim() {
    phoneSim.hidden = true;
    phoneSimFrame.src = "about:blank"; // stop the inner app (audio, timers)
  }
  $("phoneSimClose").addEventListener("click", closePhoneSim);
  phoneSim.addEventListener("click", (e) => {
    if (e.target === phoneSim) closePhoneSim();
  });

  // ================= Demo banner =================
  function renderDemoBanner() {
    demoBanner.hidden = !api.isDemoMode();
  }

  // ================= Restore previous chat =================
  function restoreChat() {
    const saved = api.getHistory();
    if (!saved.length) return;
    saved.forEach((m, i) => {
      if (m.role === "user") addMessage("user", m.content, { historyIndex: i });
      else addMessage("bot", m.content);
    });
  }

  // ================= Global shortcuts =================
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!wordTooltip.hidden) closeWordTooltip();
    else if (!dictationReview.hidden) hideDictationReview();
    else if (!modal.hidden) closeSettings();
    else if (!phoneSim.hidden) closePhoneSim();
    else if (!vocabOverlay.hidden) {
      if ($("vocabBackBtn").hidden) closeVocabOverlay();
      else showVocabHub();
    }
  });

  // ================= Init =================
  speech.setTtsProxy(store.getTtsProxy());
  speech.setPreferredVoice(settings.voice);
  renderDemoBanner();
  renderSpeakerBtn();
  renderScenarioBar();
  initScenarioScroll();
  insights.restore();
  restoreChat();
  updateDueBadges();
  updateStreakBadge();
  document.addEventListener("sf:deckChanged", updateDueBadges);
  setView("chat");

  // small hook for automated testing (simulates a finished dictation)
  window.__sfTest = { showDictationReview };
})();
