// Admin: kod yaratish, ro'yxat, foydalanuvchini bekor qilish.
// Kirish: Vercel env ADMIN_USER (login, standart "admin") + ADMIN_EMAIL + ADMIN_KEY (parol). 5 ta xato urinishdan keyin IP 15 daqiqaga bloklanadi.
import crypto from "node:crypto";
import { redis, body, fail, PLANS, normEmail, ipOf } from "./_lib.js";

const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";            // adashtiradigan 0/O/1/I yo'q
const part = () => Array.from(crypto.randomBytes(4), b => ABC[b % ABC.length]).join("");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { key, user, me, action, plan, days, n, email } = body(req);
    const K = process.env.ADMIN_KEY || "", U = process.env.ADMIN_USER || "admin", E = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    // 5 ta noto'g'ri urinishdan keyin shu IP 15 daqiqaga bloklanadi
    const lk = "alock:" + ipOf(req), fails = +(await redis("GET", lk)) || 0;
    if (fails >= 5) return res.status(429).json({ error: "locked" });
    const same = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    if (!K || !E || !same(key, K) || !same(String(user || ""), U) || !same(normEmail(me), E)) {
      const f = await redis("INCR", lk); if (f === 1) await redis("EXPIRE", lk, 900);
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ error: !K || !E ? "not configured" : "wrong key" });
    }
    if (action === "create") {
      if (!PLANS[plan] || plan === "free") return res.status(400).json({ error: "bad plan" });
      const d = Math.max(0, Math.min(3650, parseInt(days) || 0)), cnt = Math.max(1, Math.min(50, parseInt(n) || 1));
      const codes = [];
      for (let i = 0; i < cnt; i++) {
        const c = `${plan === "premium" ? "PREM" : "ALPHA"}-${part()}-${part()}`;
        await redis("SET", "code:" + c, JSON.stringify({ plan, days: d, made: Date.now() }));
        await redis("SADD", "codes", c);
        codes.push(c);
      }
      return res.status(200).json({ codes });
    }
    if (action === "list") {
      const all = (await redis("SMEMBERS", "codes")) || [];
      const vals = all.length ? await redis("MGET", ...all.map(c => "code:" + c)) : [];
      const unused = [], used = [];
      all.forEach((c, i) => (vals[i] ? unused : used).push({ code: c, ...(vals[i] ? JSON.parse(vals[i]) : {}) }));
      if (used.length) await redis("SREM", "codes", ...used.map(u => u.code));   // ishlatilganlar logda qoladi
      const log = ((await redis("LRANGE", "log", 0, 99)) || []).map(x => JSON.parse(x));
      return res.status(200).json({ unused, log });
    }
    if (action === "revoke") {
      const e = normEmail(email);
      await redis("DEL", "user:" + e);
      return res.status(200).json({ ok: true });
    }
    if (action === "delcode") {
      const c = String(body(req).code || "").toUpperCase();
      await redis("DEL", "code:" + c); await redis("SREM", "codes", c);
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "bad action" });
  } catch (e) { fail(res, e); }
}
