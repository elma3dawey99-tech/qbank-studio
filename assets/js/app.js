import { BRAND } from './config.js';
import { CATALOG, LEVELS, byCode } from './catalog.js';
import { call, setToken, MOCK } from './api.js';
import {
  $, esc, ic, fmt, uid, clamp, toInt, isAr, nLec, ago, store, loadScript, termHtml, countUp, LIBS,
  extractFile, guessNum, cleanTitle, largestRemainder, splitShares, sharesSum, takeMix,
  wP, wTable, docxBlob, downloadBlob
} from './lib.js';

const CHUNK = 20;          // questions per generation call
const PAGE = 60;           // question cards rendered per page
const LETTERS = 'ABCDEFGH';

const S = {
  view: 'boot', user: null, app: null, config: null, authTab: 'login', authErr: '', busy: false,
  courses: [], course: null, lectures: [], bank: [], dirty: false, step: 1,
  plan: null, gen: null, queue: [], textCache: {}, includeNotes: true,
  filters: { lec: '', type: '', diff: '', status: '', q: '' }, shown: PAGE, editing: null,
  exp: { mode: 'key', approvedOnly: false }, homeQ: '', homeLv: 0, menu: false
};
window.QB = { S };

/* ---------------- helpers ---------------- */
const term = () => (S.app && S.app.term) || BRAND.term;
const firstName = n => String(n || '').split(' ')[0];
const initials = n => String(n || '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join(' ');
function cfgType(id) { return S.config.types.find(t => t.id === id) || { id, label: id, en: id, options: 4 }; }
function cfgLevel(id) { return S.config.levels.find(t => t.id === id) || { id, label: id, en: id }; }
function lecById(id) { return S.lectures.find(l => l.id === id); }
function lecName(id) { const l = lecById(id); return l ? `محاضرة ${l.num}: ${l.title}` : 'محاضرة محذوفة'; }
const lvName = n => ({ 2: 'المستوى الثاني', 3: 'المستوى الثالث', 4: 'المستوى الرابع' }[n] || 'المستوى ' + n);

function ecg(w = 1200) {
  let d = 'M0 50';
  for (let x = 0; x < w; x += 200) d += ` L${x + 50} 50 Q${x + 60} 41 ${x + 70} 50 L${x + 88} 50 L${x + 94} 59 L${x + 102} 6 L${x + 110} 72 L${x + 117} 50 L${x + 135} 50 Q${x + 150} 35 ${x + 166} 50 L${x + 200} 50`;
  return `<div class="ecg" aria-hidden="true"><svg viewBox="0 0 ${w} 80" preserveAspectRatio="none"><defs><linearGradient id="ecgGrad" x1="0" x2="1"><stop offset="0" stop-color="#7CC4FF" stop-opacity="0"/><stop offset=".6" stop-color="#9FD6FF"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><path class="base" d="${d}"/><path class="trace" pathLength="1400" d="${d}"/></svg></div>`;
}
function logoImg(h = 40) { return `<img src="assets/img/faculty-logo.png" alt="جامعة الدلتا — كلية تكنولوجيا العلوم الصحية التطبيقية" style="height:${h}px;width:auto">`; }

/* ---------------- toasts & modals ---------------- */
function toast(msg, kind = 'ok', ms = 3200) {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = ic(kind === 'bad' ? 'alert' : kind === 'info' ? 'info' : 'check-circle') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), ms);
}
function modal({ title, body = '', actions = [], wide = false, onOpen }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-m="__x" aria-label="إغلاق">${ic('x')}</button></div>
      <div class="modal-b">${body}</div>
      ${actions.length ? `<div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-m="${i}" ${a.start ? 'style="margin-inline-end:auto"' : ''}>${a.icon ? ic(a.icon) : ''}${esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const close = v => { ov.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    ov.addEventListener('click', async e => {
      if (e.target === ov) return close(null);
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === '__x') return close(null);
      const a = actions[+b.dataset.m];
      if (a.validate) {
        b.disabled = true;
        try { const v = await a.validate(ov); if (v === false) return; close(v); }
        finally { b.disabled = false; }
        return;
      }
      close(a.value);
    });
    document.addEventListener('keydown', onKey);
    $('#modal-root').appendChild(ov);
    if (onOpen) onOpen(ov, close);
    const f = ov.querySelector('[autofocus],input,select,textarea'); if (f) setTimeout(() => f.focus(), 40);
  });
}
const confirmBox = (title, text, okLabel = 'تأكيد', danger = false) =>
  modal({ title, body: `<p>${text}</p>`, actions: [{ label: 'إلغاء', value: false }, { label: okLabel, value: true, kind: danger ? 'danger solid' : 'primary' }] });
function modalErr(ov, msg) { const e = ov.querySelector('[data-err]'); if (e) { e.hidden = false; e.innerHTML = ic('alert', 'sm') + `<span>${esc(msg)}</span>`; } }

/* ---------------- backend wrapper ---------------- */
async function api(action, args) {
  try { return await call(action, args); }
  catch (e) { if (e && e.error === 'auth') authLost(e.message); throw e; }
}
function authLost(msg) {
  store('qb_token', null); setToken(null);
  S.user = null; S.view = 'auth'; S.authTab = 'login'; S.authErr = msg || 'انتهت الجلسة، سجّل دخول تاني.';
  render();
}

/* ---------------- render: shell ---------------- */
function render() {
  const app = $('#app');
  document.title = S.view === 'course' && S.course ? `${S.course.code} · بنوك الأسئلة` : 'بنوك الأسئلة · قسم تكنولوجيا الطوارئ والرعاية الحرجة';
  if (S.view === 'boot') { app.innerHTML = `<div class="boot"><img src="assets/img/emblem.png" alt="" width="64" height="64"><span class="spin"></span></div>`; return; }
  if (S.view === 'auth') { app.innerHTML = viewAuth(); return; }
  app.innerHTML = topbar() + `<main class="wrap"><div class="view">${S.view === 'home' ? viewHome() : viewCourse()}</div></main>` + footer();
  if (S.view === 'home') afterHome();
}
function topbar() {
  return `<header class="topbar"><div class="topbar-in">
    <button class="brand" data-act="home" aria-label="الرئيسية">${logoImg(40)}<span class="sep"></span><span class="brand-txt"><b>${esc(BRAND.appName)}</b><small>قسم ${esc(BRAND.department)}</small></span></button>
    <span class="spacer"></span>
    <span class="chip term">${ic('calendar', 'sm')}${termHtml(term())}</span>
    <div style="position:relative">
      <button class="user-btn" data-act="menu" aria-haspopup="menu" aria-expanded="${S.menu}"><span class="uname">${esc(S.user.name)}</span><span class="avatar">${esc(initials(S.user.name))}</span></button>
      ${S.menu ? `<div class="menu" role="menu">
        <div class="who"><b>${esc(S.user.name)}</b><small>${S.user.role === 'admin' ? 'مسؤول الأداة' : 'عضو هيئة التدريس'}</small></div>
        <button data-act="changePw" role="menuitem">${ic('key')}تغيير كلمة المرور</button>
        <button class="bad" data-act="logout" role="menuitem">${ic('logout')}تسجيل خروج</button>
      </div>` : ''}
    </div>
  </div></header>`;
}
function footer() {
  return `<footer class="foot"><span>قسم ${esc(BRAND.department)} · ${esc(BRAND.faculty)} · ${esc(BRAND.university)}</span><span>${MOCK ? 'وضع المعاينة — البيانات على المتصفح ده بس · ' : ''}تصميم ${esc(BRAND.designer)}</span></footer>`;
}

/* ---------------- view: auth ---------------- */
function viewAuth() {
  const reg = S.authTab === 'register', last = store('qb_name') || '';
  return `<div class="auth">
    <div class="auth-card">
      <div class="auth-brand">
        ${logoImg(46)}
        <h1>بنوك الأسئلة</h1>
        <p>قسم ${esc(BRAND.department)}</p>
        <span class="chip term">${ic('calendar', 'sm')}${termHtml(term())}</span>
      </div>
      <div class="tabs" data-on="${S.authTab}" role="tablist">
        <span class="ind"></span>
        <button class="${reg ? '' : 'on'}" data-act="authTab" data-tab="login" role="tab" aria-selected="${!reg}">تسجيل الدخول</button>
        <button class="${reg ? 'on' : ''}" data-act="authTab" data-tab="register" role="tab" aria-selected="${reg}">حساب جديد</button>
      </div>
      <h2>${reg ? 'اعمل حسابك' : 'أهلاً بيك'}</h2>
      <form data-form="${S.authTab}" autocomplete="on" novalidate>
        <label class="field"><span>الاسم الثنائي</span>
          <input class="input" name="name" value="${esc(reg ? '' : last)}" placeholder="مثال: أحمد علي" autocomplete="${reg ? 'name' : 'username'}" required dir="rtl">
          ${reg ? '<small>الاسم الأول واسم العائلة — ده اللي هتدخل بيه</small>' : ''}</label>
        <label class="field"><span>كلمة المرور</span>
          <div class="input-wrap"><input class="input ltr" name="password" type="password" placeholder="••••••" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
          <button type="button" class="icon-btn" data-act="peek" aria-label="إظهار كلمة المرور">${ic('eye')}</button></div>
          ${reg ? '<small>6 حروف أو أرقام على الأقل</small>' : ''}</label>
        ${reg ? `<label class="field"><span>تأكيد كلمة المرور</span><input class="input ltr" name="confirm" type="password" placeholder="••••••" autocomplete="new-password" required></label>` : ''}
        ${S.authErr ? `<div class="form-err">${ic('alert', 'sm')}<span>${esc(S.authErr)}</span></div>` : ''}
        <button class="btn primary lg block" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spin light"></span>' : ''}${reg ? 'إنشاء الحساب' : 'دخول'}</button>
      </form>
      ${MOCK ? `<div class="auth-note">${ic('info', 'sm')}<span>وضع المعاينة: الحسابات والبيانات بتتحفظ على المتصفح ده بس.</span></div>` : ''}
    </div>
    <p class="auth-foot">${esc(BRAND.faculty)} · ${esc(BRAND.university)}</p>
  </div>`;
}
async function submitAuth(form) {
  const mode = form.dataset.form, name = form.name.value.trim().replace(/\s+/g, ' '), pw = form.password.value;
  const fail = msg => { S.authErr = msg; render(); const f = $('[data-form]'); if (f) { f.name.value = name; f.password.value = pw; if (f.confirm) f.confirm.value = form.confirm ? form.confirm.value : ''; } };
  if (mode === 'register') {
    if (name.split(' ').length !== 2) return fail('اكتب اسمك الثنائي: الاسم الأول واسم العائلة بس');
    if (pw.length < 6) return fail('كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل');
    if (pw !== form.confirm.value) return fail('كلمتين المرور مش زي بعض');
  } else if (!name || !pw) return fail('اكتب الاسم وكلمة المرور');
  S.busy = true; S.authErr = ''; render();
  const f = $('[data-form]'); if (f) { f.name.value = name; f.password.value = pw; if (f.confirm && form.confirm) f.confirm.value = form.confirm.value; }
  try {
    const r = await call(mode, { name, password: pw });
    store('qb_name', name); store('qb_token', r.token); setToken(r.token);
    Object.assign(S, { user: r.user, app: r.app, config: r.config, busy: false });
    if (mode === 'register') toast(`أهلاً يا ${firstName(r.user.name)} — اتعمل حسابك`);
    goHome();
  } catch (e) { S.busy = false; fail(e.message || 'تعذّر الدخول'); }
}

/* ---------------- view: home ---------------- */
function courseStatus(c) {
  if (!c.questions) return ['none', 'لم يبدأ'];
  if (c.target > 0 && c.questions >= c.target) return ['done', 'مكتمل'];
  return ['prog', 'جاري'];
}
function viewHome() {
  const cs = S.courses, tot = k => cs.reduce((s, c) => s + (c[k] || 0), 0);
  const stat = (icon, n, label, k) => `<div class="stat"><span class="si">${ic(icon, 'lg')}</span><div><b data-count="${n}">0</b><span>${label}</span></div></div>`;
  return `
    <section class="hero-band">
      <div class="txt">
        <div class="hello">أهلاً يا ${esc(firstName(S.user.name))}</div>
        <h1>بنوك أسئلة مواد القسم</h1>
        <p>قسم ${esc(BRAND.department)} · ${termHtml(term())}</p>
      </div>
      <div class="acts"><button class="btn primary lg" data-act="newCourse">${ic('plus')}إضافة مادة</button></div>
    </section>
    <div class="stats">${stat('book', cs.length, 'مادة')}${stat('slides', tot('lectures'), 'محاضرة مرفوعة')}${stat('q', tot('questions'), 'سؤال محفوظ')}${stat('done', cs.filter(c => courseStatus(c)[0] === 'done').length, 'مادة مكتملة')}</div>
    <div class="section-head">
      <h2>المواد</h2>
      <div class="seg" role="tablist">${[0, ...LEVELS].map(l => `<button class="${S.homeLv === l ? 'on' : ''}" data-act="homeLv" data-lv="${l}">${l ? 'المستوى ' + l : 'الكل'}</button>`).join('')}</div>
      <span class="spacer"></span>
      <div class="search">${ic('search')}<input class="input" data-bind="homeQ" value="${esc(S.homeQ)}" placeholder="ابحث بكود المادة أو اسمها"></div>
    </div>
    <div id="courses">${coursesGrid()}</div>`;
}
function homeList() {
  const q = S.homeQ.trim().toLowerCase();
  return S.courses.filter(c => (!S.homeLv || +c.level === S.homeLv) && (!q || (c.code + ' ' + c.name).toLowerCase().includes(q)))
    .sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
}
function coursesGrid() {
  if (!S.courses.length) return `<div class="empty"><span class="em-ico">${ic('book', 'xl')}</span><h3>لسه مفيش مواد</h3><p>ابدأ بإضافة أول مادة من مواد القسم، وبعدها ارفع محاضراتها.</p><button class="btn primary" data-act="newCourse">${ic('plus')}إضافة مادة</button></div>`;
  const list = homeList();
  if (!list.length) return `<div class="empty"><h3>مفيش مواد هنا</h3><p>غيّر المستوى أو كلمة البحث.</p></div>`;
  const C = 2 * Math.PI * 22;
  return `<div class="courses">${list.map((c, i) => {
    const [st, stl] = courseStatus(c);
    const pct = c.target > 0 ? clamp(c.questions / c.target * 100, 0, 100) : (c.questions ? 100 : 0);
    const last = c.savedAt ? `آخر حفظ: ${esc(c.savedBy)} · ${ago(c.savedAt)}` : (c.createdBy ? `أضافها ${esc(c.createdBy)}` : '');
    return `<div class="cc-wrap" style="animation-delay:${Math.min(i, 12) * 45}ms"><button class="cc" data-act="openCourse" data-id="${c.id}" data-lv="${esc(c.level)}">
      <div class="cc-top"><span class="code">${esc(c.code)}</span><span class="lv-chip">المستوى ${esc(c.level)}</span>${c.credits ? `<span class="chip" style="height:24px;font-size:12px">${c.credits} ساعات معتمدة</span>` : ''}<span class="spacer"></span><span class="status ${st}">${stl}</span><span class="cc-del-space"></span></div>
      <div class="cc-main"><h3 dir="auto">${esc(c.name)}</h3>
        <span class="ring"><svg viewBox="0 0 54 54"><circle class="bgc" cx="27" cy="27" r="22"/><circle class="fgc" cx="27" cy="27" r="22" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" data-p="${pct}"/></svg><em>${Math.round(pct)}%</em></span></div>
      <div class="cc-meta"><span>${ic('slides', 'sm')}${nLec(c.lectures)}</span><span>${ic('q', 'sm')}${fmt(c.questions)} سؤال</span><span>${ic('check-circle', 'sm')}${fmt(c.approved)} معتمد</span></div>
      <div class="cc-foot"><span>${c.target > 0 ? `${fmt(c.questions)} من ${fmt(c.target)} المستهدف` : 'بدون عدد مستهدف'}</span><span>${last}</span></div>
    </button><button class="icon-btn bad cc-del" data-act="delCourse" data-id="${c.id}" title="حذف المادة" aria-label="حذف المادة ${esc(c.code)}">${ic('trash', 'sm')}</button></div>`;
  }).join('')}</div>`;
}
function afterHome() {
  document.querySelectorAll('[data-count]').forEach(el => countUp(el, +el.dataset.count));
  animateRings();
}
function animateRings() {
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.fgc[data-p]').forEach(c => {
    const C = 2 * Math.PI * 22; c.style.strokeDashoffset = (C * (1 - (+c.dataset.p) / 100)).toFixed(1);
  })));
}
async function goHome() {
  S.view = 'home'; S.course = null; S.menu = false; render();
  try { S.courses = await api('listCourses'); } catch (e) { if (e.error !== 'auth') toast(e.message, 'bad'); }
  if (S.view === 'home') render();
}

/* ---------------- course picker ---------------- */
async function courseForm(c) {
  const isNew = !c;
  const taken = new Set(S.courses.filter(x => !c || x.id !== c.id).map(x => x.code));
  let lv = c ? +c.level : (store('qb_lv') || 2), sel = c ? c.code : '';
  if (!LEVELS.includes(lv)) lv = 2;
  const list = () => {
    const items = CATALOG.filter(x => x.level === lv);
    const group = (title, arr) => arr.length ? `<h5>${title}</h5>` + arr.map(x => `<button type="button" class="copt ${sel === x.code ? 'on' : ''}" data-code="${x.code}" ${taken.has(x.code) ? 'disabled' : ''}>
        <span class="code">${x.code}</span><span class="nm" dir="ltr" style="text-align:right">${esc(x.name)}</span><span class="cr">${taken.has(x.code) ? 'مضافة' : x.cr + ' س.م'}</span></button>`).join('') : '';
    return group('الترم الأول — خريف', items.filter(x => x.term === 1)) + group('الترم الثاني — ربيع', items.filter(x => x.term === 2)) + group('مواد اختيارية', items.filter(x => x.elective));
  };
  const body = `<div class="picker">
    <div class="field"><span class="lbl">المستوى</span><div class="lv-seg">${LEVELS.map(l => `<button type="button" data-lv="${l}" class="${l === lv ? 'on' : ''}">المستوى ${l}<small>${lvName(l).replace('المستوى ', '')}</small></button>`).join('')}</div></div>
    <div class="field"><span class="lbl">المادة</span><div class="course-opts" data-opts>${list()}</div></div>
    <div class="form-grid">
      <div class="field"><span class="lbl">القسم</span><div class="dept-chip">${ic('building')}<span>${esc(BRAND.department)}</span></div></div>
      <label class="field"><span>العدد المستهدف للبنك (اختياري)</span><input class="input" name="target" type="number" min="0" value="${esc(c && c.target ? c.target : '')}" placeholder="مثال: 200"></label>
    </div>
    <p class="form-err" data-err hidden></p>
  </div>`;
  const actions = [];
  if (!isNew) actions.push({ label: 'حذف المادة', value: '__del', kind: 'danger', start: true, icon: 'trash' });
  actions.push({ label: 'إلغاء', value: null });
  actions.push({
    label: isNew ? 'إضافة المادة' : 'حفظ', kind: 'primary', icon: isNew ? 'plus' : 'check', validate: async ov => {
      if (!sel) { modalErr(ov, 'اختار المادة من القائمة'); return false; }
      try {
        const saved = await api('saveCourse', { id: c && c.id, code: sel, target: ov.querySelector('[name=target]').value });
        store('qb_lv', byCode(sel).level);
        return saved;
      } catch (e) { modalErr(ov, e.message); return false; }
    }
  });
  const v = await modal({
    title: isNew ? 'إضافة مادة' : 'بيانات المادة', body, actions, onOpen: ov => {
      ov.addEventListener('click', e => {
        const lb = e.target.closest('.lv-seg button');
        if (lb) { lv = +lb.dataset.lv; ov.querySelectorAll('.lv-seg button').forEach(b => b.classList.toggle('on', b === lb)); ov.querySelector('[data-opts]').innerHTML = list(); return; }
        const ob = e.target.closest('.copt');
        if (ob && !ob.disabled) { sel = ob.dataset.code; ov.querySelectorAll('.copt').forEach(b => b.classList.toggle('on', b === ob)); const er = ov.querySelector('[data-err]'); if (er) er.hidden = true; }
      });
    }
  });
  if (!v) return;
  if (v === '__del') return deleteCourse(c);
  const i = S.courses.findIndex(x => x.id === v.id);
  if (i >= 0) S.courses[i] = Object.assign(S.courses[i], v); else S.courses.push(v);
  if (S.view === 'course' && S.course && S.course.id === v.id) { S.course = S.courses.find(x => x.id === v.id); render(); toast('اتحفظت بيانات المادة'); }
  else if (isNew) { toast('اتضافت ' + v.code); openCourse(v.id); }
  else render();
}
async function deleteCourse(c) {
  const v = await modal({
    title: 'حذف المادة ' + c.code,
    body: `<p dir="auto"><b>${esc(c.name)}</b></p><p style="margin-top:8px">هتتحذف المادة ومعاها المحاضرات المرفوعة وبنك الأسئلة بتاعها. الحذف ده مش هينفع يترجع.</p>`,
    actions: [{ label: 'إلغاء', value: null }, { label: 'حذف المادة', kind: 'danger solid', icon: 'trash', value: true }]
  });
  if (!v) return;
  try { await api('deleteCourse', { id: c.id }); S.dirty = false; toast('اتحذفت المادة'); S.courses = S.courses.filter(x => x.id !== c.id); goHome(); }
  catch (e) { toast(e.message, 'bad'); }
}
async function changePassword() {
  S.menu = false; render();
  await modal({
    title: 'تغيير كلمة المرور',
    body: `<div class="picker">
      <label class="field"><span>كلمة المرور الحالية</span><input class="input ltr" type="password" name="old" autocomplete="current-password"></label>
      <label class="field"><span>كلمة المرور الجديدة</span><input class="input ltr" type="password" name="new" autocomplete="new-password"><small>6 حروف أو أرقام على الأقل</small></label>
      <label class="field"><span>تأكيد كلمة المرور الجديدة</span><input class="input ltr" type="password" name="conf" autocomplete="new-password"></label>
      <p class="form-err" data-err hidden></p></div>`,
    actions: [{ label: 'إلغاء', value: null }, {
      label: 'حفظ', kind: 'primary', icon: 'check', validate: async ov => {
        const g = n => ov.querySelector(`[name=${n}]`).value;
        if (g('new').length < 6) { modalErr(ov, 'كلمة المرور الجديدة لازم تكون 6 حروف أو أرقام على الأقل'); return false; }
        if (g('new') !== g('conf')) { modalErr(ov, 'كلمتين المرور الجديدة مش زي بعض'); return false; }
        try { await api('changePassword', { oldPassword: g('old'), newPassword: g('new') }); toast('اتغيرت كلمة المرور'); return true; }
        catch (e) { modalErr(ov, e.message); return false; }
      }
    }]
  });
}

/* ---------------- view: course ---------------- */
const STEPS = [
  { n: 1, t: 'المحاضرات', s: 'ارفع ملفات المادة' },
  { n: 2, t: 'عدد الأسئلة', s: 'التوزيع والأنواع' },
  { n: 3, t: 'التوليد والمراجعة', s: 'راجع وعدّل واعتمد' },
  { n: 4, t: 'الحفظ والتصدير', s: 'Word و Excel' }
];
function viewCourse() {
  const c = S.course, cat = byCode(c.code);
  return `
    <div class="crumb"><button data-act="home">${ic('back', 'sm')}المواد</button><span>/</span><span class="mono ltr">${esc(c.code)}</span></div>
    <div class="course-head" data-lv="${esc(c.level)}">
      <div><span class="code">${esc(c.code)}</span> <span class="lv-chip" style="--lv:var(--l${esc(c.level)})">المستوى ${esc(c.level)}</span>
        <h1 dir="auto">${esc(c.name)}</h1>
        <div class="sub"><span>${ic('building', 'sm')}${esc(BRAND.department)}</span>${cat ? `<span>${ic('book', 'sm')}${cat.cr} ساعات معتمدة</span>` : ''}${c.target ? `<span>${ic('q', 'sm')}المستهدف ${fmt(c.target)} سؤال</span>` : ''}</div></div>
      <div class="acts" id="course-acts">${courseActs()}</div>
    </div>
    <nav class="steps" id="steps">${stepsNav()}</nav>
    <section id="step">${stepBody()}</section>`;
}
function courseActs() {
  return `${S.dirty ? `<span class="dirty">تغييرات غير محفوظة</span><button class="btn primary sm" data-act="saveBank">${ic('save', 'sm')}حفظ البنك</button>` : (S.course.savedAt ? `<span class="muted" style="font-size:13px">آخر حفظ: ${esc(S.course.savedBy)} · ${ago(S.course.savedAt)}</span>` : '')}
    <button class="btn sm" data-act="editCourse">${ic('edit', 'sm')}بيانات المادة</button>
    <button class="btn sm danger" data-act="delCourse" data-id="${S.course.id}">${ic('trash', 'sm')}حذف المادة</button>`;
}
function stepsNav() {
  const done = { 1: S.lectures.length > 0, 2: S.bank.length > 0, 3: S.bank.length > 0 && S.bank.every(q => q.status === 'approved'), 4: !!S.course.savedAt && !S.dirty };
  return STEPS.map(s => `<button class="step ${S.step === s.n ? 'on' : ''} ${done[s.n] && S.step !== s.n ? 'done' : ''}" data-act="go" data-step="${s.n}" aria-current="${S.step === s.n ? 'step' : 'false'}">
    <span class="n">${done[s.n] && S.step !== s.n ? ic('check', 'sm') : s.n}</span><span><b>${s.t}</b><small>${s.s}</small></span></button>`).join('');
}
function stepBody() { return `<div class="view">${S.step === 1 ? step1() : S.step === 2 ? step2() : S.step === 3 ? step3() : step4()}</div>`; }
function refreshCourse(parts = ['acts', 'steps', 'step']) {
  if (S.view !== 'course') return;
  if (parts.includes('acts')) { const e = $('#course-acts'); if (e) e.innerHTML = courseActs(); }
  if (parts.includes('steps')) { const e = $('#steps'); if (e) e.innerHTML = stepsNav(); }
  if (parts.includes('step')) { const e = $('#step'); if (e) e.innerHTML = stepBody(); }
}
function setDirty(v = true) { S.dirty = v; refreshCourse(['acts', 'steps']); }

/* step 1 — lectures */
function step1() {
  const totWords = S.lectures.reduce((s, l) => s + l.words, 0);
  return `
    <label class="drop" id="drop" tabindex="0">
      <input type="file" id="file-in" multiple accept=".pptx,.pdf,.docx,.ppt,.doc" hidden>
      <span class="d-ico">${ic('upload', 'xl')}</span>
      <h3>اسحب ملفات المحاضرات هنا أو اضغط للاختيار</h3>
      <p>تقدر ترفع كذا ملف مرة واحدة. النص بيتقري من الملف على جهازك، وبيتحفظ نص المحاضرة بس.</p>
      <div class="fmts"><span class="ft ft-pptx">PPTX</span><span class="ft ft-pdf">PDF</span><span class="ft ft-docx">DOCX</span></div>
    </label>
    <div class="drop-opts"><label class="check"><input type="checkbox" data-bind="includeNotes" ${S.includeNotes ? 'checked' : ''}>ضمّن ملاحظات المتحدث (Speaker notes) من ملفات PowerPoint</label></div>
    <div class="queue" id="queue">${queueHtml()}</div>
    <div class="card">
      <div class="card-h"><h2>محاضرات المادة<span class="count">${S.lectures.length}</span></h2><span class="spacer"></span><span class="muted" style="font-size:13px">الترتيب برقم المحاضرة — تقدر تعدّل الرقم والعنوان</span></div>
      <div class="lec-list">${S.lectures.length ? S.lectures.map(lecRow).join('') : `<div class="empty" style="border:0"><span class="em-ico">${ic('slides', 'xl')}</span><h3>مفيش محاضرات لسه</h3><p>ارفع ملفات المحاضرات من فوق. كل ملف = محاضرة.</p></div>`}</div>
      ${S.lectures.length ? `<div class="totals"><span>المحاضرات: <b>${S.lectures.length}</b></span><span>إجمالي الكلمات: <b>${fmt(totWords)}</b></span></div>` : ''}
    </div>
    <div class="step-nav"><span></span><button class="btn primary" data-act="go" data-step="2" ${S.lectures.length ? '' : 'disabled'}>التالي: عدد الأسئلة${ic('next')}</button></div>`;
}
function lecRow(l) {
  const few = n => n >= 3 && n <= 10;
  const unit = l.kind === 'pptx' ? (few(l.units) ? 'شرائح' : 'شريحة') : (few(l.units) ? 'صفحات' : 'صفحة');
  return `<div class="lec" data-id="${l.id}">
    <span class="ft ft-${l.kind}">${l.kind.toUpperCase()}</span>
    <input class="input num" type="number" min="1" max="99" value="${l.num}" data-lec="num" aria-label="رقم المحاضرة">
    <input class="input" value="${esc(l.title)}" data-lec="title" dir="auto" aria-label="عنوان المحاضرة" title="${esc(l.fileName)}">
    <span class="lec-stats"><span>${fmt(l.units)} ${unit}</span><span>${fmt(l.words)} كلمة</span>${l.words < 150 ? `<span class="warn-tag">${ic('alert', 'sm')}نص قليل</span>` : ''}</span>
    <span class="lec-acts"><button class="icon-btn" data-act="previewLec" title="عرض النص المستخرج" aria-label="عرض النص">${ic('eye')}</button><button class="icon-btn bad" data-act="delLec" title="حذف" aria-label="حذف">${ic('trash')}</button></span>
  </div>`;
}
function queueHtml() {
  return S.queue.map(q => `<div class="qi ${q.err ? 'err' : ''}" data-qid="${q.id}">
    <span class="ft ft-${q.kind}">${q.kind.toUpperCase()}</span>
    <span class="name" title="${esc(q.name)}">${esc(q.name)}</span>
    ${q.err ? `<button class="icon-btn" data-act="dismissQ" aria-label="إخفاء">${ic('x')}</button>` : `<span class="st">${esc(q.st)}</span>`}
    ${q.err ? `<span class="st" style="grid-column:2/-1">${esc(q.err)}</span>` : `<div class="bar live"><i style="width:${q.pct || 3}%"></i></div>`}
  </div>`).join('');
}
function refreshQueue() { const e = $('#queue'); if (e) e.innerHTML = queueHtml(); }

/* step 2 — numbers */
function planKey() { return 'qb_plan_' + S.course.id; }
function planInit() {
  const cfg = S.config;
  const p = Object.assign({
    total: S.course.target > 0 ? Math.min(S.course.target, cfg.maxTotal) : cfg.defaultTotal,
    mode: 'auto', inc: {}, manual: {},
    types: Object.fromEntries(cfg.types.map(t => [t.id, t.share])),
    levels: Object.fromEntries(cfg.levels.map(t => [t.id, t.share]))
  }, store(planKey()) || {});
  if (cfg.lockShares) { p.types = Object.fromEntries(cfg.types.map(t => [t.id, t.share])); p.levels = Object.fromEntries(cfg.levels.map(t => [t.id, t.share])); }
  cfg.types.forEach(t => { if (p.types[t.id] == null) p.types[t.id] = 0; });
  cfg.levels.forEach(t => { if (p.levels[t.id] == null) p.levels[t.id] = 0; });
  S.plan = p;
}
function planSave() { store(planKey(), S.plan); }
function planLectures() { return S.lectures.filter(l => S.plan.inc[l.id] !== false); }
function planCounts() {
  const p = S.plan, lecs = planLectures(), per = {};
  if (p.mode === 'manual') lecs.forEach(l => per[l.id] = clamp(toInt(p.manual[l.id], 0), 0, S.config.maxPerLecture));
  else {
    const k = lecs.length, base = p.total >= k ? 1 : 0;
    const parts = largestRemainder(p.total - base * k, lecs.map(l => p.mode === 'equal' ? 1 : Math.max(1, l.words)));
    lecs.forEach((l, i) => per[l.id] = parts[i] + base);
  }
  return { per, sum: Object.values(per).reduce((a, b) => a + b, 0), lecs };
}
function planTotals() {
  const { per, sum, lecs } = planCounts(), types = {}, levels = {};
  S.config.types.forEach(t => types[t.id] = 0); S.config.levels.forEach(t => levels[t.id] = 0);
  lecs.forEach(l => {
    const ts = splitShares(per[l.id], S.plan.types, S.config.types), ls = splitShares(per[l.id], S.plan.levels, S.config.levels);
    for (const k in ts) types[k] += ts[k]; for (const k in ls) levels[k] += ls[k];
  });
  return { per, sum, lecs, types, levels };
}
function planProblems() {
  const t = planTotals(), errs = [];
  if (!S.lectures.length) errs.push('ارفع محاضرة واحدة على الأقل');
  else if (!t.lecs.length) errs.push('اختار محاضرة واحدة على الأقل');
  if (S.plan.mode === 'manual' && t.sum !== S.plan.total) errs.push(`مجموع الأسئلة على المحاضرات ${t.sum} لازم يساوي ${S.plan.total}`);
  if (sharesSum(S.plan.types) !== 100) errs.push('نسب أنواع الأسئلة لازم مجموعها 100%');
  if (sharesSum(S.plan.levels) !== 100) errs.push('نسب مستويات الصعوبة لازم مجموعها 100%');
  if (S.plan.total < 1) errs.push('حدد عدد الأسئلة');
  if (t.lecs.some(l => t.per[l.id] > S.config.maxPerLecture)) errs.push(`أقصى عدد للمحاضرة الواحدة ${S.config.maxPerLecture} سؤال`);
  return errs;
}
function step2() {
  if (!S.lectures.length) return `<div class="empty"><span class="em-ico">${ic('slides', 'xl')}</span><h3>ارفع المحاضرات الأول</h3><p>عدد الأسئلة بيتوزع على المحاضرات اللي هترفعها.</p><button class="btn primary" data-act="go" data-step="1">${ic('back')}رجوع للمحاضرات</button></div>`;
  const cfg = S.config, p = S.plan, lock = cfg.lockShares ? `<span class="chip">${ic('lock', 'sm')}ثابتة لكل المواد</span>` : '';
  return `
    <div class="cols">
      <div class="stack">
        <div class="card">
          <div class="card-h"><h2>عدد الأسئلة المطلوب</h2></div>
          <div class="card-pad"><div class="total-row">
            <div class="stepper"><button data-act="total" data-d="1" aria-label="زيادة">${ic('plus')}</button><input id="total" type="number" min="1" max="${cfg.maxTotal}" value="${p.total}" data-bind="total" aria-label="عدد الأسئلة"><button data-act="total" data-d="-1" aria-label="نقص">${ic('minus')}</button></div>
            <span class="muted">سؤال للمادة كلها</span><span class="spacer"></span>
            <div class="presets">${[20, 50, 100, 200].map(n => `<button class="btn sm ${p.total === n ? 'primary' : ''}" data-act="preset" data-n="${n}">${n}</button>`).join('')}</div>
          </div></div>
          <div class="card-h" style="border-top:1px solid var(--line)"><h2 style="font-size:15px">التوزيع على المحاضرات</h2><span class="spacer"></span>
            <div class="seg" role="tablist">${[['auto', 'حسب حجم المحاضرة'], ['equal', 'بالتساوي'], ['manual', 'يدوي']].map(([k, t]) => `<button class="${p.mode === k ? 'on' : ''}" data-act="mode" data-mode="${k}">${t}</button>`).join('')}</div></div>
          <div id="dist">${distHtml()}</div>
        </div>
        <div class="card"><div class="card-h"><h2>أنواع الأسئلة</h2>${lock}</div><div id="mix-types">${mixHtml('types')}</div></div>
        <div class="card"><div class="card-h"><h2>مستوى الصعوبة</h2>${lock}</div><div id="mix-levels">${mixHtml('levels')}</div></div>
        <div class="card gen-cta" id="gen-cta">${genCta()}</div>
      </div>
      <aside class="card rules">${rulesHtml()}</aside>
    </div>
    <div class="step-nav"><button class="btn" data-act="go" data-step="1">${ic('back')}المحاضرات</button><span></span></div>`;
}
function distHtml() {
  const { per, sum } = planCounts(), p = S.plan, maxW = Math.max(1, ...S.lectures.map(l => l.words));
  return `<table class="dist"><thead><tr><th style="width:40px"></th><th>المحاضرة</th><th class="w">حجم النص</th><th class="n">عدد الأسئلة</th></tr></thead><tbody>
    ${S.lectures.map(l => {
      const on = p.inc[l.id] !== false;
      return `<tr class="${on ? '' : 'off'}" data-id="${l.id}">
        <td><label class="check"><input type="checkbox" data-inc="${l.id}" ${on ? 'checked' : ''} aria-label="ضمّن المحاضرة"></label></td>
        <td class="t"><b class="mono" style="font-size:13px">${l.num}</b> · <bdi>${esc(l.title)}</bdi></td>
        <td class="w"><div class="bar"><i style="width:${l.words / maxW * 100}%"></i></div></td>
        <td class="n">${!on ? '—' : p.mode === 'manual' ? `<input class="input" type="number" min="0" max="${S.config.maxPerLecture}" value="${per[l.id] || 0}" data-man="${l.id}">` : `<b>${per[l.id] || 0}</b>`}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <div class="sumline ${p.mode === 'manual' && sum !== p.total ? 'bad' : ''}" id="sumline">${sumLine(sum)}</div>`;
}
function sumLine(sum) {
  const p = S.plan;
  if (p.mode === 'manual' && sum !== p.total) return `${ic('alert', 'sm')}المجموع ${sum} من ${p.total} — ${sum < p.total ? 'فاضل ' + (p.total - sum) : 'زيادة ' + (sum - p.total)}`;
  return `${ic('check-circle', 'sm')}المجموع <b>${sum}</b> سؤال على ${nLec(planLectures().length)}`;
}
const mixWarn = s => s !== 100 ? `<div class="sumline bad">${ic('alert', 'sm')}مجموع النسب ${s}% — لازم يكون 100%</div>` : '';
function mixHtml(kind) {
  const t = planTotals()[kind], sh = S.plan[kind];
  return S.config[kind].map(x => `<div class="mix-row">
      <span class="lbl"><b>${esc(x.label)}</b><small>${esc(x.en)}</small></span>
      <span class="pct"><input class="input" type="number" min="0" max="100" value="${sh[x.id]}" data-share="${kind}:${x.id}" ${S.config.lockShares ? 'disabled' : ''} aria-label="النسبة"></span>
      <span class="cnt" data-cnt="${kind}:${x.id}">${t[x.id]}</span>
    </div>`).join('') + `<div id="mix-warn-${kind}">${mixWarn(sharesSum(sh))}</div>`;
}
function updateMixCounts(kind) {
  const t = planTotals()[kind];
  S.config[kind].forEach(x => { const e = document.querySelector(`[data-cnt="${kind}:${x.id}"]`); if (e) e.textContent = t[x.id]; });
  const w = $('#mix-warn-' + kind); if (w) w.innerHTML = mixWarn(sharesSum(S.plan[kind]));
}
function genCta() {
  const errs = planProblems(), t = planTotals();
  return `<div class="txt">${errs.length ? `<b style="color:var(--bad)">${esc(errs[0])}</b><p>صحّح الإعدادات اللي فوق عشان تقدر تولّد.</p>` : `<b>${fmt(t.sum)} سؤال من ${nLec(planLectures().length)}</b><p>${S.config.types.map(x => `${t.types[x.id]} ${x.label}`).join(' · ')}</p>`}</div>
    <button class="btn accent lg" data-act="generate" ${errs.length || (S.gen && S.gen.running) ? 'disabled' : ''}>${ic('spark')}توليد الأسئلة</button>`;
}
function rulesHtml() {
  const cfg = S.config;
  if (!cfg.rulesReady || !cfg.rules.length) return `
    <span class="r-ico">${ic('lock', 'lg')}</span>
    <h3>الشروط الموحدة</h3>
    <p>هنا هتظهر شروط بنك الأسئلة اللي هتتطبق على كل مواد القسم بنفس الشكل (الصياغة، عدد الاختيارات، المستويات، شكل الملف…). لسه هتتضاف.</p>
    <div class="skel"><i style="width:92%"></i><i style="width:76%"></i><i style="width:84%"></i><i style="width:60%"></i></div>
    <p style="font-size:13px">لحد ما تتضاف، التوليد بيطلع أسئلة <b>تجريبية</b> عشان تشوف شكل الأداة بس.</p>`;
  return `<span class="r-ico">${ic('check-circle', 'lg')}</span><h3>الشروط الموحدة</h3><p>بتتطبق تلقائياً على كل سؤال، في كل المواد.</p>
    <ol>${cfg.rules.map(r => `<li><b>${esc(r.title)}</b>${r.detail ? `<br><span class="muted">${esc(r.detail)}</span>` : ''}</li>`).join('')}</ol>`;
}
function refreshPlan(parts = ['dist', 'types', 'levels', 'cta']) {
  planSave();
  if (parts.includes('dist')) { const e = $('#dist'); if (e) e.innerHTML = distHtml(); }
  if (parts.includes('sum')) { const e = $('#sumline'); if (e) { const { sum } = planCounts(); e.className = 'sumline ' + (S.plan.mode === 'manual' && sum !== S.plan.total ? 'bad' : ''); e.innerHTML = sumLine(sum); } }
  if (parts.includes('types')) { const e = $('#mix-types'); if (e) e.innerHTML = mixHtml('types'); }
  if (parts.includes('levels')) { const e = $('#mix-levels'); if (e) e.innerHTML = mixHtml('levels'); }
  if (parts.includes('cta')) { const e = $('#gen-cta'); if (e) e.innerHTML = genCta(); }
}

/* step 3 — generate & review */
function sortedBank() {
  const order = new Map(S.bank.map((q, i) => [q.id, i]));
  return S.bank.slice().sort((a, b) => {
    const la = lecById(a.lectureId), lb = lecById(b.lectureId);
    return ((la ? la.num : 999) - (lb ? lb.num : 999)) || (order.get(a.id) - order.get(b.id));
  });
}
function filteredBank() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  return sortedBank().filter(x => (!f.lec || x.lectureId === f.lec) && (!f.type || x.type === f.type) && (!f.diff || x.difficulty === f.diff) && (!f.status || x.status === f.status)
    && (!q || (x.stem + ' ' + x.options.join(' ')).toLowerCase().includes(q)));
}
function step3() {
  const hasDemo = S.bank.some(q => q.source === 'demo'), sel = (k, v) => S.filters[k] === v ? 'selected' : '';
  return `
    ${hasDemo ? `<div class="banner demo">${ic('info')}<div><b>الأسئلة دي تجريبية لعرض شكل الأداة بس</b>التوليد الحقيقي هيشتغل لما نضيف الشروط الموحدة ومحرك الذكاء الاصطناعي.</div></div>` : ''}
    <div id="gen">${genHtml()}</div>
    ${S.bank.length ? `
    <div class="qtools">
      <div class="search">${ic('search')}<input class="input" data-filter="q" value="${esc(S.filters.q)}" placeholder="ابحث في الأسئلة"></div>
      <select class="select" data-filter="lec"><option value="">كل المحاضرات</option>${S.lectures.map(l => `<option value="${l.id}" ${sel('lec', l.id)}>محاضرة ${l.num}</option>`).join('')}</select>
      <select class="select" data-filter="type"><option value="">كل الأنواع</option>${S.config.types.map(t => `<option value="${t.id}" ${sel('type', t.id)}>${esc(t.label)}</option>`).join('')}</select>
      <select class="select" data-filter="diff"><option value="">كل المستويات</option>${S.config.levels.map(t => `<option value="${t.id}" ${sel('diff', t.id)}>${esc(t.label)}</option>`).join('')}</select>
      <select class="select" data-filter="status"><option value="">الكل</option><option value="draft" ${sel('status', 'draft')}>غير معتمد</option><option value="approved" ${sel('status', 'approved')}>معتمد</option></select>
      <span class="spacer"></span>
      <button class="btn sm" data-act="approveShown">${ic('check-circle', 'sm')}اعتماد الظاهر</button>
      <button class="btn sm" data-act="addQ">${ic('plus', 'sm')}سؤال يدوي</button>
    </div>
    <div id="qlist">${qListHtml()}</div>` : (S.gen ? '' : `<div class="empty"><span class="em-ico">${ic('spark', 'xl')}</span><h3>لسه مفيش أسئلة</h3><p>حدد العدد والتوزيع من الخطوة اللي فاتت واضغط "توليد الأسئلة".</p><button class="btn primary" data-act="go" data-step="2">${ic('back')}عدد الأسئلة</button></div>`)}
    <div class="step-nav"><button class="btn" data-act="go" data-step="2">${ic('back')}عدد الأسئلة</button><button class="btn primary" data-act="go" data-step="4" ${S.bank.length ? '' : 'disabled'}>التالي: الحفظ والتصدير${ic('next')}</button></div>`;
}
function genHtml() {
  const g = S.gen; if (!g) return '';
  const total = g.jobs.reduce((s, j) => s + j.n, 0), got = g.jobs.reduce((s, j) => s + j.got, 0);
  return `<div class="card gen">
    <div class="card-h">${g.running ? '<span class="spin"></span>' : ic('check-circle')}<h2>${g.running ? 'جاري توليد الأسئلة…' : g.stopped ? 'اتوقف التوليد' : 'خلص التوليد'}</h2>
      <span class="muted" style="font-size:13.5px">${got} / ${total}</span><span class="spacer"></span>
      ${g.running ? `<button class="btn sm danger" data-act="stopGen">${ic('stop', 'sm')}إيقاف</button>` : `<button class="icon-btn" data-act="closeGen" aria-label="إخفاء">${ic('x')}</button>`}</div>
    <div class="bar ${g.running ? 'live' : 'ok'}" style="border-radius:0;height:4px"><i style="width:${total ? got / total * 100 : 0}%"></i></div>
    ${g.jobs.map(j => `<div class="gj ${j.status}">
      <span class="s">${j.status === 'run' ? '<span class="spin"></span>' : j.status === 'done' ? ic('check', 'sm') : j.status === 'err' ? ic('alert', 'sm') : ic('dot', 'sm')}</span>
      <span class="t">محاضرة ${j.num} · <bdi>${esc(j.title)}</bdi></span>
      <div class="bar ${j.status === 'run' ? 'live' : ''}"><i style="width:${j.n ? j.got / j.n * 100 : 0}%"></i></div>
      <span class="r">${j.status === 'err' ? 'خطأ' : `${j.got}/${j.n}`}</span>
    </div>`).join('')}</div>`;
}
function refreshGen() { const e = $('#gen'); if (e) e.innerHTML = genHtml(); }
function qListHtml() {
  const all = sortedBank(), nums = new Map(all.map((q, i) => [q.id, i + 1]));
  const list = filteredBank(), shown = list.slice(0, S.shown);
  return `<div class="qsum"><span class="tag">${list.length === all.length ? `${fmt(all.length)} سؤال` : `${fmt(list.length)} من ${fmt(all.length)}`}</span>${S.config.types.map(t => `<span class="tag type">${esc(t.label)}: ${list.filter(q => q.type === t.id).length}</span>`).join('')}<span class="tag easy">معتمد: ${list.filter(q => q.status === 'approved').length}</span></div>
    <div class="qs">${shown.length ? shown.map((q, i) => qCard(q, nums.get(q.id), i)).join('') : `<div class="empty"><h3>مفيش أسئلة بالفلتر ده</h3></div>`}</div>
    ${list.length > shown.length ? `<div class="more"><button class="btn" data-act="more">عرض المزيد (${fmt(list.length - shown.length)})</button></div>` : ''}`;
}
function refreshQList() { const e = $('#qlist'); if (e) e.innerHTML = qListHtml(); else refreshCourse(['step']); }
const qDir = q => isAr(q.stem + q.options.join(' ')) ? 'rtl' : 'ltr';
function qCard(q, n, i = 0) {
  if (S.editing === q.id) return qEdit(q, n);
  const t = cfgType(q.type), lv = cfgLevel(q.difficulty), l = lecById(q.lectureId);
  return `<article class="card q ${q.status === 'approved' ? 'approved' : ''}" data-id="${q.id}" style="animation-delay:${Math.min(i, 10) * 25}ms">
    <div class="q-h"><span class="qn">${n}</span><span class="tag type">${esc(t.label)}</span><span class="tag ${esc(q.difficulty)}">${esc(lv.label)}</span>
      <span class="tag" title="${esc(lecName(q.lectureId))}">${l ? 'محاضرة ' + l.num : 'محاضرة محذوفة'}</span>${q.source === 'demo' ? '<span class="tag demo">تجريبي</span>' : ''}${q.source === 'manual' ? '<span class="tag">يدوي</span>' : ''}
      <span class="q-acts">
        <button class="icon-btn ${q.status === 'approved' ? 'on' : ''}" data-act="approveQ" title="${q.status === 'approved' ? 'إلغاء الاعتماد' : 'اعتماد'}" aria-label="اعتماد">${ic('check-circle')}</button>
        <button class="icon-btn" data-act="editQ" title="تعديل" aria-label="تعديل">${ic('edit')}</button>
        <button class="icon-btn" data-act="dupQ" title="نسخة" aria-label="نسخة">${ic('copy')}</button>
        <button class="icon-btn bad" data-act="delQ" title="حذف" aria-label="حذف">${ic('trash')}</button>
      </span></div>
    <div dir="${qDir(q)}"><div class="q-stem">${esc(q.stem)}</div>
    <ol class="q-opts">${q.options.map((o, k) => `<li class="${k === q.answer ? 'ok' : ''}"><span class="L">${LETTERS[k]}.</span><span>${esc(o)}</span>${k === q.answer ? `<span class="ok-ico">${ic('check', 'sm')}</span>` : ''}</li>`).join('')}</ol></div>
    ${q.explanation ? `<details class="q-exp"><summary>التفسير</summary><div dir="auto">${esc(q.explanation)}</div></details>` : ''}
  </article>`;
}
function qEdit(q, n) {
  return `<article class="card q" data-id="${q.id}"><div class="q-edit" data-qedit="${q.id}">
    <div class="q-h"><span class="qn">${n || '+'}</span><b>${q._new ? 'سؤال جديد' : 'تعديل السؤال'}</b></div>
    <div class="row">
      <label class="field"><span>النوع</span><select class="select" name="type">${S.config.types.map(t => `<option value="${t.id}" ${q.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <label class="field"><span>الصعوبة</span><select class="select" name="difficulty">${S.config.levels.map(t => `<option value="${t.id}" ${q.difficulty === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></label>
      <label class="field"><span>المحاضرة</span><select class="select" name="lectureId">${S.lectures.map(l => `<option value="${l.id}" ${q.lectureId === l.id ? 'selected' : ''}>محاضرة ${l.num}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span>نص السؤال</span><textarea class="textarea" name="stem" dir="auto" rows="3">${esc(q.stem)}</textarea></label>
    <div class="field"><span>الاختيارات — علّم على الإجابة الصحيحة</span><div class="opt-list" data-opts>${q.options.map((o, i) => optEditRow(q.id, o, i, i === q.answer)).join('')}</div>
      <div><button class="btn sm ghost" data-act="addOpt" type="button">${ic('plus', 'sm')}اختيار</button></div></div>
    <label class="field"><span>التفسير (اختياري)</span><textarea class="textarea" name="explanation" dir="auto" rows="2">${esc(q.explanation || '')}</textarea></label>
    <div class="acts"><button class="btn" data-act="cancelEdit">إلغاء</button><button class="btn primary" data-act="saveEdit">${ic('check')}حفظ السؤال</button></div>
  </div></article>`;
}
function optEditRow(qid, o, i, on) {
  return `<div class="opt-edit"><input type="radio" name="ans_${qid}" value="${i}" ${on ? 'checked' : ''} aria-label="الإجابة الصحيحة"><span class="L">${LETTERS[i]}</span><input class="input" value="${esc(o)}" dir="auto" data-opt><button class="icon-btn bad" data-act="delOpt" type="button" aria-label="حذف الاختيار">${ic('x', 'sm')}</button></div>`;
}

/* step 4 — save & export */
function step4() {
  const b = S.bank, n = b.length, appr = b.filter(q => q.status === 'approved').length;
  const row = (label, v, max, cls = '') => `<div class="brk-row"><span>${esc(label)}</span><div class="bar ${cls}"><i style="width:${max ? v / max * 100 : 0}%"></i></div><em>${v}</em></div>`;
  const m = (key, val) => b.filter(q => q[key] === val).length;
  const modes = [['key', 'نموذج إجابة في آخر الملف', 'الأسئلة مرقّمة، والإجابات في جدول في الآخر'], ['inline', 'الإجابة تحت كل سؤال', 'للمراجعة والتدقيق'], ['none', 'الأسئلة فقط', 'بدون أي إجابات — نسخة ورقة امتحان']];
  return `
    <div class="grid-2">
      <div class="card">
        <div class="card-h"><h2>ملخص البنك</h2></div>
        <div class="big-num"><b>${fmt(n)}</b><span>سؤال · ${fmt(appr)} معتمد</span></div>
        <div class="brk">
          <h4>حسب النوع</h4>${S.config.types.map(t => row(t.label, m('type', t.id), n)).join('')}
          <h4>حسب الصعوبة</h4>${S.config.levels.map(t => row(t.label, m('difficulty', t.id), n)).join('')}
          <h4>حسب المحاضرة</h4>${S.lectures.map(l => row('محاضرة ' + l.num, m('lectureId', l.id), n)).join('')}
          <h4>الاعتماد</h4>${row('معتمد', appr, n, 'ok')}
        </div>
      </div>
      <div class="card">
        <div class="save-box">
          <span class="si">${ic('save', 'lg')}</span>
          <div class="txt"><b>حفظ البنك للفريق</b><p>${S.course.savedAt ? `آخر حفظ: ${esc(S.course.savedBy)} · ${ago(S.course.savedAt)}` : 'لسه ما اتحفظش.'} الحفظ بيخلي أي حد في القسم يفتح المادة ويكمّل.</p></div>
          <button class="btn ${S.dirty ? 'primary' : ''}" data-act="saveBank" ${n || S.course.savedAt ? '' : 'disabled'}>${ic('save')}${S.dirty ? 'حفظ التغييرات' : 'حفظ'}</button>
        </div>
        <div class="card-pad">
          <h2 style="font-size:16px;margin-bottom:12px">تصدير</h2>
          <div class="opt-list">${modes.map(([k, t, s]) => `<label class="radio-card ${S.exp.mode === k ? 'on' : ''}"><input type="radio" name="expmode" value="${k}" ${S.exp.mode === k ? 'checked' : ''} data-exp="mode"><span><b>${t}</b><span>${s}</span></span></label>`).join('')}</div>
          <div style="margin-top:14px"><label class="check"><input type="checkbox" data-exp="approvedOnly" ${S.exp.approvedOnly ? 'checked' : ''}>الأسئلة المعتمدة فقط (${appr})</label></div>
          <div class="exp-btns">
            <button class="btn lg" data-act="exportWord" ${n ? '' : 'disabled'}>${ic('word')}ملف Word</button>
            <button class="btn lg" data-act="exportExcel" ${n ? '' : 'disabled'}>${ic('sheet')}ملف Excel</button>
          </div>
        </div>
      </div>
    </div>
    <div class="step-nav"><button class="btn" data-act="go" data-step="3">${ic('back')}المراجعة</button><button class="btn" data-act="home">المواد</button></div>`;
}

/* ---------------- course actions ---------------- */
async function leaveCourse() {
  if (S.gen && S.gen.running) { if (!(await confirmBox('التوليد شغال', 'لو خرجت دلوقتي التوليد هيقف. تخرج؟', 'خروج'))) return false; S.gen.stop = true; }
  if (S.dirty) {
    const v = await modal({ title: 'في تغييرات مش محفوظة', body: '<p>تحب تحفظ البنك قبل ما تخرج؟</p>', actions: [{ label: 'إلغاء', value: null }, { label: 'خروج بدون حفظ', value: 'discard', kind: 'danger' }, { label: 'حفظ وخروج', value: 'save', kind: 'primary', icon: 'save' }] });
    if (!v) return false;
    if (v === 'save' && !(await saveBank())) return false;
  }
  S.dirty = false; S.gen = null; return true;
}
async function openCourse(id) {
  const c = S.courses.find(x => x.id === id); if (!c) return;
  Object.assign(S, { course: c, view: 'course', lectures: [], bank: [], dirty: false, gen: null, queue: [], editing: null, shown: PAGE, menu: false, filters: { lec: '', type: '', diff: '', status: '', q: '' } });
  $('#app').innerHTML = topbar() + `<main class="wrap"><div class="loading"><span class="spin"></span>جاري فتح ${esc(c.code)}…</div></main>`;
  try {
    const [lecs, bank] = await Promise.all([api('listLectures', { courseId: id }), api('getBank', { courseId: id })]);
    S.lectures = lecs; S.bank = bank.map(normQ);
    planInit();
    S.step = !lecs.length ? 1 : bank.length ? 3 : 2;
    render(); window.scrollTo({ top: 0 });
  } catch (e) { if (e.error !== 'auth') { toast(e.message, 'bad'); goHome(); } }
}
function normQ(q) {
  const opts = Array.isArray(q.options) ? q.options.map(String) : [];
  return {
    id: q.id || uid('q_'), lectureId: q.lectureId || '', type: q.type || S.config.types[0].id, difficulty: q.difficulty || 'medium',
    stem: String(q.stem || ''), options: opts, answer: clamp(toInt(q.answer, 0), 0, Math.max(0, opts.length - 1)),
    explanation: String(q.explanation || ''), status: q.status === 'approved' ? 'approved' : 'draft', source: q.source || 'manual', createdBy: q.createdBy || (S.user && S.user.name) || ''
  };
}
async function handleFiles(files) {
  files = Array.from(files || []); if (!files.length || !S.course) return;
  const cid = S.course.id, existing = new Set(S.lectures.map(l => l.fileName));
  let nextNum = Math.max(0, ...S.lectures.map(l => l.num));
  for (const file of files) {
    if (existing.has(file.name) && !(await confirmBox('ملف مكرر', `الملف <b class="ltr">${esc(file.name)}</b> مرفوع قبل كده. ترفعه تاني؟`, 'ارفعه'))) continue;
    const kind = (file.name.split('.').pop() || '').toLowerCase();
    const item = { id: uid('u_'), name: file.name, kind: ['pptx', 'pdf', 'docx'].includes(kind) ? kind : 'pdf', st: 'جاري قراءة الملف…', pct: 3 };
    S.queue.push(item); refreshQueue();
    try {
      const r = await extractFile(file, { withNotes: S.includeNotes, onProg: (i, n) => { item.st = `جاري استخراج النص… ${i}/${n}`; item.pct = 5 + i / n * 70; refreshQueue(); } });
      if (r.words < 30) throw new Error('مفيش نص كفاية في الملف — غالباً الشرائح/الصفحات صور (Scan). جرّب ملف فيه نص قابل للنسخ.');
      if (r.text.length > S.config.maxLectureChars) toast(`الملف ${file.name} كبير — هيتاخد أول ${fmt(S.config.maxLectureChars)} حرف بس`, 'info', 5000);
      item.st = 'جاري الحفظ…'; item.pct = 88; refreshQueue();
      const num = guessNum(file.name, nextNum + 1); nextNum = Math.max(nextNum, num);
      const lec = await api('addLecture', { courseId: cid, num, title: cleanTitle(file.name), fileName: file.name, kind: r.kind, units: r.units, words: r.words, text: r.text.slice(0, S.config.maxLectureChars) });
      S.textCache[lec.id] = r.text;
      S.queue = S.queue.filter(q => q !== item);
      if (!S.course || S.course.id !== cid) continue;
      S.lectures.push(lec); S.lectures.sort((a, b) => a.num - b.num);
      S.course.lectures = S.lectures.length;
      if (S.step === 1) refreshCourse(['steps', 'step']);
      toast('اترفعت: ' + lec.title, 'ok', 2200);
    } catch (e) { item.err = e.message || String(e); refreshQueue(); }
  }
}
async function previewLecture(id) {
  const l = lecById(id); if (!l) return;
  let text = S.textCache[id];
  const p = modal({ title: `محاضرة ${l.num}: ${l.title}`, wide: true, body: `<p class="muted" style="margin-bottom:10px">${esc(l.fileName)} · ${fmt(l.words)} كلمة — ده النص اللي الأسئلة هتتعمل منه.</p><div class="pre" data-pre>${text ? esc(text) : '<span class="spin"></span>'}</div>`, actions: [{ label: 'إغلاق', value: null }] });
  if (!text) {
    try { text = await api('getLectureText', { id }); S.textCache[id] = text; const e = document.querySelector('[data-pre]'); if (e) e.textContent = text; }
    catch (e) { const el = document.querySelector('[data-pre]'); if (el) el.textContent = e.message; }
  }
  return p;
}
async function deleteLecture(id) {
  const l = lecById(id); if (!l) return;
  const nq = S.bank.filter(q => q.lectureId === id).length;
  if (!(await confirmBox('حذف المحاضرة', `هتتحذف محاضرة ${l.num} «${esc(l.title)}».${nq ? ` الـ ${nq} سؤال المعمولين منها هيفضلوا في البنك.` : ''}`, 'حذف', true))) return;
  try { await api('deleteLecture', { id }); S.lectures = S.lectures.filter(x => x.id !== id); delete S.plan.inc[id]; delete S.plan.manual[id]; planSave(); refreshCourse(['steps', 'step']); toast('اتحذفت المحاضرة'); }
  catch (e) { toast(e.message, 'bad'); }
}
async function updateLecture(id, field, value) {
  const l = lecById(id); if (!l) return;
  const v = field === 'num' ? clamp(toInt(value, l.num), 1, 99) : String(value).trim();
  if (v === l[field] || v === '') return;
  try { const r = await api('updateLecture', { id, [field]: v }); Object.assign(l, r); S.lectures.sort((a, b) => a.num - b.num); if (field === 'num') refreshCourse(['step']); }
  catch (e) { toast(e.message, 'bad'); }
}
async function generate() {
  const errs = planProblems(); if (errs.length) return toast(errs[0], 'bad');
  const { per, lecs } = planCounts();
  const jobs = lecs.filter(l => per[l.id] > 0).map(l => ({ id: l.id, num: l.num, title: l.title, n: per[l.id], got: 0, status: 'wait' }));
  const ids = new Set(jobs.map(j => j.id)), old = S.bank.filter(q => ids.has(q.lectureId)).length;
  if (old) {
    const v = await modal({ title: 'في أسئلة موجودة', body: `<p>البنك فيه ${old} سؤال من نفس المحاضرات. تحب تستبدلهم بالأسئلة الجديدة ولا تضيف عليهم؟</p>`, actions: [{ label: 'إلغاء', value: null }, { label: 'إضافة عليهم', value: 'add' }, { label: 'استبدال', value: 'replace', kind: 'primary' }] });
    if (!v) return;
    if (v === 'replace') S.bank = S.bank.filter(q => !ids.has(q.lectureId));
  }
  const gen = S.gen = { running: true, stop: false, stopped: false, jobs };
  S.step = 3; refreshCourse();
  const cid = S.course.id;
  for (const j of jobs) {
    if (gen.stop) break;
    j.status = 'run'; refreshGen();
    const types = splitShares(j.n, S.plan.types, S.config.types), levels = splitShares(j.n, S.plan.levels, S.config.levels);
    try {
      let left = j.n, off = 0;
      while (left > 0 && !gen.stop) {
        const n = Math.min(CHUNK, left);
        const r = await api('generateForLecture', { courseId: cid, lectureId: j.id, spec: { count: n, offset: off, types: takeMix(types, n, S.config.types), levels: takeMix(levels, n, S.config.levels) } });
        if (S.view !== 'course' || !S.course || S.course.id !== cid || S.gen !== gen) return;
        r.questions.forEach(q => S.bank.push(normQ(q)));
        j.got += r.questions.length; left -= n; off += n;
        setDirty(true); refreshGen(); refreshQList();
      }
      j.status = gen.stop && left > 0 ? 'wait' : 'done';
    } catch (e) {
      j.status = 'err'; toast(`محاضرة ${j.num}: ${e.message}`, 'bad', 5000);
      if (e.error === 'auth') return;
    }
    refreshGen();
  }
  gen.running = false; gen.stopped = gen.stop; refreshCourse(['steps', 'step']);
  if (!gen.stopped) toast(`اتولّد ${jobs.reduce((s, j) => s + j.got, 0)} سؤال — راجعهم واحفظ البنك`);
}
const findQ = id => S.bank.find(q => q.id === id);
function saveEdit(id) {
  const box = document.querySelector(`[data-qedit="${id}"]`); if (!box) return;
  const g = n => box.querySelector(`[name=${n}]`).value;
  const opts = Array.from(box.querySelectorAll('[data-opt]')).map(i => i.value.trim());
  const ans = Array.from(box.querySelectorAll('input[type=radio]')).findIndex(r => r.checked);
  const stem = g('stem').trim();
  if (!stem) return toast('اكتب نص السؤال', 'bad');
  const keep = opts.map((o, i) => ({ o, i })).filter(x => x.o);
  if (keep.length < 2) return toast('لازم اختيارين على الأقل', 'bad');
  if (ans < 0 || !opts[ans]) return toast('علّم على الإجابة الصحيحة', 'bad');
  const q = findQ(id);
  Object.assign(q, { type: g('type'), difficulty: g('difficulty'), lectureId: g('lectureId'), stem, explanation: g('explanation').trim(), options: keep.map(x => x.o), answer: keep.findIndex(x => x.i === ans) });
  if (q.source === 'demo') q.source = 'manual';
  delete q._new; S.editing = null; setDirty(true); refreshQList();
}
function addQuestion() {
  const t = S.config.types[0];
  const q = normQ({ id: uid('q_'), lectureId: S.filters.lec || (S.lectures[0] && S.lectures[0].id) || '', type: t.id, difficulty: 'medium', stem: '', options: Array.from({ length: t.options || 4 }, () => ''), answer: 0, source: 'manual' });
  q._new = true; S.bank.unshift(q); S.editing = q.id;
  S.filters = { lec: '', type: '', diff: '', status: '', q: '' };
  refreshCourse(['step']);
  const el = document.querySelector(`[data-qedit="${q.id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function saveBank() {
  try {
    const payload = S.bank.filter(q => !q._new || q.stem).map(({ _new, ...q }) => q);
    const r = await api('saveBank', { courseId: S.course.id, questions: payload });
    Object.assign(S.course, { savedAt: r.savedAt, savedBy: r.savedBy, questions: r.count, approved: S.bank.filter(q => q.status === 'approved').length });
    S.dirty = false; refreshCourse(S.step === 4 ? ['acts', 'steps', 'step'] : ['acts', 'steps']);
    toast(`اتحفظ البنك — ${r.count} سؤال`);
    return true;
  } catch (e) { toast(e.message, 'bad', 5000); return false; }
}

/* ---------------- export ---------------- */
const exportList = () => sortedBank().filter(q => q.stem && (!S.exp.approvedOnly || q.status === 'approved'));
const fileBase = () => `${S.course.code} - Question Bank - ${((S.app && S.app.termEn) || BRAND.termEn).replace('–', '-')}`.replace(/[\\/:*?"<>|]/g, ' ');
async function exportWord() {
  const list = exportList(), c = S.course, mode = S.exp.mode;
  if (!list.length) return toast('مفيش أسئلة للتصدير' + (S.exp.approvedOnly ? ' (مفيش أسئلة معتمدة)' : ''), 'bad');
  try {
    const parts = [
      wP([{ t: `${c.code} – ${c.name}`, b: true, sz: 34, color: '16211F' }], { after: 40, bidi: false }),
      wP([{ t: `${BRAND.departmentEn} · Question Bank · ${(S.app && S.app.termEn) || BRAND.termEn} · Level ${c.level}`, sz: 21, color: '0F766E' }], { after: 40, bidi: false }),
      wP([{ t: `Total: ${list.length} questions · Exported ${new Date().toLocaleDateString('en-GB')} by ${S.user.name}`, sz: 18, color: '7A8899' }], { after: 240, bidi: false })
    ];
    let n = 0, lastLec = null; const key = [];
    for (const q of list) {
      if (q.lectureId !== lastLec) {
        lastLec = q.lectureId; const l = lecById(q.lectureId);
        parts.push(wP([{ t: l ? `Lecture ${l.num}: ${l.title}` : 'Other questions', b: true, sz: 26, color: '0F766E' }], { before: 240, after: 120, keep: true, style: 'Heading2' }));
      }
      n++;
      const t = cfgType(q.type), lv = cfgLevel(q.difficulty);
      parts.push(wP([{ t: `${n}. `, b: true }, { t: q.stem }, { t: `   [${t.en} · ${lv.en}]`, sz: 16, color: '8A94A3' }], { keep: true, after: 60, before: 120 }));
      q.options.forEach((o, i) => {
        const right = mode === 'inline' && i === q.answer;
        parts.push(wP([{ t: `${LETTERS[i]}. `, b: true, color: right ? '14865A' : undefined }, { t: o, b: right, color: right ? '14865A' : undefined }], { ind: 360, after: 20, keep: i < q.options.length - 1 }));
      });
      if (mode === 'inline') {
        parts.push(wP([{ t: `Answer: ${LETTERS[q.answer]}`, b: true, sz: 20, color: '14865A' }], { ind: 360, before: 40, after: q.explanation ? 20 : 60 }));
        if (q.explanation) parts.push(wP([{ t: q.explanation, sz: 19, color: '555555' }], { ind: 360, after: 60 }));
      }
      const l = lecById(q.lectureId);
      key.push([String(n), LETTERS[q.answer] || '-', l ? String(l.num) : '-', t.en, lv.en]);
    }
    if (mode === 'key') {
      parts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
      parts.push(wP([{ t: 'Answer Key', b: true, sz: 28, color: '16211F' }], { after: 160, style: 'Heading1' }));
      parts.push(wTable([['Q', 'Answer', 'Lecture', 'Type', 'Difficulty'], ...key], [900, 1100, 1100, 2600, 1700]));
      parts.push(wP('', { after: 0 }));
    }
    downloadBlob(await docxBlob(parts.join('')), fileBase() + (mode === 'none' ? ' (questions only)' : '') + '.docx');
    toast('اتجهز ملف Word');
  } catch (e) { toast('تعذّر تجهيز ملف Word: ' + e.message, 'bad'); }
}
async function exportExcel() {
  const list = exportList(); if (!list.length) return toast('مفيش أسئلة للتصدير', 'bad');
  try {
    if (!window.XLSX) await loadScript(LIBS.xlsx);
    const maxO = Math.max(2, ...list.map(q => q.options.length));
    const rows = list.map((q, i) => {
      const l = lecById(q.lectureId), r = { '#': i + 1, Lecture: l ? l.num : '', 'Lecture title': l ? l.title : '', Type: cfgType(q.type).en, Difficulty: cfgLevel(q.difficulty).en, Question: q.stem };
      for (let k = 0; k < maxO; k++) r[LETTERS[k]] = q.options[k] || '';
      if (S.exp.mode !== 'none') { r.Answer = LETTERS[q.answer]; r.Explanation = q.explanation; }
      r.Status = q.status === 'approved' ? 'Approved' : 'Draft';
      return r;
    });
    const ws = window.XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 8 }, { wch: 28 }, { wch: 15 }, { wch: 10 }, { wch: 70 }, ...Array.from({ length: maxO }, () => ({ wch: 28 })), { wch: 8 }, { wch: 40 }, { wch: 10 }];
    const wb = window.XLSX.utils.book_new(); window.XLSX.utils.book_append_sheet(wb, ws, 'Question Bank');
    downloadBlob(new Blob([window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileBase() + '.xlsx');
    toast('اتجهز ملف Excel');
  } catch (e) { toast('تعذّر تجهيز ملف Excel: ' + e.message, 'bad'); }
}

/* ---------------- events ---------------- */
const ACT = {
  authTab: el => { S.authTab = el.dataset.tab; S.authErr = ''; render(); },
  peek: el => { const i = el.parentElement.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.innerHTML = ic(show ? 'eye-off' : 'eye'); },
  menu: () => { S.menu = !S.menu; const h = document.querySelector('.topbar'); if (h) h.outerHTML = topbar(); },
  changePw: () => changePassword(),
  home: async () => { if (S.view === 'course' && !(await leaveCourse())) return; goHome(); },
  logout: async () => {
    if (S.view === 'course' && !(await leaveCourse())) return;
    store('qb_token', null); setToken(null); Object.assign(S, { user: null, view: 'auth', authTab: 'login', authErr: '', menu: false, courses: [] }); render();
  },
  homeLv: el => { S.homeLv = +el.dataset.lv; document.querySelectorAll('.section-head .seg button').forEach(b => b.classList.toggle('on', b === el)); $('#courses').innerHTML = coursesGrid(); animateRings(); },
  newCourse: () => courseForm(null),
  editCourse: () => courseForm(S.course),
  openCourse: el => openCourse(el.dataset.id),
  delCourse: el => { const c = S.courses.find(x => x.id === el.dataset.id) || S.course; if (c) deleteCourse(c); },
  go: el => { S.step = +el.dataset.step; S.editing = null; refreshCourse(['steps', 'step']); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  previewLec: el => previewLecture(el.closest('[data-id]').dataset.id),
  delLec: el => deleteLecture(el.closest('[data-id]').dataset.id),
  dismissQ: el => { const id = el.closest('[data-qid]').dataset.qid; S.queue = S.queue.filter(q => q.id !== id); refreshQueue(); },
  total: el => { S.plan.total = clamp(S.plan.total + (+el.dataset.d), 1, S.config.maxTotal); $('#total').value = S.plan.total; refreshPlan(); },
  preset: el => { S.plan.total = +el.dataset.n; planSave(); refreshCourse(['step']); },
  mode: el => {
    if (el.dataset.mode === 'manual' && S.plan.mode !== 'manual') S.plan.manual = Object.assign({}, planCounts().per);
    S.plan.mode = el.dataset.mode; planSave(); refreshCourse(['step']);
  },
  generate: () => generate(),
  stopGen: () => { if (S.gen) { S.gen.stop = true; toast('هيقف بعد الدفعة الحالية', 'info'); } },
  closeGen: () => { S.gen = null; refreshGen(); },
  more: () => { S.shown += PAGE; refreshQList(); },
  approveQ: el => { const q = findQ(el.closest('[data-id]').dataset.id); q.status = q.status === 'approved' ? 'draft' : 'approved'; setDirty(true); refreshQList(); },
  approveShown: () => { const l = filteredBank(); if (!l.length) return; l.forEach(q => q.status = 'approved'); setDirty(true); refreshQList(); toast(`اتعتمد ${l.length} سؤال`); },
  editQ: el => { S.editing = el.closest('[data-id]').dataset.id; refreshQList(); },
  cancelEdit: el => { const q = findQ(el.closest('[data-qedit]').dataset.qedit); if (q && q._new) S.bank = S.bank.filter(x => x !== q); S.editing = null; refreshQList(); },
  saveEdit: el => saveEdit(el.closest('[data-qedit]').dataset.qedit),
  addOpt: el => {
    const box = el.closest('[data-qedit]'), list = box.querySelector('[data-opts]'), n = list.children.length;
    if (n >= 8) return toast('أقصى عدد 8 اختيارات', 'info');
    list.insertAdjacentHTML('beforeend', optEditRow(box.dataset.qedit, '', n, false));
    list.lastElementChild.querySelector('[data-opt]').focus();
  },
  delOpt: el => {
    const list = el.closest('[data-opts]'); if (list.children.length <= 2) return toast('لازم اختيارين على الأقل', 'info');
    el.closest('.opt-edit').remove();
    Array.from(list.children).forEach((row, i) => { row.querySelector('.L').textContent = LETTERS[i]; row.querySelector('input[type=radio]').value = i; });
  },
  dupQ: el => {
    const q = findQ(el.closest('[data-id]').dataset.id), i = S.bank.indexOf(q);
    const c = Object.assign({}, q, { id: uid('q_'), status: 'draft', source: 'manual', options: q.options.slice() });
    S.bank.splice(i + 1, 0, c); S.editing = c.id; setDirty(true); refreshQList();
  },
  delQ: el => { const id = el.closest('[data-id]').dataset.id; S.bank = S.bank.filter(q => q.id !== id); setDirty(true); refreshQList(); toast('اتحذف السؤال', 'info', 2000); },
  addQ: () => addQuestion(),
  saveBank: () => saveBank(),
  exportWord: () => exportWord(),
  exportExcel: () => exportExcel()
};
document.addEventListener('click', e => {
  if (S.menu && !e.target.closest('.menu') && !e.target.closest('[data-act=menu]')) { S.menu = false; const h = document.querySelector('.topbar'); if (h) h.outerHTML = topbar(); }
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const f = ACT[t.dataset.act]; if (!f) return;
  e.preventDefault(); f(t, e);
});
document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); submitAuth(f); });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.bind === 'homeQ') { S.homeQ = t.value; $('#courses').innerHTML = coursesGrid(); animateRings(); return; }
  if (t.dataset.bind === 'total') { const v = toInt(t.value, 0); if (v >= 1) { S.plan.total = clamp(v, 1, S.config.maxTotal); refreshPlan(); } return; }
  if (t.dataset.man) { S.plan.manual[t.dataset.man] = clamp(toInt(t.value, 0), 0, S.config.maxPerLecture); planSave(); refreshPlan(['sum', 'types', 'levels', 'cta']); return; }
  if (t.dataset.share) { const [k, id] = t.dataset.share.split(':'); S.plan[k][id] = clamp(toInt(t.value, 0), 0, 100); planSave(); updateMixCounts(k); refreshPlan(['cta']); return; }
  if (t.dataset.filter === 'q') { S.filters.q = t.value; S.shown = PAGE; clearTimeout(t._tm); t._tm = setTimeout(refreshQList, 200); return; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'file-in') { handleFiles(t.files); t.value = ''; return; }
  if (t.dataset.bind === 'includeNotes') { S.includeNotes = t.checked; return; }
  if (t.dataset.bind === 'total') { t.value = S.plan.total; return; }
  if (t.dataset.lec) { updateLecture(t.closest('[data-id]').dataset.id, t.dataset.lec, t.value); return; }
  if (t.dataset.inc) { S.plan.inc[t.dataset.inc] = t.checked; refreshPlan(); return; }
  if (t.dataset.share) { refreshPlan([t.dataset.share.split(':')[0]]); return; }
  if (t.dataset.filter && t.dataset.filter !== 'q') { S.filters[t.dataset.filter] = t.value; S.shown = PAGE; refreshQList(); return; }
  if (t.dataset.exp === 'mode') { S.exp.mode = t.value; refreshCourse(['step']); return; }
  if (t.dataset.exp === 'approvedOnly') { S.exp.approvedOnly = t.checked; return; }
});
document.addEventListener('keydown', e => {
  const d = e.target.closest && e.target.closest('#drop');
  if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('#file-in').click(); }
  if (e.key === 'Escape' && S.menu) { S.menu = false; const h = document.querySelector('.topbar'); if (h) h.outerHTML = topbar(); }
});
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { const d = e.target.closest && e.target.closest('#drop'); if (!d) return; e.preventDefault(); d.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => {
  const d = e.target.closest && e.target.closest('#drop'); if (!d) return;
  e.preventDefault(); d.classList.remove('over');
  if (ev === 'drop' && e.dataTransfer) handleFiles(e.dataTransfer.files);
}));
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => e.preventDefault());
window.addEventListener('beforeunload', e => { if (S.dirty || (S.gen && S.gen.running)) { e.preventDefault(); e.returnValue = ''; } });

/* ---------------- start ---------------- */
(async function init() {
  const tok = store('qb_token');
  if (tok) {
    setToken(tok);
    try {
      const r = await call('me');
      Object.assign(S, { user: r.user, app: r.app, config: r.config });
      return goHome();
    } catch (e) {
      if (e.error === 'auth') { store('qb_token', null); setToken(null); }
      else { S.authErr = e.message; }
    }
  }
  S.view = 'auth'; render();
})();
