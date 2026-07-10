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

  /** Remove markdown/emphasis so it isn't shown in the bubble or read aloud
   *  literally by TTS. Sky is told to write plain text; this is the safety net. */
  function stripMarkdown(text) {
    if (!text) return text;
    return text
      .replace(/\*\*([^*]+)\*\*/g, "$1")   // **bold**
      .replace(/__([^_]+)__/g, "$1")       // __bold__
      .replace(/\*([^*]+)\*/g, "$1")       // *italic*
      .replace(/`([^`]+)`/g, "$1")         // `code`
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")  // # headings
      .replace(/^\s*[-*+]\s+/gm, "")       // "- " / "* " bullet lists
      .replace(/[*_`]/g, "")               // any leftover emphasis chars
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  /**
   * Send a user message. Returns {reply, insights, demo}.
   * Throws Error with a Hebrew-friendly .userMessage on failure (or .aborted === true
   * if the caller cancelled the in-flight request via cancelPending()).
   */
  async function sendMessage(userText, onDelta) {
    history.push({ role: "user", content: userText });
    log?.info("User message sent", { text: userText, scenario: scenarioId, demo: isDemoMode() });

    let result;
    try {
      result = isDemoMode() ? demoReply(userText) : await claudeReply(onDelta);
    } catch (err) {
      history.pop(); // don't poison history with an unanswered turn
      persist();
      if (!err.aborted) log?.error("sendMessage failed", { error: err.userMessage || String(err) });
      throw err;
    }

    // Sky should reply in plain text, but strip any markdown it slips in so the
    // symbols aren't shown in the bubble or spoken aloud by TTS ("asterisk").
    result.reply = stripMarkdown(result.reply);

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

  /**
   * Pull the (possibly still-growing) value of the JSON "reply" field out of a
   * partial streamed JSON string, so we can show Sky's words as they arrive.
   * Returns "" until the key appears; stops cleanly at the end of the buffer
   * even if the closing quote hasn't streamed in yet.
   */
  function extractReply(jsonPartial) {
    const m = jsonPartial.match(/"reply"\s*:\s*"/);
    if (!m) return "";
    let i = m.index + m[0].length;
    let out = "";
    while (i < jsonPartial.length) {
      const ch = jsonPartial[i];
      if (ch === "\\") {
        const next = jsonPartial[i + 1];
        if (next === undefined) break; // incomplete escape at buffer edge
        if (next === "n") out += "\n";
        else if (next === "t") out += "\t";
        else if (next === "r") out += "\r";
        else if (next === "u") {
          const hex = jsonPartial.slice(i + 2, i + 6);
          if (hex.length < 4) break;
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6; continue;
        } else out += next; // ", \, /, etc.
        i += 2; continue;
      }
      if (ch === '"') break; // closing quote → reply string is complete
      out += ch;
      i++;
    }
    return out;
  }

  // ---------- Real Claude call (streamed) ----------
  async function claudeReply(onDelta) {
    const controller = new AbortController();
    currentAbortController = controller;
    const useSearch = true;
    const currentDate = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const freshnessPrompt = `\n\nCURRENT DATE: ${currentDate}.\nFreshness rule: You have web_search available on every real API reply. For sports, fixtures, scores, standings, "last game", "last match", current/recent/latest/today/yesterday/tomorrow questions, prices, news, and any public fact that may have changed, you MUST use web_search before answering. Never answer those from memory or training data. If search results conflict with old memory, trust the search results and the current date.`;

    const requestBody = {
      model: cfg.MODEL,
      max_tokens: useSearch ? cfg.MAX_TOKENS : 1024,
      stream: true,
      system: [
        {
          type: "text",
          text: cfg.SYSTEM_PROMPT + freshnessPrompt + currentScenario().prompt,
          cache_control: { type: "ephemeral" }
        }
      ],
      messages: history,
      output_config: {
        format: { type: "json_schema", schema: cfg.OUTPUT_SCHEMA }
      }
    };
    // Always give Sky web search so answers can stay current for news,
    // sports, prices, dates, and anything else that may have changed.
    if (useSearch) {
      requestBody.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }];
    }

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
        body: JSON.stringify(requestBody)
      });
    } catch (err) {
      currentAbortController = null;
      if (err.name === "AbortError") throw abortedError();
      throw apiError("בעיית רשת — בדוק את חיבור האינטרנט ונסה שוב.");
    }

    if (!response.ok) {
      currentAbortController = null;
      const body = await response.json().catch(() => ({}));
      const msg = body?.error?.message || "";
      if (response.status === 401) throw apiError("מפתח ה-API לא תקין. בדוק אותו בהגדרות.");
      if (response.status === 429) throw apiError("יותר מדי בקשות — חכה רגע ונסה שוב.");
      if (response.status === 529) throw apiError("השרת עמוס כרגע — נסה שוב בעוד רגע.");
      throw apiError("שגיאה מהשרת (" + response.status + "): " + msg);
    }

    // ---- parse the SSE stream ----
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";     // accumulated JSON text across text_delta events
    let stopReason = null;
    let lastEmitted = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          let evt;
          try { evt = JSON.parse(payload); } catch { continue; }
          if (evt.type === "content_block_delta" && evt.delta && evt.delta.type === "text_delta") {
            fullText += evt.delta.text;
            if (onDelta) {
              const partial = extractReply(fullText);
              if (partial && partial !== lastEmitted) { lastEmitted = partial; onDelta(partial); }
            }
          } else if (evt.type === "message_delta" && evt.delta && evt.delta.stop_reason) {
            stopReason = evt.delta.stop_reason;
          }
        }
      }
    } catch (err) {
      currentAbortController = null;
      if (err.name === "AbortError") throw abortedError();
      throw apiError("בעיית רשת בזמן קבלת התשובה — נסה שוב.");
    }
    currentAbortController = null;

    if (stopReason === "refusal") {
      throw apiError("הבקשה נדחתה על ידי מסנני הבטיחות — נסה לנסח אחרת.");
    }
    if (!fullText.trim()) {
      log?.error("Empty streamed response from Claude", { stop_reason: stopReason });
      if (stopReason === "max_tokens") {
        throw apiError("התשובה נקטעה — נסה שוב או נסח את השאלה קצר יותר.");
      }
      throw apiError("התקבלה תשובה ריקה — נסה שוב.");
    }

    let parsed;
    try {
      parsed = JSON.parse(fullText);
    } catch {
      // structured output should guarantee JSON; fall back to the extracted reply
      return { reply: extractReply(fullText) || fullText, insights: null, demo: false };
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

  function sanitizeSuggestions(items) {
    const seen = new Set();
    return (items || [])
      .map((item) => String(item || "").trim())
      .map((item) => item.replace(/^\s*(?:\d+[\).\s-]+|[-*]\s+)/, "").replace(/^["']|["']$/g, "").trim())
      .filter((item) => item && /[A-Za-z]/.test(item) && item.length <= 120)
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
  }

  function fallbackReplySuggestions() {
    const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content || "";
    const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";

    if (!lastAssistant && !lastUser) {
      return [
        "Hi Sky! How are you today?",
        "I want to talk about my day.",
        "Can you ask me an easy question?"
      ];
    }

    if (/\?/.test(lastAssistant)) {
      return [
        "I think my answer is yes, but I need a moment to explain.",
        "For me, it depends on the situation.",
        "Can you give me an example first?"
      ];
    }

    return [
      "That makes sense. I want to add one more thing.",
      "I agree, but I'm not sure how to explain it.",
      "Can you tell me more about that?"
    ];
  }

  async function generateReplySuggestions() {
    if (isDemoMode()) return fallbackReplySuggestions();

    const recent = history.slice(-8);
    if (!recent.length) return fallbackReplySuggestions();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const transcript = recent
        .map((m) => `${m.role === "assistant" ? "Sky" : "Learner"}: ${m.content}`)
        .join("\n");
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
          max_tokens: 220,
          system: "You help a Hebrew-speaking English learner keep a live conversation going. Based on the transcript, generate exactly 3 natural English replies the learner could say next. They must fit Sky's latest message and current topic. Keep each reply short, spoken, A1-B1 friendly, and useful when the learner is stuck. Return only valid JSON: an array of 3 strings. No Hebrew, no explanations.",
          messages: [{ role: "user", content: transcript }]
        })
      });
      if (!res.ok) return fallbackReplySuggestions();
      const data = await res.json();
      const block = (data.content || []).find((b) => b.type === "text");
      const raw = (block?.text || "").trim();
      let parsed = [];
      try {
        const json = raw.match(/\[[\s\S]*\]/)?.[0] || raw;
        parsed = JSON.parse(json);
      } catch {
        parsed = raw.split(/\n+/);
      }
      const suggestions = sanitizeSuggestions(parsed);
      return suggestions.length === 3 ? suggestions : sanitizeSuggestions([...suggestions, ...fallbackReplySuggestions()]);
    } catch (err) {
      log?.warn("Reply suggestions failed", { error: String(err) });
      return fallbackReplySuggestions();
    } finally {
      clearTimeout(timer);
    }
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
          : "",
        score: 90 + Math.min(9, wordCount) // playful demo score
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
    generateReplySuggestions,
    getPronunciationTip,
    currentScenarioId: () => scenarioId
  };
})();
