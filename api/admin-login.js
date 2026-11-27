// Admin kirishi: login (ADMIN_USER, standart "admin") + parol (ADMIN_KEY). 5 ta xatodan keyin IP 15 daqiqaga bloklanadi.
import crypto from "node:crypto";
import { redis, body, fail, sign, ipOf } from "./_lib.js";

const same = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(404).json({ error: "not found" });
  try {
    const { user, key, check } = body(req);
    if (check) return res.status(404).json({ error: "not found" });       // eski profil tugmasi endi ishlatilmaydi
    const U = process.env.ADMIN_USER || "admin", K = process.env.ADMIN_KEY || "";
    if (!K) return res.status(503).json({ error: "not configured" });
    const lk = "alock:" + ipOf(req), fails = +(await redis("GET", lk)) || 0;
    if (fails >= 5) return res.status(429).json({ error: "locked" });
    if (!same(String(user || "").trim().toLowerCase(), U.toLowerCase()) || !same(String(key || ""), K)) {   // login katta-kichik harfga sezgir emas
      const f = await redis("INCR", lk); if (f === 1) await redis("EXPIRE", lk, 900);
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ error: "wrong key", left: Math.max(0, 4 - fails) });
    }
    await redis("DEL", lk);
    const tok = sign({ adm: 1, email: (process.env.ADMIN_EMAIL || "admin").toLowerCase(), exp: Date.now() + 12 * 3600e3 });
    res.setHeader("Set-Cookie", `ha_adm=${encodeURIComponent(tok)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
    res.status(200).json({ ok: true });
  } catch (e) { fail(res, e); }
}
