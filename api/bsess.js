// Saytdagi kirish (Google/Telegram) -> bot bazasidagi YAGONA akkaunt sessiyasi.
// Bot va sayt bitta progress, XP, seriya, reyting va tarifni ko'rsatadi.
import crypto from "node:crypto";
import { redis, body, fail, loginOf } from "./_lib.js";

export const BOT_API = () => (process.env.BOT_API || "https://html-akademiya.onrender.com").replace(/\/$/, "");
export const config = { maxDuration: 60 };

// kirgan foydalanuvchi -> {email, name, tg_id}
export async function ident(L) {
  const email = String(L.email).toLowerCase();
  let tg_id = 0;
  const m = /^(\d{9,15})@telegram$/.exec(email);
  if (m) { const t = JSON.parse((await redis("GET", "tg:" + m[1])) || "null"); tg_id = +(t && t.chat_id) || 0; }
  return { email, name: L.name || "", tg_id };
}

// botga imzolangan so'rov (kalit — bot tokenidan)
export async function botPost(path, payload) {
  const T = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!T) throw Object.assign(new Error("off"), { status: 503 });
  const key = crypto.createHmac("sha256", T).update("site-v1").digest("hex");
  const r = await fetch(BOT_API() + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Site-Key": key }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "bot " + r.status), { status: 502 });
  return j;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const L = loginOf(body(req).ltok);
    if (!L) return res.status(401).json({ error: "login" });
    const id = await ident(L);
    const u = JSON.parse((await redis("GET", "user:" + id.email)) || "null");   // saytdagi tarif botga ham o'tadi
    const j = await botPost("/api/v1/site/session", { ...id, plan: u && u.plan, exp: u && u.exp });
    if (!j.token) return res.status(502).json({ error: "bot" });
    res.status(200).json({ token: j.token });
  } catch (e) { e.status ? res.status(e.status).json({ error: e.message }) : fail(res, e); }
}
