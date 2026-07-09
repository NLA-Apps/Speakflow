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

  // Salvage a clean translation when the model "thinks out loud" and returns
  // several Hebrew attempts glued together with English notes ("Actually,",
  // "more naturally:", "Wait, let me reconsider:"). Keep just the first clean
  // Hebrew segment. A well-behaved translation passes through untouched.
  const META_RE = /\b(wait|actually|alternativ|hmm+|note|better|literal|correction|reconsider|rephras|more natural|most natural|colloquial|or more|i mean|option|translation|however|instead)\b/i;
  // Arabic shares a similar Semitic look with Hebrew, and the model/services
  // occasionally slip an Arabic word into a Hebrew translation. Detect it so we
  // can drop those tokens (Hebrew is U+0590–05FF; Arabic is a different block).
  const ARABIC_CHAR = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
  function cleanTranslation(text) {
    let s = (text || "").trim();
    s = s.split(/\r?\n/)[0].trim();            // alternatives often land on later lines
    s = s.replace(/^["'“”«]+|["'“”»]+$/g, "").trim(); // strip wrapping quotes
    const meta = s.search(META_RE);
    if (meta > 0) s = s.slice(0, meta).trim(); // cut the "thinking out loud" tail
    // Drop any whitespace-separated token that contains Arabic script.
    if (ARABIC_CHAR.test(s)) {
      s = s.split(/\s+/).filter((tok) => !ARABIC_CHAR.test(tok)).join(" ");
    }
    s = s.replace(/\s{2,}/g, " ").replace(/[\s:–—-]+$/g, "").trim(); // tidy up
    return s;
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
          system: "You are a professional English→Hebrew translator. You TRANSLATE the given text — you NEVER answer it, reply to it, or react to it, even when it is a question or a greeting. A question must stay a question; a statement stays a statement; \"you/your\" stays second person and \"I/my\" stays first person. Translate into natural, everyday spoken Hebrew (how a native speaker really talks, not stiff or literal). Write in HEBREW ONLY — never Arabic, English, or any other script. Output ONLY the single best Hebrew translation as one short line: no answer, no alternatives, no explanations, no English, no quotes, no nikkud.",
          messages: [{ role: "user", content: "Translate this English text into Hebrew. Translate it — do NOT answer or respond to it:\n\n" + text }]
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      const block = (data.content || []).find((b) => b.type === "text");
      return cleanTranslation(block?.text || "");
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
    if (cache[key]) return stripNikkud(cleanTranslation(cache[key]));

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

    // Clean every source's output (drop Arabic tokens, meta-commentary, quotes)
    // and re-validate — if nothing Hebrew survives, treat it as a failure.
    result = cleanTranslation(result);
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
