// Aktivatsiya kodini ishlatish: { code, email } -> { plan, exp, token }
import { redis, sign, normEmail, body, fail, ipOf, PLANS, loginOf } from "./_lib.js";
import { ident, botPost } from "./bsess.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { code, email, ltok } = body(req);
    const L = loginOf(ltok);                       // tasdiqlangan kirish bo'lsa, aynan o'sha akkauntga yoziladi
    const c = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    const e = (L ? L.email : normEmail(email)).replace(/[\s()-]/g, "");
    if (!/^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c) || !(e.includes("@") || /^\+?\d{7,15}$/.test(e))) return res.status(400).json({ error: "bad code" });

    // urinishlar cheklovi: bir IP'dan daqiqasiga 8 ta
    const k = "try:" + ipOf(req);
    const n = await redis("INCR", k);
    if (n === 1) await redis("EXPIRE", k, 60);
    if (n > 8) return res.status(429).json({ error: "slow down" });

    const raw0 = await redis("GET", "code:" + c);
    if (!raw0) return res.status(404).json({ error: "invalid code" });
    const info0 = JSON.parse(raw0);
    if (info0.plan === "xp" || info0.plan === "streak") {     // yulduzcha / seriya kodi — botdagi akkauntga yoziladi
      if (!L) return res.status(401).json({ error: "login", code: "login" });
      if (!(await redis("GETDEL", "code:" + c))) return res.status(404).json({ error: "invalid code" });
      try {
        await botPost("/api/v1/site/grant", { ...(await ident(L)), [info0.plan]: info0.amt });
      } catch (err) {
        await redis("SET", "code:" + c, raw0);              // bot javob bermasa kod yo'qolmasin
        return res.status(503).json({ error: "bot offline" });
      }
      await redis("LPUSH", "log", JSON.stringify({ t: Date.now(), email: e, code: c, plan: info0.plan, amt: info0.amt }));
      await redis("LTRIM", "log", 0, 499);
      return res.status(200).json({ reward: info0.plan, amt: info0.amt });
    }
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

    if (L) { try { await botPost("/api/v1/site/grant", { ...(await ident(L)), plan: info.plan, exp }); } catch {} }   // tarif Telegram botda ham bo'lsin
    res.status(200).json({ plan: info.plan, exp, token: sign({ email: e, plan: info.plan, exp }) });
  } catch (e) { fail(res, e); }
}
