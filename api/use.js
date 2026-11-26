// Darsni ochishdan oldin server tekshiruvi: { token, id, course, n } -> { ok, reason? }
// Tarif doirasi (HTML/CSS nechta dars) va kunlik limit serverda hisoblanadi.
import { planOf, PLANS, body, fail, redis, hasDB, today, ipOf } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { token, id, course, n } = body(req);
    const p = await planOf(token), P = PLANS[p.plan];
    if (!["html", "css"].includes(course) || !(n >= 1 && n <= 30)) return res.status(400).json({ error: "bad lesson" });
    if (n > P[course]) return res.status(200).json({ ok: false, reason: "plan", plan: p.plan });
    if (!hasDB) return res.status(200).json({ ok: true, plan: p.plan });

    const who = p.who || "ip:" + ipOf(req), key = `les:${who}:${today()}`;
    if (await redis("SISMEMBER", key, String(id))) return res.status(200).json({ ok: true, plan: p.plan });
    const cnt = await redis("SCARD", key);
    if (cnt >= P.perDay) return res.status(200).json({ ok: false, reason: "day", limit: P.perDay, plan: p.plan });
    await redis("SADD", key, String(id));
    await redis("EXPIRE", key, 172800);
    res.status(200).json({ ok: true, plan: p.plan, used: cnt + 1 });
  } catch (e) { fail(res, e); }
}
