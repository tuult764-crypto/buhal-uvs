'use strict';
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

const DAY = 86400000;
const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_KEY = process.env.ADMIN_KEY || '';
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET тохируулаагүй: сервер дахин асах бүрд хэрэглэгчид гарч, дахин нэвтэрнэ.');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS access_periods (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL, stage INTEGER NOT NULL, step INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(user_id, client_id));
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_entries_user_stage ON entries(user_id, stage);
`);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'"
  });
  next();
});

/* ---------- Нэвтрэлт ---------- */
const b64 = (b) => Buffer.from(b).toString('base64url');
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(uid) { const p = `${uid}.${Date.now() + 30 * DAY}`; return `${p}.${sign(p)}`; }
function readToken(t) {
  if (!t) return null;
  const [uid, exp, sig] = t.split('.');
  if (!uid || !exp || !sig) return null;
  const good = sign(`${uid}.${exp}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Date.now() > Number(exp)) return null;
  return Number(uid);
}
function cookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return o;
}
const setSession = (res, uid) => res.append('Set-Cookie', `bv=${makeToken(uid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${PROD ? '; Secure' : ''}`);
const auth = (req, res, next) => {
  const uid = readToken(cookies(req).bv);
  if (!uid || !db.prepare('SELECT 1 FROM users WHERE id=?').get(uid)) return res.status(401).json({ error: 'Дахин нэвтэрнэ үү.' });
  req.uid = uid; next();
};

const tries = new Map();
function limited(key) {
  const now = Date.now(); const t = tries.get(key);
  if (!t || now > t.reset) { tries.set(key, { n: 1, reset: now + 15 * 60000 }); return false; }
  return ++t.n > 10;
}

/* ---------- 30 хоногийн эрх (зөвхөн сервер талд шалгана) ---------- */
// Шалгагчийн и-мэйл: бүх үе шат нээлттэй, өдрийн хязгааргүй (TESTER_EMAILS орчны хувьсагчаар өөрчилнө)
const TESTERS = new Set((process.env.TESTER_EMAILS || 'tuult764@gmail.com').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean));
function getAccess(uid) {
  const now = Date.now();
  const me = db.prepare('SELECT email FROM users WHERE id=?').get(uid);
  if (me && TESTERS.has(me.email)) return { status: 'active', day: 30, tester: true, startsAt: now, endsAt: now + 30 * DAY, daysLeft: 30 };
  const a = db.prepare('SELECT * FROM access_periods WHERE user_id=? ORDER BY ends_at DESC LIMIT 1').get(uid);
  if (!a) return { status: 'none' };
  if (now < a.starts_at) return { status: 'pending', startsAt: a.starts_at, endsAt: a.ends_at };
  if (now >= a.ends_at) return { status: 'expired', startsAt: a.starts_at, endsAt: a.ends_at };
  const day = Math.min(30, Math.floor((now - a.starts_at) / DAY) + 1);
  return { status: 'active', day, startsAt: a.starts_at, endsAt: a.ends_at, daysLeft: 30 - day + 1 };
}
// Үе шат бүрийг аль өдрүүдэд бичиж болох вэ
const canWrite = (stage, day) => ({
  1: day <= 2 || day >= 28,
  2: day >= 2 && day <= 27,
  3: day >= 3 && day <= 27,
  4: day >= 3 && day <= 27,
  5: day >= 28
}[stage]);
const writeMap = (day) => Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, canWrite(s, day)]));
const active = (req, res, next) => {
  const a = getAccess(req.uid);
  if (a.status !== 'active') return res.status(403).json({ error: 'Таны 30 хоногийн эрх идэвхгүй байна.', access: a });
  req.access = a; next();
};

app.post('/api/register', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const email = String(req.body.email || '').trim().toLowerCase();
  const pw = String(req.body.password || '');
  if (!name) return res.status(400).json({ error: 'Нэрээ оруулна уу.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'И-мэйл хаяг буруу байна.' });
  if (pw.length < 8) return res.status(400).json({ error: 'Нууц үг хамгийн багадаа 8 тэмдэгт байна.' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Энэ и-мэйлээр бүртгүүлсэн байна.' });
  const info = db.prepare('INSERT INTO users(name,email,pass_hash,created_at) VALUES(?,?,?,?)').run(name, email, await bcrypt.hash(pw, 11), Date.now());
  setSession(res, info.lastInsertRowid);
  res.json({ ok: true });
});

app.post('/api/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (limited(`${req.ip}|${email}`)) return res.status(429).json({ error: 'Хэт олон оролдлоо. 15 минутын дараа дахин оролдоно уу.' });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.pass_hash))) return res.status(401).json({ error: 'И-мэйл эсвэл нууц үг буруу байна.' });
  setSession(res, u.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.append('Set-Cookie', 'bv=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true }); });

const payCode = (id) => 'BV' + (1000 + id);
// Үнэ: PRICE_MNT, SALE_PRICE_MNT орчны хувьсагчаар өөрчилнө. SALE_PRICE_MNT=0 бол хямдрал харагдахгүй.
const PRICE = process.env.PRICE_MNT || '15000';
const saleRaw = process.env.SALE_PRICE_MNT === undefined ? '10000' : process.env.SALE_PRICE_MNT;
const SALE = Number(saleRaw) > 0 ? saleRaw : null;
app.get('/api/me', auth, (req, res) => {
  const u = db.prepare('SELECT id,name,email FROM users WHERE id=?').get(req.uid);
  const access = getAccess(req.uid);
  const requested = !!db.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").get(req.uid);
  res.json({ user: u, access, write: access.status === 'active' ? (access.tester ? writeMap(15) && { 1: true, 2: true, 3: true, 4: true, 5: true } : writeMap(access.day)) : {},
    payment: { code: payCode(u.id), price: PRICE, salePrice: SALE, requested } });
});

app.post('/api/payment-request', auth, (req, res) => {
  if (!db.prepare("SELECT 1 FROM payments WHERE user_id=? AND status='pending'").get(req.uid))
    db.prepare('INSERT INTO payments(user_id,status,created_at) VALUES(?,?,?)').run(req.uid, 'pending', Date.now());
  res.json({ ok: true });
});

/* ---------- Бичлэг ---------- */
const CID = /^[A-Za-z0-9-]{8,64}$/;
app.get('/api/entries', auth, active, (req, res) => {
  const stage = Number(req.query.stage);
  const rows = stage
    ? db.prepare('SELECT client_id,stage,step,text,created_at,updated_at FROM entries WHERE user_id=? AND stage=? ORDER BY created_at').all(req.uid, stage)
    : db.prepare('SELECT client_id,stage,step,text,created_at,updated_at FROM entries WHERE user_id=? ORDER BY stage,created_at').all(req.uid);
  res.json({ entries: rows });
});

app.post('/api/entries', auth, active, (req, res) => {
  const { client_id } = req.body;
  const stage = Number(req.body.stage), step = Number(req.body.step || 0);
  const text = String(req.body.text || '').trim();
  if (!CID.test(client_id || '')) return res.status(400).json({ error: 'Бичлэгийн дугаар буруу байна.' });
  if (![1, 2, 3, 4, 5].includes(stage) || !(step >= 0 && step <= 9)) return res.status(400).json({ error: 'Үе шат буруу байна.' });
  if (!text) return res.status(400).json({ error: 'Бичлэг хоосон байна.' });
  if (text.length > 5000) return res.status(400).json({ error: 'Бичлэг хэт урт байна (5000 тэмдэгтээс бага).' });
  const now = Date.now();
  const ex = db.prepare('SELECT stage FROM entries WHERE user_id=? AND client_id=?').get(req.uid, client_id);
  if (!req.access.tester && !canWrite(ex ? ex.stage : stage, req.access.day)) return res.status(403).json({ error: 'Энэ үе шатад одоогоор бичих боломжгүй байна.' });
  if (ex) db.prepare('UPDATE entries SET text=?, updated_at=? WHERE user_id=? AND client_id=?').run(text, now, req.uid, client_id);
  else db.prepare('INSERT INTO entries(user_id,client_id,stage,step,text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(req.uid, client_id, stage, step, text, now, now);
  res.json({ ok: true });
});

app.delete('/api/entries/:cid', auth, active, (req, res) => {
  db.prepare('DELETE FROM entries WHERE user_id=? AND client_id=?').run(req.uid, req.params.cid);
  res.json({ ok: true });
});

/* ---------- Хувийн мэдээлэл: татах, устгах (эрх дууссан ч ажиллана) ---------- */
app.get('/api/export', auth, (req, res) => {
  const rows = db.prepare('SELECT stage,step,text,created_at,updated_at FROM entries WHERE user_id=? ORDER BY stage,created_at').all(req.uid);
  res.set('Content-Disposition', 'attachment; filename="buhal-uvs-bichlegvvd.json"');
  res.json({ entries: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString() })) });
});

app.delete('/api/account', auth, async (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.uid);
  if (!(await bcrypt.compare(String(req.body.password || ''), u.pass_hash))) return res.status(401).json({ error: 'Нууц үг буруу байна.' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.uid);
  res.append('Set-Cookie', 'bv=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

/* ---------- Админ: төлбөр шалгаад эрх олгох ---------- */
const adminFails = new Map();
function adminOk(req, res) {
  const now = Date.now();
  const f = adminFails.get(req.ip) || { n: 0, reset: now + 15 * 60000 };
  if (now > f.reset) { f.n = 0; f.reset = now + 15 * 60000; }
  if (f.n >= 10) { res.status(429).json({ error: 'Хэт олон буруу оролдлоо. 15 минутын дараа дахин оролдоно уу.' }); return false; }
  const h = (x) => crypto.createHash('sha256').update(String(x)).digest();
  const ok = ADMIN_KEY && crypto.timingSafeEqual(h(req.get('x-admin-key') || ''), h(ADMIN_KEY));
  if (!ok) { f.n++; adminFails.set(req.ip, f); res.status(403).json({ error: 'Зөвшөөрөлгүй.' }); return false; }
  return true;
}

app.get('/api/admin/payments', (req, res) => {
  if (!adminOk(req, res)) return;
  const rows = db.prepare("SELECT p.id, p.user_id, p.created_at, u.name, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at").all();
  res.json({ payments: rows.map((r) => ({ id: r.id, code: payCode(r.user_id), name: r.name, email: r.email, created_at: r.created_at })) });
});

app.post('/api/admin/grant', (req, res) => {
  if (!adminOk(req, res)) return;
  const q = String(req.body.email || req.body.code || '').trim();
  const m = /^BV(\d+)$/i.exec(q);
  const u = m ? db.prepare('SELECT id FROM users WHERE id=?').get(Number(m[1]) - 1000)
              : db.prepare('SELECT id FROM users WHERE email=?').get(q.toLowerCase());
  if (!u) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй.' });
  const now = Date.now();
  db.prepare('INSERT INTO access_periods(user_id,starts_at,ends_at,created_at) VALUES(?,?,?,?)').run(u.id, now, now + 30 * DAY, now);
  db.prepare("UPDATE payments SET status='done' WHERE user_id=? AND status='pending'").run(u.id);
  res.json({ ok: true, startsAt: now, endsAt: now + 30 * DAY });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Олдсонгүй.' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Бухал өвс ажиллаж байна: http://localhost:${PORT}`));
