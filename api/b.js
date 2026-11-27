// Bot API (/api/v1) uchun proksi: faqat progress, darslar va reyting yo'llari.
import { BOT_API } from "./bsess.js";

export const config = { maxDuration: 60 };
const OK = /^\/api\/v1\/(me|leaderboard|stats|courses\/(html|css)|lessons\/\d{1,4}(\/(task|quiz))?)$/;

export default async function handler(req, res) {
  const p = String(req.query.p || "");
  if (!OK.test(p)) return res.status(404).json({ error: "not found" });
  const tok = String(req.headers["x-btok"] || "");
  if (!tok) return res.status(401).json({ error: "auth", code: "auth" });
  try {
    const r = await fetch(BOT_API() + p, {
      method: req.method === "POST" ? "POST" : "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, "X-Lang": String(req.headers["x-lang"] || "uz").slice(0, 2) },
      body: req.method === "POST" ? JSON.stringify(req.body || {}) : undefined,
    });
    res.status(r.status).setHeader("Content-Type", "application/json").send(await r.text());
  } catch (e) { res.status(502).json({ error: "bot offline", code: "offline" }); }
}
