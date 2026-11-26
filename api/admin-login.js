// Admin kirishi: faqat ADMIN_EMAIL + ADMIN_KEY (parol). 5 ta xatodan keyin IP 15 daqiqaga bloklanadi.
// { email, key } -> HttpOnly cookie. { email, check: true } -> shu email admin'mi (tugmani ko'rsatish uchun).
import crypto from "node:crypto";
import { redis, body, fail, sign, normEmail, ipOf, ADMIN_EMAIL } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(404).json({ error: "not found" });
  try {
    const { email, key, check } = body(req);
    const E = ADMIN_EMAIL(), K = process.env.ADMIN_KEY || "", e = normEmail(email);
    if (!E || !K || e !== E) return res.status(404).json({ error: "not found" });
    if (check) return res.status(200).json({ admin: true });
    const lk = "alock:" + ipOf(req), fails = +(await redis("GET", lk)) || 0;
    if (fails >= 5) return res.status(429).json({ error: "locked" });
    if (typeof key !== "string" || key.length !== K.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(K))) {
      const f = await redis("INCR", lk); if (f === 1) await redis("EXPIRE", lk, 900);
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ error: "wrong key" });
    }
    await redis("DEL", lk);
    const tok = sign({ adm: 1, email: E, exp: Date.now() + 12 * 3600e3 });
    res.setHeader("Set-Cookie", `ha_adm=${encodeURIComponent(tok)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`);
    res.status(200).json({ ok: true });
  } catch (e) { fail(res, e); }
}
