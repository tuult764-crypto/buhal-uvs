'use strict';
/* ===== Туслах функцүүд ===== */
const $app = document.getElementById('app');
const el = (t, a = {}, ...c) => {
  const e = document.createElement(t);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  c.flat().forEach((x) => { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(x)); });
  return e;
};
const toast = (msg) => { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 3200); };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };

async function api(method, url, body) {
  let r;
  try {
    r = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('Сүлжээ тасарсан байна.'); e.offline = true; throw e; }
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(d.error || 'Алдаа гарлаа. Дахин оролдоно уу.'); e.status = r.status; throw e; }
  return d;
}

function confirmBox(title, text, okLabel) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('dlg');
    dlg.replaceChildren(
      el('h3', {}, title), el('p', { class: 'muted' }, text),
      el('div', { class: 'row end' },
        el('button', { class: 'btn ghost small', onclick: () => { dlg.close(); resolve(false); } }, 'Болих'),
        el('button', { class: 'btn danger small', onclick: () => { dlg.close(); resolve(true); } }, okLabel))
    );
    dlg.showModal();
  });
}

/* ===== Үе шатууд ===== */
const STAGES = [
  { n: 1, world: 'night', place: 'Шөнийн ой', title: 'Дотор минь юу байна вэ?', opens: 1 },
  { n: 2, world: 'lake', place: 'Толин нуур', title: 'Буруутныг өөрөөсөө хайх', opens: 2 },
  { n: 3, world: 'bridge', place: 'Манантай гүүр', title: 'Бодлоо шалгах', opens: 3 },
  { n: 4, world: 'peak', place: 'Одот уул', title: 'Миний хүсэл', opens: 3 },
  { n: 5, world: 'gate', place: 'Алтан хаалга', title: 'Миний аяллын төгсгөл', opens: 28 }
];
const READY = [1]; // зөвхөн бэлэн болсон үе шатууд нээгдэнэ

const S = { me: null, entries: [], mode: 'login' };

/* ===== Бичлэгийг сүлжээгүй үед ч алдахгүй хадгалах (дараалал) ===== */
const QK = 'bv_queue';
const EK = () => 'bv_entries_' + S.me.user.id;
const getQ = () => { try { return JSON.parse(localStorage.getItem(QK) || '[]'); } catch { return []; } };
const setQ = (q) => localStorage.setItem(QK, JSON.stringify(q));
const mineQ = () => getQ().filter((o) => o.uid === S.me.user.id);
function enqueue(op) {
  const q = getQ().filter((o) => !(o.uid === op.uid && o.client_id === op.client_id));
  q.push(op); setQ(q); localStorage.setItem(EK(), JSON.stringify(S.entries)); setStatus(); flush();
}
let flushing = false;
async function flush() {
  if (flushing || !S.me) return;
  flushing = true;
  try {
    for (;;) {
      const op = mineQ()[0];
      if (!op) break;
      try {
        if (op.t === 'save') await api('POST', '/api/entries', { client_id: op.client_id, stage: op.stage, step: op.step, text: op.text });
        else await api('DELETE', '/api/entries/' + op.client_id);
      } catch (e) {
        if (e.offline) break;
        toast(e.message); // сервер татгалзсан: давтан оролдохгүй
      }
      setQ(getQ().filter((o) => !(o.uid === op.uid && o.client_id === op.client_id && o.t === op.t)));
    }
  } finally { flushing = false; setStatus(); }
}
function setStatus() {
  const n = document.getElementById('save-state'); if (!n) return;
  const pending = S.me ? mineQ().length : 0;
  n.className = 'save-state' + (pending ? ' off' : '');
  n.textContent = pending ? 'Төхөөрөмж дээр хадгалагдсан. Сүлжээ холбогдоход автоматаар илгээнэ.' : 'Бүх бичлэг хадгалагдсан.';
}
window.addEventListener('online', flush);

async function loadEntries() {
  await flush();
  if (!mineQ().length) {
    try { S.entries = (await api('GET', '/api/entries')).entries; localStorage.setItem(EK(), JSON.stringify(S.entries)); return; }
    catch (e) { if (!e.offline) throw e; }
  }
  try { S.entries = JSON.parse(localStorage.getItem(EK()) || '[]'); } catch { S.entries = []; }
}

/* ===== Нэвтрэлт ===== */
async function boot() {
  try { S.me = await api('GET', '/api/me'); } catch { S.me = null; }
  if (!S.me) return showAuth();
  if (S.me.access.status !== 'active') return showNoAccess();
  try { await loadEntries(); } catch (e) { toast(e.message); }
  showHome();
}
function setWorld(w) { document.body.dataset.world = w; }
function mount(...nodes) { const v = el('div', { class: 'view' }, nodes); $app.replaceChildren(v); window.scrollTo(0, 0); return v; }

function showAuth() {
  setWorld('night');
  const reg = S.mode === 'register';
  const f = { name: el('input', { id: 'name', autocomplete: 'name', maxlength: 60 }), email: el('input', { id: 'email', type: 'email', autocomplete: 'email' }), pw: el('input', { id: 'pw', type: 'password', autocomplete: reg ? 'new-password' : 'current-password' }) };
  const msg = el('p', { class: 'muted', role: 'alert' });
  const go = async (ev) => {
    ev.preventDefault(); msg.textContent = '';
    try {
      await api('POST', reg ? '/api/register' : '/api/login', { name: f.name.value, email: f.email.value, password: f.pw.value });
      boot();
    } catch (e) { msg.textContent = e.message; }
  };
  mount(
    el('div', { class: 'hero' }, el('h1', {}, 'Бухал өвс'), el('div', { class: 'tag' }, 'Би-гээ олох 30 хоногийн аялал')),
    el('form', { class: 'panel auth', onsubmit: go },
      reg && [el('label', { for: 'name' }, 'Нэр'), f.name],
      el('label', { for: 'email' }, 'И-мэйл'), f.email,
      el('label', { for: 'pw' }, reg ? 'Нууц үг (8-аас дээш тэмдэгт)' : 'Нууц үг'), f.pw,
      el('div', { class: 'row', style: 'margin-top:20px' },
        el('button', { class: 'btn', type: 'submit' }, reg ? 'Бүртгүүлэх' : 'Нэвтрэх'),
        el('button', { class: 'link', type: 'button', onclick: () => { S.mode = reg ? 'login' : 'register'; showAuth(); } }, reg ? 'Бүртгэлтэй юу? Нэвтрэх' : 'Анх удаагаа уу? Бүртгүүлэх')),
      msg)
  );
}

function topBar() {
  const a = S.me.access;
  return el('div', { class: 'top' },
    el('span', { class: 'brand' }, 'Бухал өвс'),
    el('div', { class: 'row' },
      a.status === 'active' && el('span', { class: 'pill' }, `${a.day}-р өдөр / 30`),
      el('button', { class: 'btn ghost small', onclick: showSettings }, 'Миний мэдээлэл'),
      el('button', { class: 'btn ghost small', onclick: logout }, 'Гарах')));
}
async function logout() {
  await flush();
  if (mineQ().length && !(await confirmBox('Илгээгдээгүй бичлэг байна', 'Сүлжээ холбогдоогүй тул зарим бичлэг серверт хараахан очоогүй байна. Гарсан ч төхөөрөмж дээр хадгалагдсан хэвээр, дараагийн нэвтрэлтээр илгээгдэнэ.', 'Гарах'))) return;
  try { await api('POST', '/api/logout'); } catch {}
  S.me = null; S.mode = 'login'; showAuth();
}

function showNoAccess() {
  setWorld('night');
  const a = S.me.access, p = S.me.payment || {};
  const text = a.status === 'expired'
    ? `Таны 30 хоногийн аялал ${fmtDate(a.endsAt)}-нд дууссан. Бичсэн зүйлсээ "Миний мэдээлэл" хэсгээс татаж авч болно.`
    : a.status === 'pending' ? `Таны эрх ${fmtDate(a.startsAt)}-нд эхэлнэ.`
    : 'Аялалаа эхлэхийн тулд 30 хоногийн эрх идэвхжүүлнэ үү.';
  const money = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '₮';
  const pay = a.status === 'pending' ? null : el('div', { class: 'panel' },
    el('h3', {}, a.status === 'expired' ? 'Аяллыг дахин эхлэх' : 'Эрх идэвхжүүлэх'),
    p.price && (p.salePrice
      ? el('p', {}, '30 хоногийн эрх: ', el('s', { class: 'muted' }, money(p.price)), ' ', el('strong', { style: 'color:var(--gold);font-size:1.3rem' }, money(p.salePrice)), ' (урьдчилсан хямдрал)')
      : el('p', {}, `30 хоногийн эрхийн үнэ: ${money(p.price)}`)),
    el('p', {}, 'Доорх QR кодоор төлбөрөө шилжүүлнэ үү. Гүйлгээний утга дээр өөрийн и-мэйл хаягийг яг доорх хэлбэрээр, алдаагүй бичнэ:'),
    el('div', { class: 'quote' }, S.me.user.email),
    el('button', { class: 'btn ghost small', onclick: async () => { try { await navigator.clipboard.writeText(S.me.user.email); toast('И-мэйл хуулагдлаа.'); } catch { toast('Хуулж чадсангүй. Гараар бичнэ үү.'); } } }, 'И-мэйлээ хуулах'),
    el('img', { src: '/qr.png', alt: 'Төлбөрийн QR код', style: 'width:240px;max-width:100%;background:#fff;padding:10px;border-radius:12px;display:block;margin:14px 0' }),
    p.requested
      ? el('p', { class: 'muted' }, 'Таны хүсэлт хүлээгдэж байна. Төлбөр шалгагдмагц эрх нээгдэнэ. Доорх товчоор шалгана уу.')
      : el('p', { class: 'muted' }, 'Төлсний дараа "Би төлсөн" товчийг дарна уу.'),
    el('div', { class: 'row' },
      !p.requested && el('button', { class: 'btn', onclick: async () => { try { await api('POST', '/api/payment-request'); await boot(); toast('Хүсэлт илгээгдлээ.'); } catch (e) { toast(e.message); } } }, 'Би төлсөн'),
      el('button', { class: 'btn ghost', onclick: () => boot() }, 'Эрх нээгдсэн эсэхийг шалгах')));
  mount(topBar(), el('div', { class: 'hero', style: 'padding:4vh 0 18px' }, el('h2', {}, `Сайн байна уу, ${S.me.user.name}`), el('p', { class: 'muted', style: 'margin:0 auto' }, text)), pay);
}

/* ===== Нүүр: аяллын зам ===== */
function showHome() {
  setWorld('night');
  const a = S.me.access;
  const stops = STAGES.map((s) => {
    const dayOpen = a.day >= s.opens;
    const ready = READY.includes(s.n);
    const open = dayOpen && ready;
    const state = open ? 'Нээлттэй. Орох' : dayOpen ? 'Дараагийн хувилбарт нэмэгдэнэ' : `${s.opens}-р өдөр нээгдэнэ`;
    return el(open ? 'button' : 'div', { class: 'stop ' + (open ? 'open' : 'locked'), onclick: open ? () => showStage(s.n) : null },
      el('h3', {}, s.title), el('div', { class: 'world' }, s.place), el('div', { class: 'state' }, state));
  });
  const journey = el('div', { class: 'journey' }, stops);
  mount(topBar(), el('h2', {}, 'Аяллын зам'),
    el('p', { class: 'muted' }, 'Нээлттэй болсон хаалгаар орж, өөрийнхөө хурдаар алхана уу. Өмнөх үе шат руугаа хүссэн үедээ буцаж харж болно.'), journey);
  // Аялагчийг одоогийн үе шат дээр байрлуулна
  const idx = Math.max(0, STAGES.filter((s) => a.day >= s.opens && READY.includes(s.n)).length - 1);
  const t = el('div', { class: 'traveler', 'aria-hidden': 'true', style: `top:${stops[idx].offsetTop + 30}px` });
  t.innerHTML = '<svg viewBox="0 0 34 46"><path d="M17 2c4 0 6 4 6 8 0 3-1 5-2 7 4 4 8 14 10 29H3c2-15 6-25 10-29-1-2-2-4-2-7 0-4 2-8 6-8z" fill="#3a2468"/><circle cx="17" cy="11" r="4" fill="#f7e6b8"/><circle cx="28" cy="30" r="3.2" fill="#e9c46a"/></svg>';
  journey.append(t);
}

/* ===== 1-р үе шат ===== */
function showStage(n) {
  if (n !== 1) return showHome();
  const st = STAGES[0]; setWorld(st.world);
  const writable = !!S.me.write[1];
  const step = S.me.access.day >= 28 ? 1 : 0;
  const DK = `bv_draft_${S.me.user.id}_1_${step}`;
  const list = el('ul', { class: 'entries' });
  const draw = () => {
    const items = S.entries.filter((e) => e.stage === 1).sort((a, b) => a.created_at - b.created_at);
    list.replaceChildren(...(items.length ? items.map(row) : [el('li', { class: 'muted' }, 'Одоохондоо бичлэг алга. Эхний бодлоо дээр бичээрэй.')]));
  };
  const row = (e) => {
    const li = el('li', { class: 'entry' });
    const view = () => {
      li.replaceChildren(el('p', {}, e.text), writable && el('div', { class: 'row' },
        el('button', { class: 'btn ghost small', onclick: edit }, 'Засах'),
        el('button', { class: 'btn danger small', onclick: remove }, 'Устгах')));
    };
    const edit = () => {
      const ta = el('textarea', { maxlength: 5000, 'aria-label': 'Бичлэгээ засах' }); ta.value = e.text;
      li.replaceChildren(ta, el('div', { class: 'row' },
        el('button', { class: 'btn small', onclick: () => {
          const v = ta.value.trim(); if (!v) return toast('Бичлэг хоосон байна.');
          e.text = v; e.updated_at = Date.now();
          enqueue({ t: 'save', uid: S.me.user.id, client_id: e.client_id, stage: 1, step: e.step, text: v }); view();
        } }, 'Хадгалах'),
        el('button', { class: 'btn ghost small', onclick: view }, 'Болих')));
      ta.focus();
    };
    const remove = async () => {
      if (!(await confirmBox('Энэ бичлэгийг устгах уу?', 'Устгасан бичлэгийг буцааж сэргээх боломжгүй.', 'Устгах'))) return;
      S.entries = S.entries.filter((x) => x.client_id !== e.client_id);
      enqueue({ t: 'del', uid: S.me.user.id, client_id: e.client_id }); draw();
    };
    view(); return li;
  };

  const ta = el('textarea', { id: 'new', maxlength: 5000, placeholder: 'Энд бич...' });
  ta.value = localStorage.getItem(DK) || '';
  ta.addEventListener('input', () => localStorage.setItem(DK, ta.value)); // бичих явцад ноорог автоматаар хадгалагдана
  const add = () => {
    const v = ta.value.trim(); if (!v) return toast('Эхлээд юм бичнэ үү.');
    const e = { client_id: uuid(), stage: 1, step, text: v, created_at: Date.now(), updated_at: Date.now() };
    S.entries.push(e); ta.value = ''; localStorage.removeItem(DK);
    enqueue({ t: 'save', uid: S.me.user.id, client_id: e.client_id, stage: 1, step, text: v }); draw(); ta.focus();
  };
  ta.addEventListener('keydown', (ev) => { if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') add(); });

  draw();
  mount(
    el('div', { class: 'top' }, el('button', { class: 'btn ghost small', onclick: showHome }, 'Аяллын зам руу'), el('span', { class: 'pill' }, `${S.me.access.day}-р өдөр / 30`)),
    el('h2', {}, st.title), el('div', { class: 'muted', style: 'margin:-6px 0 14px' }, st.place),
    el('div', { class: 'quote' }, 'Одоо чи хэн нэгэнд таалагдах гэж хичээх шаардлагагүй. Зөв, буруу бодол гэж санаа зоволтгүй. Хэний ч өмнө өөрийгөө зөвтгөх шаардлагагүй. Зүгээр л дотор байгаа бүхнээ бич.'),
    el('p', { class: 'muted' }, 'Хэн ч мэдэхгүй, юунаас ч эмээхгүй. Таны бичсэн зүйлийг зөвхөн та харна.'),
    writable
      ? el('div', { class: 'panel' },
          el('label', { for: 'new' }, 'Намайг уурлуулж, бухимдуулж, гомдоож, үзэн ядуулж байгаа зүйл:'), ta,
          el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: add }, 'Жагсаалтад нэмэх'), el('span', { class: 'muted' }, 'Нэг дор олон зүйл бичиж болно.')))
      : el('p', { class: 'panel muted' }, 'Энэ үе шатад одоо бичих цаг биш байна. 28-р өдрөөс дахин нээгдэнэ. Одоохондоо бичсэнээ унших боломжтой.'),
    list, el('div', { id: 'save-state', class: 'save-state' })
  );
  setStatus();
}

/* ===== Миний мэдээлэл ===== */
function showSettings() {
  const msg = el('p', { class: 'muted', role: 'alert' });
  const pw = el('input', { type: 'password', id: 'dpw', autocomplete: 'current-password' });
  const del = async () => {
    if (!(await confirmBox('Бүртгэлээ бүрэн устгах уу?', 'Таны бүх бичлэг, хүслийн карт, бүртгэл серверээс устна. Үүнийг буцаах боломжгүй.', 'Бүгдийг устгах'))) return;
    try {
      await api('DELETE', '/api/account', { password: pw.value });
      Object.keys(localStorage).filter((k) => k.startsWith('bv_')).forEach((k) => localStorage.removeItem(k));
      S.me = null; S.mode = 'register'; toast('Бүртгэл болон бүх мэдээлэл устгагдлаа.'); showAuth();
    } catch (e) { msg.textContent = e.message; }
  };
  mount(
    el('div', { class: 'top' }, el('button', { class: 'btn ghost small', onclick: () => (S.me.access.status === 'active' ? showHome() : showNoAccess()) }, 'Буцах')),
    el('h2', {}, 'Миний мэдээлэл'),
    el('div', { class: 'panel' },
      el('h3', {}, 'Бичлэгээ татаж авах'),
      el('p', { class: 'muted' }, 'Таны бүх бичлэгийг нэг файлаар хадгалж авна.'),
      el('a', { class: 'btn ghost small', href: '/api/export', download: '', style: 'text-decoration:none;display:inline-block' }, 'Файл татах')),
    el('div', { class: 'panel', style: 'margin-top:16px' },
      el('h3', {}, 'Бүртгэлээ устгах'),
      el('p', { class: 'muted' }, 'Нууц үгээ оруулаад баталгаажуулна.'),
      el('label', { for: 'dpw' }, 'Нууц үг'), pw,
      el('div', { class: 'row', style: 'margin-top:14px' }, el('button', { class: 'btn danger small', onclick: del }, 'Бүртгэл болон бүх мэдээллээ устгах')), msg)
  );
}

/* ===== Салхинд хийсэх гэрэл, тоосонцор ===== */
(function fx() {
  const c = document.getElementById('fx'), x = c.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w, h, P = [];
  const size = () => { w = c.width = innerWidth; h = c.height = innerHeight; };
  const make = () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.8 + .4, v: Math.random() * .25 + .08, d: Math.random() * 6.28, a: Math.random() * .6 + .2, g: Math.random() < .25 });
  size(); P = Array.from({ length: reduce ? 20 : 55 }, make);
  addEventListener('resize', size);
  (function tick() {
    x.clearRect(0, 0, w, h);
    for (const p of P) {
      if (!reduce) { p.y -= p.v; p.x += Math.sin((p.d += .01)) * .3; if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; } }
      const tw = reduce ? p.a : p.a * (.6 + .4 * Math.sin(p.d * 3));
      x.beginPath(); x.fillStyle = p.g ? `rgba(233,196,106,${tw})` : `rgba(201,170,235,${tw * .7})`;
      x.shadowColor = p.g ? '#e9c46a' : '#b99bdc'; x.shadowBlur = p.g ? 10 : 4; x.arc(p.x, p.y, p.r, 0, 6.28); x.fill();
    }
    if (!document.hidden && !reduce) requestAnimationFrame(tick); else if (!reduce) setTimeout(tick, 500);
  })();
})();

boot();
