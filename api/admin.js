// Admin: kod yaratish, ro'yxat, foydalanuvchini bekor qilish.
// Faqat admin cookie bilan ishlaydi (kirish: /api/admin-login). Boshqalarga 404.
import crypto from "node:crypto";
import { redis, body, fail, PLANS, normEmail, isAdmin, idKey } from "./_lib.js";

const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";            // adashtiradigan 0/O/1/I yo'q
const part = () => Array.from(crypto.randomBytes(4), b => ABC[b % ABC.length]).join("");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { action, plan, days, n, email } = body(req);
    if (!isAdmin(req)) return res.status(404).json({ error: "not found" });
    if (action === "logout") {
      res.setHeader("Set-Cookie", "ha_adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
      return res.status(200).json({ ok: true });
    }
    if (action === "stats") {
      const days = [];
      for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() + 5 * 3600e3 - i * 864e5).toISOString().slice(0, 10));
      const [vAll, pvAll, uAll, ...rest] = await Promise.all([
        redis("PFCOUNT", "v:all"), redis("GET", "pv:all"), redis("HLEN", "users"),
        ...days.map(d => redis("PFCOUNT", "v:" + d)), redis("MGET", ...days.map(d => "pv:" + d)), redis("MGET", ...days.map(d => "reg:" + d)),
        redis("HGETALL", "pg:" + days[13]), redis("HGETALL", "users"), redis("KEYS", "user:*")]);
      const vDays = rest.slice(0, 14), pv = rest[14], reg = rest[15], pgRaw = rest[16] || [], uRaw = rest[17] || [], planKeys = rest[18] || [];
      const pages = []; for (let i = 0; i < pgRaw.length; i += 2) pages.push({ p: pgRaw[i], n: +pgRaw[i + 1] });
      pages.sort((a, b) => b.n - a.n);
      const byId = new Map();                                   // bir xil odamning turli yozuvlarini birlashtiramiz
      for (let i = 0; i < uRaw.length; i += 2) { try {
        const k = idKey(uRaw[i]) || uRaw[i], o = JSON.parse(uRaw[i + 1]), p = byId.get(k);
        const nm = o.name && !/^\+?\d+$/.test(o.name) ? o.name : "";
        byId.set(k, p ? { email: k, name: p.name || nm, first: Math.min(p.first || 9e15, o.first || 9e15), last: Math.max(p.last || 0, o.last || 0) } : { email: k, name: nm, first: o.first, last: o.last });
      } catch {} }
      const users = [...byId.values()];
      users.sort((a, b) => (b.last || 0) - (a.last || 0));
      const plans = planKeys.length ? await redis("MGET", ...planKeys) : [];
      const paid = { premium: 0, alpha: 0 };
      plans.forEach(x => { try { const u = JSON.parse(x); if (!u.exp || u.exp > Date.now()) paid[u.plan] = (paid[u.plan] || 0) + 1; } catch {} });
      return res.status(200).json({
        visitors: +vAll || 0, views: +pvAll || 0, users: users.length, paid,
        days: days.map((d, i) => ({ d, v: +vDays[i] || 0, pv: +(pv?.[i]) || 0, reg: +(reg?.[i]) || 0 })),
        pages: pages.slice(0, 8), recent: users.slice(0, 50) });
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
