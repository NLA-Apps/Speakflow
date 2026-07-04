/* SpeakFlow — speech recognition (STT) + speech synthesis (TTS) */
window.SF_SPEECH = (function () {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(SpeechRecognition);

  let recognition = null;
  let listening = false;
  let callbacks = { onInterim: null, onFinal: null, onStateChange: null, onError: null };

  function init(cb) {
    callbacks = { ...callbacks, ...cb };
    if (!supported) return;

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listening = true;
      callbacks.onStateChange?.(true);
    };

    recognition.onend = () => {
      listening = false;
      callbacks.onStateChange?.(false);
    };

    recognition.onerror = (e) => {
      listening = false;
      callbacks.onStateChange?.(false);
      callbacks.onError?.(e.error);
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) callbacks.onInterim?.(interim.trim());
      if (final.trim()) callbacks.onFinal?.(final.trim());
    };
  }

  function start() {
    if (!recognition || listening) return;
    stopSpeaking(); // don't transcribe the bot's own voice
    try { recognition.start(); } catch { /* already started */ }
  }

  function stop() {
    if (recognition && listening) recognition.stop();
  }

  /* Abort discards the current recognition — no final result is delivered */
  function abort() {
    if (recognition && listening) {
      try { recognition.abort(); } catch { /* noop */ }
    }
  }

  function toggle() {
    listening ? stop() : start();
  }

  /**
   * One-shot recognition with its own instance (used by pronunciation practice)
   * cb: { onResult(text), onEnd(), onError(code), onState(bool) }
   */
  function recognizeOnce(cb) {
    if (!supported) { cb.onError?.("not-supported"); return null; }
    stopSpeaking();
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => cb.onState?.(true);
    rec.onend = () => { cb.onState?.(false); cb.onEnd?.(); };
    rec.onerror = (e) => { cb.onState?.(false); cb.onError?.(e.error); };
    rec.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript || "";
      cb.onResult?.(text.trim());
    };
    try { rec.start(); } catch { /* noop */ }
    return rec;
  }

  // ---------- TTS ----------
  let voices = [];
  let preferredVoiceName = "";

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    document.dispatchEvent(new CustomEvent("sf:voicesChanged"));
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function getEnglishVoices() { return voices; }

  function setPreferredVoice(name) { preferredVoiceName = name || ""; }

  /**
   * Ranks a voice by how natural/human it's likely to sound.
   * "Online (Natural)" (Edge/Windows) and Neural/Wavenet voices are the most
   * human-sounding options browsers expose; non-local (server-rendered) voices
   * also tend to beat the built-in offline ones.
   */
  function voiceQualityScore(v) {
    let score = 0;
    if (/natural|neural|premium|enhanced|wavenet/i.test(v.name)) score += 100;
    if (v.localService === false) score += 40;
    if (v.lang === "en-US") score += 20;
    else if (v.lang.startsWith("en")) score += 10;
    return score;
  }

  function isHighQualityVoice(v) {
    return /natural|neural|premium|enhanced|wavenet/i.test(v.name) || v.localService === false;
  }

  function pickVoice() {
    if (preferredVoiceName) {
      const v = voices.find((v) => v.name === preferredVoiceName);
      if (v) return v;
    }
    if (!voices.length) return null;
    return [...voices].sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0];
  }

  function speak(text, rate, attempt) {
    if (!("speechSynthesis" in window) || !text) return;
    attempt = attempt || 0;

    // Voices often aren't loaded yet on the very first speak() call of a
    // session (they arrive asynchronously) — Chrome can silently drop that
    // first utterance. Wait briefly for the voice list, then retry a few
    // times before giving up (e.g. a machine with no English voice at all).
    if (!voices.length && attempt < 4) {
      let done = false;
      const retry = () => {
        if (done) return;
        done = true;
        document.removeEventListener("sf:voicesChanged", retry);
        speak(text, rate, attempt + 1);
      };
      document.addEventListener("sf:voicesChanged", retry, { once: true });
      setTimeout(retry, 250);
      return;
    }

    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = rate || 0.9;
    u.pitch = 1.0;
    speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  }

  return {
    supported,
    init,
    start,
    stop,
    abort,
    toggle,
    speak,
    stopSpeaking,
    recognizeOnce,
    getEnglishVoices,
    setPreferredVoice,
    isHighQualityVoice,
    isListening: () => listening
  };
})();
