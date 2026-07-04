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
    primeAudio(); // cancel() above can re-lock iOS's speech engine — re-prime it now, in this same tap
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
    primeAudio(); // cancel() above can re-lock iOS's speech engine — re-prime it now, in this same tap
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
  // A device set to a non-English system language (e.g. Hebrew) localizes
  // SpeechSynthesisVoice.name for display ("Daniel" -> "דניאל"), which breaks
  // any English-name regex entirely. voiceURI is the internal identifier and
  // typically keeps the original English name even when .name is localized
  // (e.g. "com.apple.voice.compact.en-GB.Daniel") — match against both.
  function voiceIdString(v) {
    return `${v.name || ""} ${v.voiceURI || ""}`;
  }

  function voiceQualityScore(v) {
    let score = 0;
    if (/natural|neural|premium|enhanced|wavenet/i.test(voiceIdString(v))) score += 100;
    if (v.localService === false) score += 40;
    if (v.lang === "en-US") score += 20;
    else if (v.lang.startsWith("en")) score += 10;
    return score;
  }

  function isHighQualityVoice(v) {
    return /natural|neural|premium|enhanced|wavenet/i.test(voiceIdString(v)) || v.localService === false;
  }

  // Web Speech API exposes no gender field — infer it from common voice given
  // names so we can offer exactly one female and one male option instead of
  // a long, technical, confusing list of every voice on the device.
  const FEMALE_NAMES = /samantha|zira|aria\b|\bava\b|emma|jenny|salli|joanna|kendra|kimberly|\bivy\b|susan|allison|nicole|\bamy\b|victoria|karen|tessa|moira|fiona|serena|\bsara\b|\bzoe\b|catherine|linda|heather|michelle|olivia|sonia|shelley|hazel|libby|\bmia\b|natasha|elizabeth|\bfemale\b/i;
  const MALE_NAMES = /\bdavid\b|\bguy\b|\bmark\b|\balex\b|daniel|\bryan\b|christopher|\beric\b|justin|kevin|matthew|brian|andrew|\btom\b|george|oliver|william|\bjames\b|aaron|gordon|arthur|\beddy\b|\bmale\b/i;

  // Legacy/novelty system voices (Fred, Albert, Zarvox, etc.) are notoriously
  // robotic — never offer them even if their name happens to match a gender.
  const BAD_VOICES = /\bfred\b|\balbert\b|\bjunior\b|\bralph\b|\bbahh\b|\bbells\b|\bboing\b|\bbubbles\b|\bcellos\b|\bderanged\b|\bgood news\b|\bbad news\b|\bhysterical\b|\bpipe organ\b|\btrinoids\b|\bwhisper\b|\bzarvox\b|\borgan\b|\bsuperstar\b|\btrillian\b|\bkathy\b|\bprincess\b|\bagnes\b|\bbruce\b/i;

  function isBadVoice(v) {
    return BAD_VOICES.test(voiceIdString(v));
  }

  function voiceGender(v) {
    const id = voiceIdString(v);
    if (FEMALE_NAMES.test(id)) return "female";
    if (MALE_NAMES.test(id)) return "male";
    return null;
  }

  // Among a device's default ("compact") voices — the only ones on a device
  // that hasn't downloaded an Enhanced/Premium voice pack — quality varies a
  // lot and ties in voiceQualityScore fall back to unpredictable OS
  // enumeration order. Break ties toward younger/fresher-sounding voices
  // over older-sounding, more formal ones (Daniel/Karen read as older).
  const MALE_QUALITY_PRIORITY = ["aaron", "tom", "guy", "alex", "daniel", "arthur", "gordon"];
  const FEMALE_QUALITY_PRIORITY = ["ava", "zoe", "aria", "nicky", "amy", "ivy", "samantha", "emma", "jenny", "karen", "moira", "victoria", "tessa", "fiona"];
  function priorityBonus(v, list) {
    const id = voiceIdString(v).toLowerCase();
    const i = list.findIndex((n) => id.includes(n));
    return i === -1 ? 0 : (list.length - i);
  }
  function malePriorityBonus(v) { return priorityBonus(v, MALE_QUALITY_PRIORITY); }
  function femalePriorityBonus(v) { return priorityBonus(v, FEMALE_QUALITY_PRIORITY); }

  /** Exactly one best female + one best male voice (fewer if the device has fewer). */
  function getCuratedVoices() {
    const ranked = [...voices]
      .filter((v) => !isBadVoice(v))
      .sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a));
    const result = [];

    // Not preferring the OS's own configured default voice anymore — it
    // previously caused an older/more formal-sounding voice (e.g. Daniel) to
    // win over a younger-sounding one purely because the device happened to
    // have it set as default. Our own priority ranking now fully decides.
    const femaleCandidates = ranked.filter((v) => voiceGender(v) === "female");
    const female = [...femaleCandidates].sort((a, b) => {
      const scoreDiff = voiceQualityScore(b) - voiceQualityScore(a);
      return scoreDiff !== 0 ? scoreDiff : femalePriorityBonus(b) - femalePriorityBonus(a);
    })[0];
    if (female) result.push({ voice: female, gender: "female" });

    const maleCandidates = ranked.filter((v) => voiceGender(v) === "male");
    const male = [...maleCandidates].sort((a, b) => {
      const scoreDiff = voiceQualityScore(b) - voiceQualityScore(a);
      return scoreDiff !== 0 ? scoreDiff : malePriorityBonus(b) - malePriorityBonus(a);
    })[0];
    if (male) result.push({ voice: male, gender: "male" });

    // fill up to 2 with the next-best voices if gender couldn't be detected
    for (const v of ranked) {
      if (result.length >= 2) break;
      if (result.some((r) => r.voice === v)) continue;
      result.push({ voice: v, gender: voiceGender(v) || (result.length === 0 ? "female" : "male") });
    }
    return result;
  }

  /** Several ranked male candidates (younger/fresher-sounding first) so the learner can try each and pick one. */
  function getMaleVoiceOptions(max) {
    max = max || 6;
    const ranked = [...voices]
      .filter((v) => !isBadVoice(v) && voiceGender(v) === "male")
      .sort((a, b) => {
        const scoreDiff = voiceQualityScore(b) - voiceQualityScore(a);
        return scoreDiff !== 0 ? scoreDiff : malePriorityBonus(b) - malePriorityBonus(a);
      });
    return ranked.slice(0, max);
  }

  function pickVoice() {
    // A voice saved in settings before the bad-voice blacklist existed could
    // still point at a novelty voice (e.g. Fred) — ignore such a saved
    // preference instead of honoring it forever.
    if (preferredVoiceName) {
      const v = voices.find((v) => v.name === preferredVoiceName);
      if (v && !isBadVoice(v)) return v;
    }
    return getCuratedVoices()[0]?.voice || voices[0] || null;
  }

  // iOS Safari only allows speechSynthesis.speak() to start audio when it's
  // called synchronously inside a user-gesture event. A bot reply arrives
  // later via an async fetch, outside that window, so it gets silently
  // dropped unless the engine was "primed" earlier in the same gesture
  // stack. Speaking one silent utterance does that — but a later
  // speechSynthesis.cancel() (e.g. when the mic starts) can re-lock the
  // engine on iOS, so this isn't a one-time thing: call it again from
  // every gesture that might cancel(), right after the cancel.
  function primeAudio() {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
  if ("speechSynthesis" in window) {
    document.addEventListener("pointerdown", primeAudio, { capture: true });
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
    getCuratedVoices,
    getMaleVoiceOptions,
    setPreferredVoice,
    isHighQualityVoice,
    isListening: () => listening
  };
})();
