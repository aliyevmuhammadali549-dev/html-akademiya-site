// Saytdagi kirish (Google/Telegram) -> bot bazasidagi YAGONA akkaunt sessiyasi.
// Bot va sayt bitta progress, XP, seriya va reytingni ko'rsatadi.
import crypto from "node:crypto";
import { redis, body, fail, loginOf } from "./_lib.js";

export const BOT_API = () => (process.env.BOT_API || "https://html-akademiya.onrender.com").replace(/\/$/, "");
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const T = process.env.TELEGRAM_BOT_TOKEN || "";
    const L = loginOf(body(req).ltok);
    if (!L) return res.status(401).json({ error: "login" });
    if (!T) return res.status(503).json({ error: "off" });
    const email = String(L.email).toLowerCase();
    let tg_id = 0;
    const m = /^(\d{9,15})@telegram$/.exec(email);
    if (m) { const t = JSON.parse((await redis("GET", "tg:" + m[1])) || "null"); tg_id = +(t && t.chat_id) || 0; }
    const key = crypto.createHmac("sha256", T).update("site-v1").digest("hex");
    const r = await fetch(BOT_API() + "/api/v1/site/session", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Site-Key": key },
      body: JSON.stringify({ email, name: L.name || "", tg_id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) return res.status(502).json({ error: j.error || "bot " + r.status });
    res.status(200).json({ token: j.token });
  } catch (e) { fail(res, e); }
}
