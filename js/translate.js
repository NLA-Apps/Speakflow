/* SpeakFlow — English→Hebrew translation with local cache.
   Primary (when an API key is set): Claude, for natural/idiomatic quality.
   Fallback (always, and the only path in demo mode): free Google Translate, then MyMemory. */
window.SF_TRANSLATE = (function () {
  const cfg = window.SF_CONFIG;
  const store = window.SF_STORAGE;
  const log = window.SF_LOG;
  let cache = store.getTransCache();

  const HEBREW = /[֐-׿]/;
  // Hebrew diacritics: cantillation marks + nikkud (vowel points) + shin/sin dots.
  // Stripped so translations always render in plain, unvocalized Hebrew.
  const NIKKUD_RE = /[֑-ׇ]/g;

  function stripNikkud(text) {
    return text.replace(NIKKUD_RE, "");
  }

  function normalize(text) {
    return text.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function saveCache() {
    const keys = Object.keys(cache);
    if (keys.length > 600) {
      for (const k of keys.slice(0, keys.length - 600)) delete cache[k];
    }
    store.setTransCache(cache);
  }

  const FETCH_TIMEOUT_MS = 4000; // bound each free-service attempt so a stuck request can't hang forever
  const CLAUDE_TIMEOUT_MS = 8000;

  async function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms || FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Higher-quality, idiom-aware translation via Claude — used whenever an API key is present. */
  async function translateViaClaude(text) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);
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
          max_tokens: 150,
          system: "Translate the given English text into natural, everyday spoken Hebrew — the way a native speaker would actually say it, not a stiff literal translation. Reply with ONLY the Hebrew translation itself: no quotes, no explanation, no English, no nikkud (vowel points).",
          messages: [{ role: "user", content: text }]
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const block = (data.content || []).find((b) => b.type === "text");
      return (block?.text || "").trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async function viaGoogle(text) {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=he&dt=t&q=" +
      encodeURIComponent(text);
    const res = await fetchWithTimeout(url);
    const data = await res.json();
    // response shape: [[["תרגום","source",...],["המשך",...]], ...]
    return (data?.[0] || []).map((seg) => seg?.[0] || "").join("").trim();
  }

  async function viaMyMemory(text) {
    const url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text.slice(0, 480)) +
      "&langpair=en|he";
    const res = await fetchWithTimeout(url);
    const data = await res.json();

    let best = data?.responseData?.translatedText || "";
    if (!HEBREW.test(best)) {
      // MT sometimes echoes English back — look for a Hebrew match instead
      const match = (data?.matches || []).find((m) => HEBREW.test(m.translation || ""));
      best = match ? match.translation : "";
    }
    return best.trim();
  }

  /**
   * Translate English text to Hebrew. Returns a Promise<string>.
   * Result is validated to actually contain Hebrew, stripped of nikkud, and cached locally.
   */
  async function translate(text) {
    const key = normalize(text);
    if (!key) return "";
    if (cache[key]) return stripNikkud(cache[key]);

    let result = "";
    const hasKey = Boolean(store.getApiKey());

    if (hasKey) {
      try {
        result = await translateViaClaude(text);
        log?.info("Translation via Claude", { text });
      } catch (err) {
        log?.warn("Claude translation failed, falling back to free services", { text, error: String(err) });
      }
    }

    if (!HEBREW.test(result)) {
      try {
        result = await viaGoogle(text);
      } catch { /* try fallback */ }
    }

    if (!HEBREW.test(result)) {
      try {
        result = await viaMyMemory(text);
      } catch { /* handled below */ }
    }

    if (!result || !HEBREW.test(result)) {
      log?.error("Translation failed on all services", { text });
      throw makeError("לא הצלחתי לתרגם — בדוק את חיבור האינטרנט ונסה שוב.");
    }

    result = stripNikkud(result);
    cache[key] = result;
    saveCache();
    return result;
  }

  function makeError(msg) {
    const e = new Error(msg);
    e.userMessage = msg;
    return e;
  }

  return { translate };
})();
