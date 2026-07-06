/*
 * SpeakFlow — OpenAI TTS proxy (Cloudflare Worker)
 * ================================================
 * OpenAI blocks direct browser calls (no CORS), so this tiny worker sits
 * between the app and OpenAI: it holds your OpenAI key as a server-side
 * secret (never exposed to the browser) and adds the CORS headers the app
 * needs. The app calls THIS worker's URL; the worker calls OpenAI.
 *
 * ---- One-time setup (free) --------------------------------------------
 * 1. Create a free Cloudflare account: https://dash.cloudflare.com/sign-up
 * 2. Left menu → "Workers & Pages" → "Create" → "Create Worker".
 * 3. Give it a name (e.g. speakflow-tts) → Deploy.
 * 4. Click "Edit code", delete the sample, paste THIS whole file → Deploy.
 * 5. Back on the worker page → "Settings" → "Variables and Secrets" →
 *    "Add" → type = Secret, name = OPENAI_API_KEY, value = your OpenAI
 *    key (starts with sk-...). Save/Deploy.
 * 6. Copy the worker URL (looks like
 *    https://speakflow-tts.YOURNAME.workers.dev) and paste it into
 *    SpeakFlow → Settings → "כתובת פרוקסי TTS".
 * -----------------------------------------------------------------------
 *
 * Restrict who can use it (recommended): set ALLOWED_ORIGIN below to your
 * app's origin so only your site can call the worker.
 */

const ALLOWED_ORIGIN = "*"; // e.g. "https://nla-apps.github.io" to lock it down

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }
    if (request.method !== "POST") {
      return new Response("POST only", { status: 405, headers: cors });
    }
    if (!env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY secret on the worker", { status: 500, headers: cors });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400, headers: cors });
    }

    const input = (body.input || "").slice(0, 4000); // OpenAI TTS caps at 4096 chars
    if (!input) {
      return new Response("Empty input", { status: 400, headers: cors });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: body.model || "tts-1",       // "tts-1-hd" for higher quality (slower)
        voice: body.voice || "nova",
        input,
        response_format: "mp3",
        speed: Math.min(4, Math.max(0.25, Number(body.speed) || 1)),
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return new Response(errText, { status: openaiRes.status, headers: cors });
    }

    return new Response(openaiRes.body, {
      status: 200,
      headers: { ...cors, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  },
};
