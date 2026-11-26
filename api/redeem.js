// Aktivatsiya kodini ishlatish: { code, email } -> { plan, exp, token }
import { redis, sign, normEmail, body, fail, ipOf, PLANS, loginOf } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { code, email, ltok } = body(req);
    const L = loginOf(ltok);                       // tasdiqlangan kirish bo'lsa, aynan o'sha akkauntga yoziladi
    const c = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    const e = L ? L.email : normEmail(email);
    if (!/^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c) || !e.includes("@")) return res.status(400).json({ error: "bad code" });

    // urinishlar cheklovi: bir IP'dan daqiqasiga 8 ta
    const k = "try:" + ipOf(req);
    const n = await redis("INCR", k);
    if (n === 1) await redis("EXPIRE", k, 60);
    if (n > 8) return res.status(429).json({ error: "slow down" });

    const raw = await redis("GETDEL", "code:" + c);          // bir martalik
    if (!raw) return res.status(404).json({ error: "invalid code" });
    const info = JSON.parse(raw);
    if (!PLANS[info.plan]) return res.status(400).json({ error: "bad plan" });

    // mavjud muddat ustiga qo'shiladi (masalan 2 marta 30 kun = 60 kun)
    const old = JSON.parse((await redis("GET", "user:" + e)) || "null");
    const base = old && old.plan === info.plan && old.exp > Date.now() ? old.exp : Date.now();
    const exp = info.days ? base + info.days * 864e5 : 0;   // 0 = umrbod
    const user = { plan: info.plan, exp, since: Date.now(), code: c };
    await redis("SET", "user:" + e, JSON.stringify(user));
    await redis("LPUSH", "log", JSON.stringify({ t: Date.now(), email: e, code: c, plan: info.plan, days: info.days }));
    await redis("LTRIM", "log", 0, 499);

    res.status(200).json({ plan: info.plan, exp, token: sign({ email: e, plan: info.plan, exp }) });
  } catch (e) { fail(res, e); }
}
