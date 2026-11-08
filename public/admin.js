'use strict';
const $ = (id) => document.getElementById(id);
const d = (ms) => { const t = new Date(ms); return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}`; };
const dt = (ms) => { const t = new Date(ms); return `${d(ms)} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`; };
const call = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'x-admin-key': $('key').value }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Алдаа гарлаа.');
  return j;
};
async function grant(who) {
  const j = await call('POST', '/api/admin/grant', who.includes('@') ? { email: who } : { code: who });
  $('msg').textContent = `Эрх нээгдлээ: ${d(j.startsAt)} - ${d(j.endsAt)}`;
}
async function load() {
  $('msg').textContent = 'Түр хүлээнэ үү...';
  try {
    const { payments } = await call('GET', '/api/admin/payments');
    const ul = $('list'); ul.replaceChildren();
    $('msg').textContent = payments.length ? '' : 'Хүлээгдэж буй хүсэлт алга.';
    for (const p of payments) {
      const li = document.createElement('li'); li.className = 'entry';
      const t = document.createElement('p'); t.textContent = `${p.email}  ·  ${p.name}  ·  ${dt(p.created_at)}`;
      const b = document.createElement('button'); b.className = 'btn small'; b.type = 'button'; b.textContent = 'Баталгаажуулах';
      b.onclick = async () => { try { await grant(p.code); li.remove(); } catch (e) { $('msg').textContent = e.message; } };
      li.append(t, b); ul.append(li);
    }
  } catch (e) { $('msg').textContent = e.message; }
}
$('load').addEventListener('click', load);
$('f').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('msg').textContent = 'Түр хүлээнэ үү...';
  try { await grant($('who').value.trim()); } catch (e) { $('msg').textContent = e.message; }
});
