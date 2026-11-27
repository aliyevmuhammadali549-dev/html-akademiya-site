// Tashriflar statistikasi: har sahifa ochilganda sayt shu yerga yozadi (sendBeacon).
import { redis, hasDB, today, normEmail } from "./_lib.js";

const raw = req => new Promise(ok => { let d = ""; req.on("data", c => d += c); req.on("end", () => ok(d)); req.on("error", () => ok("")); });

export default async function handler(req, res) {
  if (req.method !== "POST" || !hasDB) return res.status(204).end();
  try {
    let b = req.body;
    if (!b || typeof b !== "object") { try { b = JSON.parse(typeof b === "string" ? b : await raw(req)); } catch { b = {}; } }
    const vid = String(b.vid || "").replace(/[^\w-]/g, "").slice(0, 40);
    if (vid.length < 8) return res.status(204).end();
    const d = today(), page = String(b.p || "home").replace(/[^\w-]/g, "").slice(0, 30) || "home";
    const ttl = 120 * 86400;
    const cmds = [
      ["PFADD", "v:all", vid], ["PFADD", "v:" + d, vid], ["EXPIRE", "v:" + d, ttl],
      ["INCR", "pv:all"], ["INCR", "pv:" + d], ["EXPIRE", "pv:" + d, ttl],
      ["HINCRBY", "pg:" + d, page.replace(/-\d+$/, ""), 1], ["EXPIRE", "pg:" + d, ttl],
    ];
    const email = normEmail(b.u);
    if (email.includes("@") || /^\+?\d{9,15}$/.test(email)) {
      const name = String(b.n || "").slice(0, 60);
      const old = JSON.parse((await redis("HGET", "users", email)) || "null");
      cmds.push(["HSET", "users", email, JSON.stringify({ name: name || old?.name || "", first: old?.first || Date.now(), last: Date.now() })]);
      if (!old) cmds.push(["INCR", "reg:" + d], ["EXPIRE", "reg:" + d, ttl]);
    }
    for (const c of cmds) await redis(...c);
    res.status(204).end();
  } catch { res.status(204).end(); }
}
