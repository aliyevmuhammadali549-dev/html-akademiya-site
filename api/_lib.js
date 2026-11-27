// Umumiy yordamchilar: tariflar, Redis (Upstash REST), imzoli token.
// Vercel env: KV_REST_API_URL + KV_REST_API_TOKEN (Upstash ulanganda o'zi qo'shiladi), ADMIN_KEY (o'zing yozasan).
import crypto from "node:crypto";

export const PLANS = {
  free:    { html: 10, css: 0,  perDay: 3,   videos: 3,   ai: 5 },
  premium: { html: 20, css: 20, perDay: 10,  videos: 4,   ai: 50 },
  alpha:   { html: 30, css: 30, perDay: 1e9, videos: 1e9, ai: 1e9 },
};

const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasDB = !!(RURL && RTOK);

export async function redis(...cmd) {
  if (!hasDB) throw { status: 503, message: "storage not connected" };
  const r = await fetch(RURL, { method: "POST", headers: { Authorization: `Bearer ${RTOK}`, "content-type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw { status: 502, message: j.error || "redis " + r.status };
  return j.result;
}

const SECRET = () => (process.env.ADMIN_KEY || "") + "|ha-token";
const b64u = s => Buffer.from(s).toString("base64url");
export function sign(obj) {
  const p = b64u(JSON.stringify(obj));
  return p + "." + crypto.createHmac("sha256", SECRET()).update(p).digest("base64url");
}
export function verify(tok) {
  if (!tok || typeof tok !== "string" || !process.env.ADMIN_KEY) return null;
  const [p, s] = tok.split(".");
  if (!p || !s) return null;
  const want = crypto.createHmac("sha256", SECRET()).update(p).digest("base64url");
  if (s.length !== want.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
}

export const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   // Toshkent vaqti
export const ipOf = req => ((req.headers["x-forwarded-for"] || "").split(",")[0] || "x").trim();
export const normEmail = e => String(e || "").trim().toLowerCase().slice(0, 120);

// Token -> joriy tarif (Redis'dagi yozuv bilan tekshiriladi: admin bekor qilsa ham ishlaydi)
export async function planOf(token) {
  const t = verify(token);
  if (!t || !t.email) return { plan: "free", who: null };
  if (hasDB) {
    const raw = await redis("GET", "user:" + t.email).catch(() => null);
    const u = raw ? JSON.parse(raw) : null;
    if (!u || (u.exp && u.exp < Date.now())) return { plan: "free", who: t.email };
    return { plan: PLANS[u.plan] ? u.plan : "free", exp: u.exp || 0, who: t.email };
  }
  if (t.exp && t.exp < Date.now()) return { plan: "free", who: t.email };
  return { plan: PLANS[t.plan] ? t.plan : "free", exp: t.exp || 0, who: t.email };
}

export function body(req) {
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body || {};
}
export function fail(res, e) {
  res.status(e?.status || 500).json({ error: e?.message || "error" });
}

// Admin sessiyasi: HttpOnly cookie (JS o'qiy olmaydi), 12 soat
export const ADMIN_EMAIL = () => (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
export function cookie(req, name) {
  const m = (req.headers.cookie || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
export function isAdmin(req) {
  const t = verify(cookie(req, "ha_adm"));
  return !!(t && t.adm && t.exp > Date.now() && t.email === (ADMIN_EMAIL() || "admin"));
}

// Kirish sessiyasi (Google/Telegram tasdiqlagan) -> email yoki null
export function loginOf(ltok) {
  const t = verify(ltok);
  return t && t.lg && t.email && t.exp > Date.now() ? t : null;
}
