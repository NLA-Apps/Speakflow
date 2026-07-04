/* SpeakFlow — lightweight event/error log, auto-written to a folder on disk so it can be
   read directly (no manual export needed) — plus a manual download fallback for browsers
   that don't support the File System Access API (Firefox, Safari). */
window.SF_LOG = (function () {
  const KEY = "sf_log";
  const MAX_ENTRIES = 500;
  const FILE_NAME = "speakflow-log.txt";
  const DB_NAME = "sf_log_db";
  const STORE_NAME = "handles";
  const HANDLE_KEY = "logDir";

  let entries = [];
  try { entries = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { entries = []; }

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* quota — drop silently */ }
  }

  function safeData(data) {
    if (data === undefined) return undefined;
    if (data instanceof Error) return { name: data.name, message: data.message, stack: data.stack };
    try {
      return JSON.parse(JSON.stringify(data));
    } catch {
      return String(data);
    }
  }

  function log(level, message, data) {
    entries.push({ t: new Date().toISOString(), level, message, data: safeData(data) });
    if (entries.length > MAX_ENTRIES) entries.shift();
    persist();
    if (level === "error") console.error("[SpeakFlow]", message, data);
    scheduleFileWrite();
  }

  const info = (message, data) => log("info", message, data);
  const warn = (message, data) => log("warn", message, data);
  const error = (message, data) => log("error", message, data);

  function exportText() {
    const header = `SpeakFlow log — ${entries.length} entries — exported ${new Date().toISOString()}\n${"=".repeat(60)}\n`;
    const body = entries
      .map((e) => `[${e.t}] ${e.level.toUpperCase()} — ${e.message}` + (e.data !== undefined ? " " + JSON.stringify(e.data) : ""))
      .join("\n");
    return header + body;
  }

  function download() {
    const blob = new Blob([exportText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "speakflow-log-" + new Date().toISOString().replace(/[:.]/g, "-") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function clear() {
    entries = [];
    localStorage.removeItem(KEY);
    scheduleFileWrite();
  }

  // ---------- Auto-write to a folder on disk (File System Access API — Chrome/Edge only) ----------
  let dirHandle = null;
  let writeTimer = null;

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const r = tx.objectStore(STORE_NAME).get(key);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function idbSet(key, value) {
    try {
      const db = await idbOpen();
      return await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  const fsAccessSupported = "showDirectoryPicker" in window;

  /** Prompts the user once to pick a folder (e.g. this project's folder). Requires a click. */
  async function connectLogFolder() {
    if (!fsAccessSupported) {
      throw new Error("הדפדפן הזה לא תומך בשמירה אוטומטית לתיקייה — נסה Chrome או Edge, או השתמש בהורדה הידנית.");
    }
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await idbSet(HANDLE_KEY, handle);
    dirHandle = handle;
    await writeFile();
    return handle.name;
  }

  /** On page load, silently reconnect if permission is still granted from a previous visit. */
  async function restoreLogFolder() {
    if (!fsAccessSupported) return;
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) return;
    try {
      const perm = await handle.queryPermission({ mode: "readwrite" });
      if (perm === "granted") {
        dirHandle = handle;
        writeFile();
      }
      // if not already granted, we can't silently re-prompt without a user gesture —
      // the user just needs to click "connect" again in Settings.
    } catch { /* handle stale/revoked — ignore */ }
  }

  async function writeFile() {
    if (!dirHandle) return;
    try {
      const perm = await dirHandle.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") return;
      const fileHandle = await dirHandle.getFileHandle(FILE_NAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(exportText());
      await writable.close();
    } catch { /* best-effort — logging must never break the app */ }
  }

  function scheduleFileWrite() {
    if (!dirHandle) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(writeFile, 1000);
  }

  function isFolderConnected() { return Boolean(dirHandle); }
  function folderName() { return dirHandle ? dirHandle.name : ""; }

  // Automatically capture anything that slips past our own try/catch blocks
  window.addEventListener("error", (e) => {
    error("Uncaught error", { message: e.message, source: e.filename, line: e.lineno });
  });
  window.addEventListener("unhandledrejection", (e) => {
    error("Unhandled promise rejection", { reason: String((e.reason && e.reason.message) || e.reason) });
  });

  info("Session started", { url: location.href, ua: navigator.userAgent });
  restoreLogFolder();

  return {
    info, warn, error, exportText, download, clear,
    count: () => entries.length,
    connectLogFolder, isFolderConnected, folderName,
    fsAccessSupported
  };
})();
