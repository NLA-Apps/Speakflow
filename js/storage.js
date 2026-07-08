/* SpeakFlow — persistence (localStorage) */
window.SF_STORAGE = (function () {
  const KEYS = {
    API_KEY: "sf_api_key",
    TTS_PROXY: "sf_tts_proxy",   // OpenAI TTS proxy (Cloudflare Worker) URL
    SETTINGS: "sf_settings",
    VOCAB: "sf_vocabulary",     // all-time set of words the learner has used
    LEVEL: "sf_level",          // last estimated CEFR level
    DECK: "sf_srs_deck",        // spaced-repetition cards
    SENTENCES: "sf_sentences",  // saved sentences [{text, translation, addedAt}]
    DAILY: "sf_daily",          // per-day stats {"2026-07-04": {words, newWords, level}}
    CHAT: "sf_chat",            // persisted conversation [{role, content}]
    TRANS_CACHE: "sf_trans_cache", // translation cache {en: he}
    AUTOSEND_MIGRATED: "sf_autosend_migrated_v1" // one-time flag, see getSettings()
  };

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
  }

  return {
    getApiKey: () => get(KEYS.API_KEY, ""),
    setApiKey: (k) => set(KEYS.API_KEY, (k || "").trim()),

    getTtsProxy: () => get(KEYS.TTS_PROXY, ""),
    setTtsProxy: (u) => set(KEYS.TTS_PROXY, (u || "").trim().replace(/\/+$/, "")),

    getSettings: () => {
      const settings = { tts: true, rate: 0.9, voice: "", goal: 30, autoSend: true, webSearch: true, ...get(KEYS.SETTINGS, {}) };
      settings.webSearch = true;
      // One-time correction: early builds defaulted autoSend to false and could
      // have persisted that before the fast-send-with-cancel flow existed.
      // Force it on exactly once, then respect whatever the user chooses after.
      if (!localStorage.getItem(KEYS.AUTOSEND_MIGRATED)) {
        settings.autoSend = true;
        set(KEYS.SETTINGS, settings);
        localStorage.setItem(KEYS.AUTOSEND_MIGRATED, "1");
      }
      return settings;
    },
    setSettings: (s) => set(KEYS.SETTINGS, s),

    getVocabulary: () => new Set(get(KEYS.VOCAB, [])),
    setVocabulary: (setOfWords) => set(KEYS.VOCAB, Array.from(setOfWords)),

    getLevel: () => get(KEYS.LEVEL, null),
    setLevel: (lvl) => set(KEYS.LEVEL, lvl),

    getDeck: () => get(KEYS.DECK, []),
    setDeck: (d) => set(KEYS.DECK, d),

    getSentences: () => get(KEYS.SENTENCES, []),
    setSentences: (s) => set(KEYS.SENTENCES, s),

    getDaily: () => get(KEYS.DAILY, {}),
    setDaily: (d) => set(KEYS.DAILY, d),

    getChat: () => get(KEYS.CHAT, []),
    setChat: (c) => set(KEYS.CHAT, c),

    getTransCache: () => get(KEYS.TRANS_CACHE, {}),
    setTransCache: (c) => set(KEYS.TRANS_CACHE, c),

    resetAll: () => {
      Object.values(KEYS).forEach((k) => {
        if (k !== KEYS.API_KEY) localStorage.removeItem(k);
      });
    }
  };
})();
