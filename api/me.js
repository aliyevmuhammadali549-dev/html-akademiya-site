// Joriy tarif va limitlar: { token, ltok } -> { plan, exp, limits, used, token? }
// ltok (Google/Telegram kirish) bo'lsa, tarif akkauntdan olinadi — istalgan qurilmada ishlaydi.
import { planOf, PLANS, body, fail, redis, hasDB, today, ipOf, loginOf, sign } from "./_lib.js";

async function planByLogin(L) {
  const e = L.email;
  let raw = await redis("GET", "user:" + e);
  // eski telefon akkaunti (user:+998...) bo'lsa, Telegram akkauntiga ko'chiriladi
  const m = !raw && /^(\d{9,15})@telegram$/.exec(e);
  if (m) {
    const oldKey = "user:+" + m[1];
    const o = await redis("GET", oldKey);
    if (o) { await redis("SET", "user:" + e, o); await redis("DEL", oldKey); raw = o; }
  }
  const u = raw ? JSON.parse(raw) : null;
  if (!u || !PLANS[u.plan] || (u.exp && u.exp < Date.now())) return { plan: "free", exp: 0, who: e };
  return { plan: u.plan, exp: u.exp || 0, who: e };
}

export default async function handler(req, res) {
  try {
    const { token, ltok } = req.method === "POST" ? body(req) : req.query;
    const L = loginOf(ltok);
    const p = L && hasDB ? await planByLogin(L) : await planOf(token);
    const who = p.who || "ip:" + ipOf(req);
    let used = { lessons: 0, ai: 0 };
    if (hasDB) {
      const d = today();
      const [l, a] = await Promise.all([redis("SCARD", `les:${who}:${d}`), redis("GET", `ai:${who}:${d}`)]).catch(() => [0, 0]);
      used = { lessons: +l || 0, ai: +a || 0 };
    }
    const out = { plan: p.plan, exp: p.exp || 0, email: p.who, limits: PLANS[p.plan], used };
    if (L) out.token = sign({ email: L.email, plan: p.plan, exp: p.exp || 0 });
    res.status(200).json(out);
  } catch (e) { fail(res, e); }
}
