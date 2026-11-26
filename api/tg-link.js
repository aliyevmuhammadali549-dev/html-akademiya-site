// Bot (Render) foydalanuvchi raqamini shu yerga bog'laydi. So'rov bot tokeni bilan imzolangan (HMAC-SHA256).
// Agar shu raqamga saytda kod so'ralgan bo'lsa, kod javobda qaytadi va bot uni darhol yuboradi.
import crypto from "node:crypto";
import { redis, fail } from "./_lib.js";
import { newCode } from "./auth.js";

export const config = { api: { bodyParser: false } };
const raw = req => new Promise((ok, no) => { let d = ""; req.on("data", c => d += c); req.on("end", () => ok(d)); req.on("error", no); });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(404).json({ error: "not found" });
  try {
    const T = process.env.TELEGRAM_BOT_TOKEN || "", body = await raw(req), sig = String(req.headers["x-sig"] || "");
    const want = crypto.createHmac("sha256", T).update(body).digest("hex");
    if (!T || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.status(401).json({ error: "bad sig" });
    const { phone, chat_id, name } = JSON.parse(body);
    const p = String(phone || "").replace(/\D/g, "");
    if (p.length < 9 || !chat_id) return res.status(400).json({ error: "bad data" });
    await redis("SET", "tg:" + p, JSON.stringify({ chat_id, name: String(name || "").slice(0, 80) }));
    const pending = await redis("GETDEL", "tgpend:" + p);
    res.status(200).json({ ok: true, code: pending ? await newCode(p) : null });
  } catch (e) { fail(res, e); }
}
