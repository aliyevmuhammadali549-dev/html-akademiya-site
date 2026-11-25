// HTML Akademiya — AI ustoz (Vercel serverless function).
// Bepul kalit: console.groq.com/keys  →  Vercel: Settings → Environment Variables → GROQ_API_KEY
// (ixtiyoriy: GEMINI_API_KEY ham ishlaydi)
const LANG = { uz: "Uzbek (Latin script)", ru: "Russian", en: "English" };
const hits = new Map();

async function groq(key, system, msgs) {
  const call = model => fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 700, temperature: 0.6, messages: [{ role: "system", content: system }, ...msgs] }),
  });
  let model = process.env.AI_MODEL || "llama-3.3-70b-versatile";
  let r = await call(model), j = await r.json();
  if (!r.ok && /model/i.test(j?.error?.message || "")) {           // model nomi o'zgargan bo'lsa — mavjudini topamiz
    const list = await (await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${key}` } })).json();
    const ids = (list.data || []).map(m => m.id).filter(id => !/whisper|guard|tts|vision/i.test(id));
    model = ids.find(id => /llama.*70b|gpt-oss-120b/i.test(id)) || ids[0];
    if (model) { r = await call(model); j = await r.json(); }
  }
  if (!r.ok) throw { status: r.status, message: j?.error?.message };
  return j.choices?.[0]?.message?.content || "";
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gemini(key, system, msgs) {
  // Lite modellar tezroq va kvotasi kattaroq; band/sekin bo'lsa keyingisiga o'tamiz
  const models = [...new Set([process.env.AI_MODEL, "gemini-2.5-flash-lite", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-flash-latest"].filter(Boolean))];
  const contents = msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  let last = { status: 502, message: "no model answered" };
  const started = Date.now();
  const log = [];
  for (let round = 0; Date.now() - started < 38000; round++) {
    for (const model of [...models]) {
      if (Date.now() - started > 45000) break;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const call = gc => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST", signal: ctl.signal,
          headers: { "x-goog-api-key": key, "content-type": "application/json" },
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: gc }),
        });
        let r = await call({ maxOutputTokens: 800, temperature: 0.6, thinkingConfig: { thinkingBudget: 0 } });
        if (r.status === 400) r = await call({ maxOutputTokens: 800, temperature: 0.6 });   // eski modellar thinkingConfig'ni bilmaydi
        const j = await r.json().catch(() => ({}));
        const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
        if (r.ok && text) return text;
        last = { status: r.status, message: j?.error?.message || "empty answer" };
        log.push(model + ":" + r.status);
        if (r.status === 404) models.splice(models.indexOf(model), 1);   // bunday model yo'q
      } catch (e) {
        last = e?.name === "AbortError" ? { status: 504, message: model + " timeout" } : (e?.status ? e : { status: 502, message: String(e?.message || e) });
      } finally { clearTimeout(timer); }
    }
    if (!models.length) break;
    await sleep(Math.min(1500 * (round + 1), 5000));
  }
  last.message = (last.message || "") + " [" + log.slice(-8).join(" ") + "]";
  throw last;
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const gk = process.env.GROQ_API_KEY, mk = process.env.GEMINI_API_KEY;
  if (!gk && !mk) return res.status(404).json({ error: "no key" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "x";
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (h.length >= 10) return res.status(429).json({ error: "slow down" });
  hits.set(ip, [...h, now]);

  const { lang = "uz", messages = [] } = req.body || {};
  const msgs = [];
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const c = m.content.trim().slice(0, 4000);
    if (!c || (m.role === "assistant" && (c.length < 3 || m.err))) continue;      // "…" va xato javoblarni tashlaymiz
    const prev = msgs[msgs.length - 1];
    if (prev && prev.role === m.role) prev.content += "\n\n" + c; else msgs.push({ role: m.role, content: c });
  }
  msgs.splice(0, Math.max(0, msgs.length - 10));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "bad messages" });

  const system = `You are the AI tutor of "HTML Akademiya", a course that teaches HTML and CSS to beginners (mostly teenagers in Uzbekistan) on their phones. Always reply in ${LANG[lang] || LANG.uz}. Be friendly and short (under 150 words), explain in plain words, give a tiny code example when it helps, and never write the full solution of a course task unless the student asks for it twice — guide them with hints first. If the question is not about web development, gently bring the student back to HTML/CSS.`;

  try {
    const text = gk ? await groq(gk, system, msgs) : await gemini(mk, system, msgs);
    res.status(200).json({ text: text || "…" });
  } catch (e) {
    res.status(e?.status === 429 ? 429 : 502).json({ error: e?.message || "upstream" });
  }
}
