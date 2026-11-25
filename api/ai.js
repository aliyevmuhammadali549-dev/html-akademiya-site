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

async function gemini(key, system, msgs) {
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
  const gk = process.env.GROQ_API_KEY, mk = process.env.GEMINI_API_KEY;
  if (!gk && !mk) return res.status(404).json({ error: "no key" });

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
    const text = gk ? await groq(gk, system, msgs) : await gemini(mk, system, msgs);
    res.status(200).json({ text: text || "…" });
  } catch (e) {
    res.status(e?.status === 429 ? 429 : 502).json({ error: e?.message || "upstream" });
  }
}
