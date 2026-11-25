// HTML Akademiya — AI ustoz (Vercel serverless function).
// Bepul: Google Gemini API (aistudio.google.com → Get API key).
// Vercel → Project → Settings → Environment Variables: GEMINI_API_KEY = AIza...
const LANG = { uz: "Uzbek (Latin script)", ru: "Russian", en: "English" };
const hits = new Map(); // oddiy himoya: bitta IP dan daqiqasiga 10 ta so'rov

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(404).json({ error: "no key" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "x";
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (h.length >= 10) return res.status(429).json({ error: "slow down" });
  hits.set(ip, [...h, now]);

  const { lang = "uz", messages = [] } = req.body || {};
  const msgs = messages
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "bad messages" });

  const system = `You are the AI tutor of "HTML Akademiya", a course that teaches HTML and CSS to beginners (mostly teenagers in Uzbekistan) on their phones. Always reply in ${LANG[lang] || LANG.uz}. Be friendly and short (under 150 words), explain in plain words, give a tiny code example when it helps, and never write the full solution of a course task unless the student asks for it twice — guide them with hints first. If the question is not about web development, gently bring the student back to HTML/CSS.`;

  try {
    const model = process.env.AI_MODEL || "gemini-flash-latest";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: j?.error?.message || "upstream" });
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    res.status(200).json({ text: text || "…" });
  } catch (e) {
    res.status(502).json({ error: "network" });
  }
}async function gemini(key, system, msgs) {
  // band bo'lsa yoki topilmasa — keyingi modelga o'tamiz
  const models = [process.env.AI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"].filter(Boolean);
  let last;
  for (const model of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
      }),
    });
    const j = await r.json();
    if (r.ok) return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    last = { status: r.status, message: j?.error?.message };
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  throw last;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(404).json({ error: "no key" });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "x";
  const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 60000);
  if (h.length >= 10) return res.status(429).json({ error: "slow down" });
  hits.set(ip, [...h, now]);

  const { lang = "uz", messages = [] } = req.body || {};
  const msgs = messages
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return res.status(400).json({ error: "bad messages" });

  const system = `You are the AI tutor of "HTML Akademiya", a course that teaches HTML and CSS to beginners (mostly teenagers in Uzbekistan) on their phones. Always reply in ${LANG[lang] || LANG.uz}. Be friendly and short (under 150 words), explain in plain words, give a tiny code example when it helps, and never write the full solution of a course task unless the student asks for it twice — guide them with hints first. If the question is not about web development, gently bring the student back to HTML/CSS.`;

  try {
    const model = process.env.AI_MODEL || "gemini-flash-latest";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 700, temperature: 0.6 },
      }),
    });
    const j = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: j?.error?.message || "upstream" });
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    res.status(200).json({ text: text || "…" });
  } catch (e) {
    res.status(502).json({ error: "network" });
  }
}
