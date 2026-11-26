// Admin: kod yaratish, ro'yxat, foydalanuvchini bekor qilish. Parol: Vercel env ADMIN_KEY.
import crypto from "node:crypto";
import { redis, body, fail, PLANS, normEmail } from "./_lib.js";

const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";            // adashtiradigan 0/O/1/I yo'q
const part = () => Array.from(crypto.randomBytes(4), b => ABC[b % ABC.length]).join("");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { key, action, plan, days, n, email } = body(req);
    const K = process.env.ADMIN_KEY || "";
    if (!K || typeof key !== "string" || key.length !== K.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(K))) {
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ error: "wrong key" });
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
