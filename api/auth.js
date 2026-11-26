// Kirish: Google (ID token) va Telegram (raqam + botdan kod). Javob: { user, ltok } — ltok serverda imzolangan.
import crypto from "node:crypto";
import { redis, body, fail, sign, ipOf } from "./_lib.js";

const BOT = process.env.TELEGRAM_BOT_USERNAME || "html_akademiya_uz_bot";
const GID = process.env.GOOGLE_CLIENT_ID || "1003735968998-2dl2opesjvhdpt30pnfb0oeaq56mkmeu.apps.googleusercontent.com";
const session = u => sign({ lg: 1, email: u.email, name: u.name, via: u.via, exp: Date.now() + 30 * 864e5 });
const normPhone = p => { let d = String(p || "").replace(/\D/g, ""); if (d.length === 9) d = "998" + d; return d; };
const hash = (p, c) => crypto.createHash("sha256").update(p + ":" + c + ":" + (process.env.ADMIN_KEY || "")).digest("hex");

export async function newCode(p) {
  const c = String(crypto.randomInt(100000, 1000000));
  await redis("SET", "otp:" + p, JSON.stringify({ h: hash(p, c), n: 0 }), "EX", 300);
  return c;
}
async function limit(key, max, sec) {
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, sec);
  return n > max;
}
async function tgSend(chat, text) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML" }) });
  return r.ok;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(404).json({ error: "not found" });
  try {
    const b = body(req), act = b.action;

    if (act === "google") {
      const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(String(b.credential || "")));
      const g = await r.json().catch(() => ({}));
      if (!r.ok || g.aud !== GID || String(g.email_verified) !== "true" || !g.email) return res.status(401).json({ error: "google" });
      const u = { email: g.email.toLowerCase(), name: g.name || g.email.split("@")[0], picture: g.picture || "", via: "google" };
      return res.status(200).json({ user: u, ltok: session(u) });
    }

    if (act === "tg-send") {
      if (!process.env.TELEGRAM_BOT_TOKEN) return res.status(503).json({ error: "telegram off" });
      const p = normPhone(b.phone);
      if (!/^\d{11,15}$/.test(p)) return res.status(400).json({ error: "phone" });
      if (await limit("tgs:" + p, 4, 600) || await limit("tgsip:" + ipOf(req), 12, 600)) return res.status(429).json({ error: "slow down" });
      const link = JSON.parse((await redis("GET", "tg:" + p)) || "null");
      if (!link) {
        await redis("SET", "tgpend:" + p, "1", "EX", 900);
        return res.status(200).json({ need_link: true, url: `https://t.me/${BOT}?start=site`, bot: BOT });
      }
      const c = await newCode(p);
      const ok = await tgSend(link.chat_id, `🔐 HTML Akademiya saytiga kirish kodi: <code>${c}</code>\n\nKod 5 daqiqa amal qiladi. Uni hech kimga bermang.`);
      if (!ok) { await redis("DEL", "tg:" + p); await redis("SET", "tgpend:" + p, "1", "EX", 900); return res.status(200).json({ need_link: true, url: `https://t.me/${BOT}?start=site`, bot: BOT }); }
      return res.status(200).json({ sent: true, bot: BOT });
    }

    if (act === "tg-verify") {
      const p = normPhone(b.phone), c = String(b.code || "").replace(/\D/g, "");
      const o = JSON.parse((await redis("GET", "otp:" + p)) || "null");
      if (!o) return res.status(400).json({ error: "expired" });
      if (o.n >= 5) { await redis("DEL", "otp:" + p); return res.status(429).json({ error: "too many" }); }
      if (o.h !== hash(p, c)) { o.n++; await redis("SET", "otp:" + p, JSON.stringify(o), "KEEPTTL"); return res.status(401).json({ error: "wrong code", left: 5 - o.n }); }
      await redis("DEL", "otp:" + p);
      const link = JSON.parse((await redis("GET", "tg:" + p)) || "{}");
      const u = { email: p + "@telegram", name: b.name || link.name || "+" + p, phone: "+" + p, via: "telegram" };
      return res.status(200).json({ user: u, ltok: session(u) });
    }

    res.status(400).json({ error: "bad action" });
  } catch (e) { fail(res, e); }
}
