// Joriy tarif va limitlar: { token } -> { plan, exp, limits, used }
import { planOf, PLANS, body, fail, redis, hasDB, today, ipOf } from "./_lib.js";

export default async function handler(req, res) {
  try {
    const { token } = req.method === "POST" ? body(req) : req.query;
    const p = await planOf(token);
    const who = p.who || "ip:" + ipOf(req);
    let used = { lessons: 0, ai: 0 };
    if (hasDB) {
      const d = today();
      const [l, a] = await Promise.all([redis("SCARD", `les:${who}:${d}`), redis("GET", `ai:${who}:${d}`)]).catch(() => [0, 0]);
      used = { lessons: +l || 0, ai: +a || 0 };
    }
    res.status(200).json({ plan: p.plan, exp: p.exp || 0, email: p.who, limits: PLANS[p.plan], used });
  } catch (e) { fail(res, e); }
}
