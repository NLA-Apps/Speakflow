/* SpeakFlow — Claude API client + demo mode fallback + scenario support */
window.SF_API = (function () {
  const cfg = window.SF_CONFIG;
  const store = window.SF_STORAGE;
  const log = window.SF_LOG;

  /* Conversation history: [{role: "user"|"assistant", content: string}] */
  let history = store.getChat();
  let scenarioId = "free";
  let currentAbortController = null;

  function isDemoMode() {
    return !store.getApiKey();
  }

  function getHistory() { return [...history]; }

  function currentScenario() {
    return cfg.SCENARIOS.find((s) => s.id === scenarioId) || cfg.SCENARIOS[0];
  }

  /**
   * Switch scenario; clears the conversation. Picks one opener at random so
   * re-entering the same scenario doesn't always say the exact same line.
   * Returns the scenario object with `opener` resolved to that single string.
   */
  function setScenario(id) {
    scenarioId = id;
    history = [];
    demoIndex = 0;
    const sc = currentScenario();
    const openers = sc.openers || [];
    const opener = openers.length ? openers[Math.floor(Math.random() * openers.length)] : "";
    if (opener) {
      history.push({ role: "assistant", content: opener });
    }
    persist();
    return { ...sc, opener };
  }

  function persist() {
    store.setChat(history.slice(-cfg.MAX_HISTORY_TURNS));
  }

  /**
   * Send a user message. Returns {reply, insights, demo}.
   * Throws Error with a Hebrew-friendly .userMessage on failure (or .aborted === true
   * if the caller cancelled the in-flight request via cancelPending()).
   */
  async function sendMessage(userText) {
    history.push({ role: "user", content: userText });
    log?.info("User message sent", { text: userText, scenario: scenarioId, demo: isDemoMode() });

    let result;
    try {
      result = isDemoMode() ? demoReply(userText) : await claudeReply();
    } catch (err) {
      history.pop(); // don't poison history with an unanswered turn
      persist();
      if (!err.aborted) log?.error("sendMessage failed", { error: err.userMessage || String(err) });
      throw err;
    }

    history.push({ role: "assistant", content: result.reply });
    while (history.length > cfg.MAX_HISTORY_TURNS) history.shift();
    persist();
    log?.info("Bot reply received", { reply: result.reply, level: result.insights?.level });

    return result;
  }

  /**
   * Truncate history to before `historyIndex` (discarding the old message and
   * everything that followed it), then send the corrected text as a fresh turn.
   * Used to "edit & resend" a previously sent user message.
   */
  function editAndResend(historyIndex, newText) {
    if (typeof historyIndex === "number" && historyIndex >= 0 && historyIndex <= history.length) {
      history = history.slice(0, historyIndex);
    }
    return sendMessage(newText);
  }

  /** Aborts the in-flight real API request, if any. No-op in demo mode / when idle. */
  function cancelPending() {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
  }

  /**
   * Removes the most recent user+assistant exchange from history.
   * Used when a message is cancelled *after* it already completed
   * (e.g. an instant demo-mode reply beat the cancel click).
   */
  function undoLastExchange() {
    if (history.length && history[history.length - 1].role === "assistant") history.pop();
    if (history.length && history[history.length - 1].role === "user") history.pop();
    persist();
  }

  // ---------- Real Claude call ----------
  async function claudeReply() {
    const controller = new AbortController();
    currentAbortController = controller;

    let response;
    try {
      response = await fetch(cfg.API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": store.getApiKey(),
          "anthropic-version": cfg.API_VERSION,
          // required opt-in for calling the API directly from a browser
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: cfg.MODEL,
          max_tokens: cfg.MAX_TOKENS,
          system: [
            {
              type: "text",
              text: cfg.SYSTEM_PROMPT + currentScenario().prompt,
              cache_control: { type: "ephemeral" }
            }
          ],
          messages: history,
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 3 }
          ],
          output_config: {
            format: { type: "json_schema", schema: cfg.OUTPUT_SCHEMA }
          }
        })
      });
    } catch (err) {
      if (err.name === "AbortError") throw abortedError();
      throw apiError("בעיית רשת — בדוק את חיבור האינטרנט ונסה שוב.");
    } finally {
      currentAbortController = null;
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = body?.error?.message || "";
      if (response.status === 401) throw apiError("מפתח ה-API לא תקין. בדוק אותו בהגדרות.");
      if (response.status === 429) throw apiError("יותר מדי בקשות — חכה רגע ונסה שוב.");
      if (response.status === 529) throw apiError("השרת עמוס כרגע — נסה שוב בעוד רגע.");
      throw apiError("שגיאה מהשרת (" + response.status + "): " + msg);
    }

    const data = await response.json();

    if (data.stop_reason === "refusal") {
      throw apiError("הבקשה נדחתה על ידי מסנני הבטיחות — נסה לנסח אחרת.");
    }

    // pick the LAST text block, not the first — when web_search runs first,
    // the final structured reply is the text block that comes after it
    const textBlocks = (data.content || []).filter((b) => b.type === "text");
    const textBlock = textBlocks[textBlocks.length - 1];
    if (!textBlock) {
      log?.error("Empty response from Claude", {
        stop_reason: data.stop_reason,
        block_types: (data.content || []).map((b) => b.type)
      });
      if (data.stop_reason === "max_tokens") {
        throw apiError("תוצאות החיפוש היו ארוכות מדי והתשובה נקטעה — נסה שוב או נסח את השאלה קצר יותר.");
      }
      throw apiError("התקבלה תשובה ריקה — נסה שוב.");
    }

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      // structured output should guarantee JSON; fall back gracefully
      return { reply: textBlock.text, insights: null, demo: false };
    }

    return { reply: parsed.reply, insights: parsed.insights, demo: false };
  }

  function apiError(hebrewMessage) {
    const e = new Error(hebrewMessage);
    e.userMessage = hebrewMessage;
    return e;
  }

  function abortedError() {
    const e = new Error("aborted");
    e.aborted = true;
    e.userMessage = "";
    return e;
  }

  // ---------- Demo mode ----------
  const demoScript = [
    "Nice to meet you! I'm Sky. What did you do today?",
    "That sounds interesting! Tell me more about it.",
    "I love hearing about that. What's your favorite part?",
    "Great! By the way, you're doing really well. What do you like to do on weekends?",
    "Cool! Do you prefer spending time with friends or relaxing alone?",
    "That makes sense. If you could travel anywhere tomorrow, where would you go?",
    "Wonderful choice! What would you do there first?"
  ];
  let demoIndex = 0;

  function demoReply(userText) {
    const wordCount = (userText.match(/[a-zA-Z']+/g) || []).length;

    // playful level estimation just for the demo
    const level =
      wordCount >= 14 ? "B1" :
      wordCount >= 7 ? "A2" : "A1";

    const reply = demoScript[Math.min(demoIndex, demoScript.length - 1)];
    demoIndex++;

    return {
      reply,
      insights: {
        level,
        corrections: [],
        new_words: [],
        tip_he: demoIndex === 2
          ? "זהו מצב דמו — התובנות האמיתיות (תיקונים, מילים חדשות והערכת רמה מדויקת) יופיעו אחרי חיבור מפתח API."
          : ""
      },
      demo: true
    };
  }

  function resetConversation() {
    history = [];
    demoIndex = 0;
    persist();
  }

  /**
   * Short, encouraging Hebrew tip on a pronunciation-practice attempt.
   * Returns "" in demo mode, on failure, or if there's nothing worth saying —
   * this is a nice-to-have and must never block the practice flow.
   */
  async function getPronunciationTip(target, spoken, score) {
    if (isDemoMode()) return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(cfg.API_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": store.getApiKey(),
          "anthropic-version": cfg.API_VERSION,
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: cfg.MODEL,
          max_tokens: 100,
          system: "You are Sky, an encouraging English pronunciation coach for a Hebrew-speaking learner. You'll be given the sentence they were supposed to say and what speech recognition heard. In ONE short, warm sentence in HEBREW (under 25 words), give a specific tip: if they nailed it, briefly celebrate; if something was off, name exactly which word to fix and how to say it correctly. Hebrew only, no English.",
          messages: [{ role: "user", content: `Target: "${target}"\nRecognized: "${spoken}"\nScore: ${score}%` }]
        })
      });
      if (!res.ok) return "";
      const data = await res.json();
      const block = (data.content || []).find((b) => b.type === "text");
      return (block?.text || "").trim();
    } catch (err) {
      log?.warn("Pronunciation tip failed", { error: String(err) });
      return "";
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    sendMessage,
    editAndResend,
    cancelPending,
    undoLastExchange,
    isDemoMode,
    resetConversation,
    setScenario,
    getHistory,
    getPronunciationTip,
    currentScenarioId: () => scenarioId
  };
})();
