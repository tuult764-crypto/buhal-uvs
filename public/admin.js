'use strict';
const d = (ms) => { const t = new Date(ms); return `${t.getFullYear()}.${String(t.getMonth() + 1).padStart(2, '0')}.${String(t.getDate()).padStart(2, '0')}`; };
document.getElementById('f').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = 'Түр хүлээнэ үү...';
  try {
    const r = await fetch('/api/admin/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': document.getElementById('key').value },
      body: JSON.stringify({ email: document.getElementById('email').value })
    });
    const j = await r.json();
    msg.textContent = r.ok ? `Эрх нээгдлээ: ${d(j.startsAt)} - ${d(j.endsAt)}` : (j.error || 'Алдаа гарлаа.');
  } catch { msg.textContent = 'Сүлжээ тасарсан байна. Дахин оролдоно уу.'; }
});
