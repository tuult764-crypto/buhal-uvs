'use strict';
/* ===== 3, 4, 5-р үе шат, хүслийн карт хэвлэх, алтан карт ===== */
const pillText = () => (S.me.access.tester ? 'Шалгагчийн горим' : `${S.me.access.day}-р өдөр / 30`);
const getRec = (cid) => { const e = S.entries.find((x) => x.client_id === cid); if (!e) return null; try { return JSON.parse(e.text); } catch { return null; } };
function saveRec(cid, stage, obj) {
  const payload = JSON.stringify(obj), cur = S.entries.find((x) => x.client_id === cid);
  if (cur) { cur.text = payload; cur.updated_at = Date.now(); }
  else S.entries.push({ client_id: cid, stage, step: 0, text: payload, created_at: Date.now(), updated_at: Date.now() });
  enqueue({ t: 'save', uid: S.me.user.id, client_id: cid, stage, step: 0, text: payload });
}
function delRec(cid) { S.entries = S.entries.filter((x) => x.client_id !== cid); enqueue({ t: 'del', uid: S.me.user.id, client_id: cid }); }
const short = (s, n = 44) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const CHOICES = [['true', 'Үнэн'], ['false', 'Үнэн биш'], ['unsure', 'Эргэлзэж байна']];
function bindArea(ta, onSave) {
  let last = ta.value, t;
  const run = () => { clearTimeout(t); if (ta.value === last) return; last = ta.value; onSave(ta.value); };
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 700); });
  ta.addEventListener('blur', run);
}
const head = (st) => [
  el('div', { class: 'top' }, el('button', { class: 'btn ghost small', onclick: () => { stopMusic(); showHome(); } }, 'Аяллын зам руу'), el('span', { class: 'pill' }, pillText())),
  el('h2', {}, st.title), el('div', { class: 'muted', style: 'margin:-6px 0 14px' }, st.place)
];
const area = (label, value, onSave, { rows = 100, disabled = false, ph = '' } = {}) => {
  const ta = el('textarea', { maxlength: 1500, disabled, placeholder: ph, style: `min-height:${rows}px` }); ta.value = value || '';
  bindArea(ta, onSave); return el('div', {}, label && el('label', {}, label), ta);
};

/* ----- Намуухан ая (Web Audio, файл шаардлагагүй) ----- */
let music = { on: false };
function startMusic() {
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return toast('Таны төхөөрөмж дуу тоглуулахыг дэмжихгүй байна.');
  const ctx = music.ctx || new C(); ctx.resume();
  const master = ctx.createGain(); master.gain.value = 0; master.gain.linearRampToValueAtTime(0.12, ctx.currentTime + 4); master.connect(ctx.destination);
  const oscs = [110, 164.81, 220, 277.18, 329.63].map((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0.25 / (1 + i * 0.4);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ctx.createGain(); lg.gain.value = 0.08; lfo.connect(lg); lg.connect(g.gain);
    o.connect(g); g.connect(master); o.start(); lfo.start(); return [o, lfo];
  });
  music = { ctx, master, oscs, on: true };
}
function stopMusic() {
  if (!music.on) return;
  const { ctx, master, oscs } = music;
  master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
  setTimeout(() => oscs.flat().forEach((o) => { try { o.stop(); } catch {} }), 2500);
  music = { ctx, on: false };
}

/* ===== 3-р үе шат: Бодлоо шалгая ===== */
const s3 = { step: 1, breath: false, cur: null, bt: 0 };
const TABS = ['А1. Энэ бодол үнэн үү?', 'А2. Би яагаад ингэж боддог вэ?', 'А3. Миний үзэл бодол зөв үү, буруу юу?', 'А4. Тэгвэл би одоо яах ёстой вэ?', 'А5. Би юуг үнэн сэтгэлээсээ хүсэж байна вэ?'];
function reframed() {
  return S.entries.filter((e) => e.stage === 1).sort((a, b) => a.created_at - b.created_at)
    .map((e) => { const r = getRec('s2-' + e.client_id); return r && r.text ? { id: e.client_id, orig: e.text, self: r.text } : null; }).filter(Boolean);
}
function breathBox(onDone) {
  const token = s3.bt;
  const ring = el('div', { class: 'ring' }), label = el('div', { class: 'ring-label' }, 'Сонголтоо хийхийн өмнө гурван удаа амьсгаа аваарай.');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const go = el('button', { class: 'btn', onclick: async () => {
    go.disabled = true;
    for (let i = 1; i <= 3; i++) {
      for (const [txt, scale, ms] of [['Амьсгаа аваарай', 1.5, 4000], ['Амьсгаагаа түр барь', 1.5, 3000], ['Амьсгалаа гаргаарай', 1, 5000]]) {
        if (token !== s3.bt) return;
        label.textContent = `${i}/3 · ${txt}`; ring.style.transition = `transform ${ms}ms ease-in-out`; ring.style.transform = `scale(${scale})`; await sleep(ms);
      }
    }
    if (token !== s3.bt) return;
    s3.breath = true; onDone();
  } }, 'Эхлэх');
  const skip = el('button', { class: 'btn ghost', onclick: () => { s3.breath = true; onDone(); } }, 'Алгасах');
  return el('div', { class: 'panel breath' }, ring, label, el('div', { class: 'row', style: 'justify-content:center;margin-top:14px' }, go, skip));
}

function showStage3() {
  stopMusic(); s3.bt++;
  const st = STAGES[2]; setWorld(st.world);
  const writable = !!S.me.write[3];
  const items = reframed();
  const choiceOf = (id) => (getRec('s3a1-' + id) || {}).choice;
  const trues = items.filter((i) => choiceOf(i.id) === 'true');
  if (!trues.some((i) => i.id === s3.cur)) s3.cur = trues[0] ? trues[0].id : null;
  const go = (n) => { s3.step = n; showStage3(); };
  const tabs = el('div', { class: 'row', style: 'margin-bottom:16px' }, TABS.map((t, i) => el('button', { type: 'button', class: 'btn ghost small choice', 'aria-pressed': String(s3.step === i + 1), onclick: () => go(i + 1) }, t)));
  const panel = (...c) => el('div', { class: 'panel' }, c);
  let body;

  if (!items.length) {
    body = panel(el('p', {}, 'Бодлоо шалгахын өмнө 1, 2-р үе шатыг бөглөнө үү. Одоохондоо өөр рүү чиглүүлсэн өгүүлбэр алга.'), el('button', { class: 'btn', onclick: () => showStage(2) }, '2-р үе шат руу'));
  } else if (s3.step === 1) {
    const list = el('ul', { class: 'entries' }, items.map((it) => {
      const btns = CHOICES.map(([v, label]) => el('button', { type: 'button', class: 'btn ghost small choice', 'aria-pressed': String(choiceOf(it.id) === v), disabled: !writable, onclick: () => {
        if (!s3.breath) return toast('Эхлээд гурван удаа амьсгаа авна уу, эсвэл «Алгасах» дарна уу.');
        saveRec('s3a1-' + it.id, 3, { src: it.id, choice: v }); btns.forEach((b, i) => b.setAttribute('aria-pressed', String(CHOICES[i][0] === v)));
      } }, label));
      return el('li', { class: 'entry' },
        el('div', { class: 'duo' }, el('div', {}, el('div', { class: 'col-label' }, 'Миний бичсэн'), el('p', {}, it.orig)), el('div', {}, el('div', { class: 'col-label' }, 'Өөр рүүгээ'), el('p', {}, it.self))),
        el('div', { class: 'row', style: 'margin-top:8px' }, btns));
    }));
    body = el('div', {}, el('p', {}, 'Өгүүлбэр бүрийг уншаад, энэ нь надад үнэн эсэхийг сонго.'), s3.breath ? null : breathBox(showStage3), list);
  } else if (!items.some((i) => choiceOf(i.id))) {
    body = panel(el('p', {}, 'Эхлээд 1-р алхамд өгүүлбэр бүрт сонголтоо хийнэ үү.'), el('button', { class: 'btn', onclick: () => go(1) }, '1-р алхам руу'));
  } else if (!trues.length) {
    const rec = getRec('s3-free-note') || {};
    const due = rec.review_at && Date.now() >= rec.review_at;
    body = panel(
      el('p', {}, 'Одоо өөрийн сэтгэгдэл, үзэл бодол, хүслээ бичиж болно. Хоёр хоногийн дараа дахин эргэцүүлэх боломжтой.'),
      area(null, rec.text, (v) => { const r = getRec('s3-free-note') || {}; saveRec('s3-free-note', 3, { text: v, review_at: r.review_at || Date.now() + 2 * 86400000 }); }, { rows: 140, disabled: !writable, ph: 'Энд бич...' }),
      rec.review_at && (due
        ? el('div', {}, el('p', { style: 'margin-top:14px' }, 'Хоёр хоног өнгөрлөө. Дахин сонголт хийх цаг боллоо.'), el('button', { class: 'btn', onclick: () => go(1) }, 'Дахин сонгох'))
        : el('p', { class: 'muted', style: 'margin-top:14px' }, `Дахин сонголт хийх боломжтой болох өдөр: ${fmtDate(rec.review_at)}`)));
  } else {
    const t = () => getRec('s3t-' + s3.cur) || { src: s3.cur };
    const field = (key, label, ph) => area(label, t()[key], (v) => { const r = t(); r[key] = v; saveRec('s3t-' + s3.cur, 3, r); }, { disabled: !writable, ph });
    const cur = trues.find((i) => i.id === s3.cur);
    const chips = el('div', { class: 'row', style: 'margin-bottom:14px' }, trues.map((i) => el('button', { type: 'button', class: 'btn ghost small choice', 'aria-pressed': String(i.id === s3.cur), onclick: () => { s3.cur = i.id; showStage3(); } }, short(i.self))));
    const parts = {
      2: [el('p', {}, 'Нэг нэгээр нь бодолд дүгнэлт хийе. Аль нь эхэлж сонгох вэ?'), chips, el('div', { class: 'quote' }, cur.self),
        field('q1', 'Би яагаад ингэж боддог вэ?'), field('q2', 'Би юу гэж боддог билээ?'), field('q3', 'Энэ бодол хэзээ анх үүссэн бэ?')],
      3: [chips, el('div', { class: 'quote' }, cur.self), field('a3', 'Миний энэ үзэл бодол зөв үү, буруу юу? Тайлбарлаж, дүгнэлтээ бич.')],
      4: [chips, el('div', { class: 'quote' }, cur.self), field('a4', 'Тэгвэл би одоо яах ёстой вэ? Миний сонголт, хийж болох алхмууд.')],
      5: [chips, el('div', { class: 'quote' }, cur.self), field('a5', 'Би юуг үнэн сэтгэлээсээ хүсэж байна вэ?'),
        (() => { const b = el('button', { class: 'btn ghost small', style: 'margin-top:12px', onclick: () => { if (music.on) { stopMusic(); b.textContent = 'Намуухан ая асаах'; } else { startMusic(); b.textContent = 'Аяыг зогсоох'; } } }, music.on ? 'Аяыг зогсоох' : 'Намуухан ая асаах'); return b; })()]
    };
    body = el('div', { class: 'panel' }, parts[s3.step]);
  }

  const nav = items.length ? el('div', { class: 'row', style: 'margin-top:18px' },
    s3.step > 1 && el('button', { class: 'btn ghost', onclick: () => go(s3.step - 1) }, 'Өмнөх алхам'),
    s3.step < 5 && el('button', { class: 'btn', onclick: () => go(s3.step + 1) }, 'Дараагийн алхам'),
    s3.step === 5 && el('button', { class: 'btn', onclick: () => showStage4() }, 'Миний хүсэл рүү')) : null;
  mount(...head(st), el('p', { class: 'muted' }, 'Нэг нэгээр нь, өөрийн хурдаар. Энд зөв, буруу хариулт байхгүй.'), tabs, body, nav, el('div', { id: 'save-state', class: 'save-state', style: 'margin-top:16px' }));
  setStatus();
}

/* ===== 4-р үе шат: Миний хүсэл ===== */
const WCOL = [['violet', 'Нил ягаан'], ['gold', 'Алтлаг'], ['mist', 'Манантай'], ['rose', 'Ягаан'], ['night', 'Шөнийн']];
const WSHAPE = [['round', 'Дугуй'], ['arch', 'Хаалга'], ['leaf', 'Навч']];
const w4 = { color: 'violet', shape: 'round', archive: false };
function wishCards() {
  return S.entries.filter((e) => e.stage === 4 && e.client_id.startsWith('s4-')).sort((a, b) => a.created_at - b.created_at)
    .map((e) => { try { const j = JSON.parse(e.text); return j && j.text ? { id: e.client_id, text: j.text, color: j.color || 'violet', shape: j.shape || 'round' } : null; } catch { return null; } }).filter(Boolean);
}
const wcard = (c) => el('div', { class: `wcard c-${c.color} s-${c.shape}` }, c.text);
function picker(state, rerender) {
  return el('div', {},
    el('div', { class: 'row', style: 'margin:10px 0' }, WCOL.map(([v, label]) => el('button', { type: 'button', class: `swatch c-${v}`, 'aria-label': label, title: label, 'aria-pressed': String(state.color === v), onclick: () => { state.color = v; rerender(); } }))),
    el('div', { class: 'row' }, WSHAPE.map(([v, label]) => el('button', { type: 'button', class: 'btn ghost small choice', 'aria-pressed': String(state.shape === v), onclick: () => { state.shape = v; rerender(); } }, label))));
}
function archivePanel() {
  const s1 = S.entries.filter((e) => e.stage === 1).sort((a, b) => a.created_at - b.created_at);
  const s2 = reframed();
  const th = [];
  s2.forEach((i) => { const r = getRec('s3t-' + i.id); if (r && ['q1', 'q2', 'q3', 'a3', 'a4', 'a5'].some((k) => r[k])) th.push([i.self, r]); });
  const L = { q1: 'Би яагаад ингэж боддог вэ?', q2: 'Би юу гэж боддог билээ?', q3: 'Энэ бодол хэзээ анх үүссэн бэ?', a3: 'Зөв үү, буруу юу?', a4: 'Би одоо яах ёстой вэ?', a5: 'Би юуг үнэн сэтгэлээсээ хүсэж байна вэ?' };
  return el('div', { class: 'panel', style: 'margin-top:16px' },
    el('h3', {}, 'Өмнөх нөөц'),
    el('h3', { style: 'font-size:1.1rem' }, '1-р үе шат'), s1.length ? el('ul', { class: 'entries' }, s1.map((e) => el('li', { class: 'entry' }, el('p', {}, e.text)))) : el('p', { class: 'muted' }, 'Бичлэг алга.'),
    el('h3', { style: 'font-size:1.1rem' }, '2-р үе шат'), s2.length ? el('ul', { class: 'entries' }, s2.map((i) => el('li', { class: 'entry' }, el('div', { class: 'duo' }, el('p', {}, i.orig), el('p', {}, i.self))))) : el('p', { class: 'muted' }, 'Бичлэг алга.'),
    el('h3', { style: 'font-size:1.1rem' }, '3-р үе шат'), th.length ? el('ul', { class: 'entries' }, th.map(([self, r]) => el('li', { class: 'entry' }, el('p', {}, el('strong', {}, self)), Object.keys(L).filter((k) => r[k]).map((k) => el('p', {}, el('span', { class: 'col-label' }, L[k]), el('br'), r[k]))))) : el('p', { class: 'muted' }, 'Бичлэг алга.'));
}
function showStage4() {
  stopMusic();
  const st = STAGES[3]; setWorld(st.world);
  const writable = !!S.me.write[4];
  const ta = el('textarea', { id: 'wish', maxlength: 600, disabled: !writable, placeholder: 'Би ... гэж боддог. Би ... хийхийг хүсэж байна.' });
  const keep = window.__wishDraft || ''; ta.value = keep; ta.addEventListener('input', () => { window.__wishDraft = ta.value; });
  const re = () => showStage4();
  const add = () => {
    const v = ta.value.trim(); if (!v) return toast('Эхлээд хүслээ бичнэ үү.');
    saveRec('s4-' + uuid(), 4, { text: v, color: w4.color, shape: w4.shape }); window.__wishDraft = ''; showStage4();
  };
  const list = el('div', { class: 'wgrid' }, wishCards().map((c) => {
    const box = el('div', { class: 'wwrap' });
    const view = () => box.replaceChildren(wcard(c), writable && el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn ghost small', onclick: edit }, 'Засах'),
      el('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('Энэ картыг устгах уу?', 'Устгасан картыг буцааж сэргээх боломжгүй.', 'Устгах')) { delRec(c.id); showStage4(); } } }, 'Устгах')));
    const edit = () => {
      const st2 = { color: c.color, shape: c.shape }, e = el('textarea', { maxlength: 600 }); e.value = c.text;
      const draw = () => box.replaceChildren(e, picker(st2, draw), el('div', { class: 'row', style: 'margin-top:8px' },
        el('button', { class: 'btn small', onclick: () => { const v = e.value.trim(); if (!v) return toast('Карт хоосон байна.'); saveRec(c.id, 4, { text: v, color: st2.color, shape: st2.shape }); showStage4(); } }, 'Хадгалах'),
        el('button', { class: 'btn ghost small', onclick: () => showStage4() }, 'Болих')));
      draw();
    };
    view(); return box;
  }));
  mount(...head(st),
    el('div', { class: 'quote' }, 'Би ингэж боддог. Би ийм зүйл хийхийг хүсэж байна.'),
    writable ? el('div', { class: 'panel' }, el('label', { for: 'wish' }, 'Миний хүсэл'), ta, picker(w4, re), el('div', { class: 'row', style: 'margin-top:12px' }, el('button', { class: 'btn', onclick: add }, 'Карт нэмэх'))) : el('p', { class: 'panel muted' }, 'Энэ үе шатад одоо бичих цаг биш байна.'),
    wishCards().length ? list : el('p', { class: 'muted', style: 'margin-top:16px' }, 'Хүслийн карт одоохондоо алга.'),
    el('div', { class: 'row', style: 'margin-top:18px' },
      el('button', { class: 'btn ghost', onclick: () => { w4.archive = !w4.archive; showStage4(); } }, 'Өмнөх нөөцөө харах'),
      el('button', { class: 'btn ghost', onclick: () => showStage3() }, 'Бодлоо шалгах руу буцах'),
      S.me.access.day >= 26 || S.me.access.tester ? el('button', { class: 'btn', onclick: () => showStage(5) }, 'Аяллын төгсгөл рүү') : null),
    w4.archive ? archivePanel() : null,
    el('div', { id: 'save-state', class: 'save-state', style: 'margin-top:16px' }));
  setStatus();
}

/* ===== 5-р үе шат: Миний аяллын төгсгөл ===== */
const sizeClass = (t) => (t.length <= 70 ? 'p1' : t.length <= 140 ? 'p2' : t.length <= 240 ? 'p3' : 'p4');
function printCards() {
  const cards = wishCards(); if (!cards.length) return toast('Хэвлэх карт алга.');
  const old = document.getElementById('print-sheet'); if (old) old.remove();
  const root = el('div', { id: 'print-sheet' });
  for (let i = 0; i < cards.length; i += 6) {
    root.append(el('div', { class: 'sheet' }, cards.slice(i, i + 6).map((c) => el('div', { class: `pcard c-${c.color} s-${c.shape}` }, el('div', { class: 'pbrand' }, '✧ БУХАЛ ӨВС ✧'), el('div', { class: `ptext ${sizeClass(c.text)}` }, c.text)))));
  }
  document.body.append(root);
  addEventListener('afterprint', () => root.remove(), { once: true });
  setTimeout(() => window.print(), 100);
}
function showFinale() {
  const old = document.querySelector('.finale'); if (old) old.remove();
  const sparks = Array.from({ length: 28 }, () => el('span', { class: 'spark', style: `left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${(Math.random() * 4).toFixed(2)}s` }));
  const card = el('div', { class: 'gcard' },
    el('div', { class: 'gface front' }, el('div', { class: 'gtitle' }, 'БУХАЛ ӨВС'), el('ol', {}, STAGES.map((s) => el('li', {}, s.title))), el('p', { class: 'gquote' }, 'Би өөрийгөө хайсан аяллаа дуусгалаа. Харин өөрийгөө таних аялал үргэлжилсээр...')),
    el('div', { class: 'gface back' }, '✧'));
  const ov = el('div', { class: 'finale', role: 'dialog', 'aria-label': 'Алтан карт' }, sparks, el('div', { class: 'gscene' }, card), el('button', { class: 'btn', onclick: () => { ov.remove(); showHome(); } }, 'Аяллын зам руу'));
  document.body.append(ov);
}
function showStage5() {
  stopMusic();
  const st = STAGES[4]; setWorld(st.world);
  const writable = !!S.me.write[5];
  const block = (cid, label, allowNone) => {
    const rec = getRec(cid) || {}; const box = el('div', { style: 'margin-bottom:18px' });
    const draw = () => {
      const r = getRec(cid) || {};
      const none = el('button', { type: 'button', class: 'btn ghost small choice', 'aria-pressed': String(!!r.none), disabled: !writable, onclick: () => { saveRec(cid, 5, { text: '', none: !r.none }); draw(); } }, 'Байхгүй');
      box.replaceChildren(
        area(label, r.none ? '' : r.text, (v) => saveRec(cid, 5, { text: v, none: false }), { rows: 90, disabled: !writable || !!r.none, ph: r.none ? 'Байхгүй гэж сонгосон' : 'Энд бич...' }),
        allowNone ? el('div', { style: 'margin-top:8px' }, none) : null);
    };
    draw(); return box;
  };
  const s1 = S.entries.filter((e) => e.stage === 1).sort((a, b) => a.created_at - b.created_at);
  const reveal = el('div');
  const showWishes = () => {
    const cards = wishCards();
    reveal.replaceChildren(el('div', { class: 'panel', style: 'margin-top:16px' },
      el('h3', {}, 'Миний хүсэл'),
      cards.length ? el('div', { class: 'wgrid' }, cards.map(wcard)) : el('p', { class: 'muted' }, 'Хүслийн карт алга. 4-р үе шатанд карт нэмнэ үү.'),
      el('p', { class: 'muted', style: 'margin-top:12px' }, 'Нэг А4 хуудсанд 6 карт хэвлэгдэнэ. Утсан дээр хэвлэх цэснээс «PDF болгон хадгалах»-ыг сонгоно.'),
      el('div', { class: 'row' },
        el('button', { class: 'btn', onclick: printCards }, 'Хэвлэх / PDF татах'),
        el('button', { class: 'btn ghost', onclick: () => showStage4() }, 'Хүсэл нэмэх, засах'),
        el('button', { class: 'btn', onclick: () => { saveRec('s5-done-flag', 5, { at: Date.now() }); showFinale(); } }, 'Дууслаа'))));
  };
  mount(...head(st),
    writable ? null : el('p', { class: 'panel muted' }, 'Энэ үе шат сүүлийн 3 хоногт нээгдэнэ.'),
    el('p', {}, 'Эхний үе шат руугаа эргэж буцъя. Хүсвэл бич, эсвэл «Байхгүй» гэж сонго.'),
    el('div', { class: 'panel' },
      block('s5-first-1', 'Намайг одоо юу бухимдуулж байна вэ?', true),
      block('s5-first-2', 'Хэн нэгэнд гомдол байна уу?', true),
      block('s5-first-3', 'Өөртөө хэлэхийг хүссэн зүйл байна уу?', true),
      s1.length ? el('details', {}, el('summary', {}, 'Эхний өдрүүдэд бичсэн зүйлсээ харах'), el('ul', { class: 'entries', style: 'margin-top:10px' }, s1.map((e) => el('li', { class: 'entry' }, el('p', {}, e.text))))) : null),
    el('h3', { style: 'margin-top:24px' }, 'Эцсийн дүгнэлт'),
    el('div', { class: 'panel' },
      block('s5-final-1', 'Би юу ойлгов?'), block('s5-final-2', 'Би өөрчлөгдсөн үү?'), block('s5-final-3', 'Би өөрийнхөө талаар юу шинээр мэдэв?'), block('s5-final-4', 'Цаашид би юуг өөрөөр хийхийг хүсэж байна?')),
    el('div', { class: 'row', style: 'margin-top:18px' },
      el('button', { class: 'btn', onclick: showWishes }, 'Миний хүсэл'),
      getRec('s5-done-flag') ? el('button', { class: 'btn ghost', onclick: showFinale }, 'Алтан картаа дахин харах') : null),
    reveal, el('div', { id: 'save-state', class: 'save-state', style: 'margin-top:16px' }));
  setStatus();
}

boot();
