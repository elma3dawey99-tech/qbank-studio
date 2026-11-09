import { API_URL } from './config.js';
import { CATALOG } from './catalog.js';

const params = new URLSearchParams(location.search);
const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
export const MOCK = params.has('mock');                       // ?mock = offline preview, data stays in this browser
const ENDPOINT = (LOCAL && params.get('api')) || API_URL;     // ?api=... only honoured on localhost (testing)

let token = null;
export const setToken = t => { token = t; };

export async function call(action, args = {}, { timeout = 90000 } = {}) {
  if (MOCK) { await new Promise(r => setTimeout(r, 120 + Math.random() * 220)); return mock(action, args); }
  const ctl = new AbortController();
  const tm = setTimeout(() => ctl.abort(), timeout);
  let res;
  try {
    // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script requires
    res = await fetch(ENDPOINT, {
      method: 'POST', redirect: 'follow', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token, args })
    });
  } catch (e) {
    throw { error: 'net', message: e.name === 'AbortError' ? 'الخادم اتأخر في الرد، جرّب تاني' : 'تعذّر الاتصال بالخادم — اتأكد من الإنترنت وجرّب تاني' };
  } finally { clearTimeout(tm); }
  let r;
  try { r = await res.json(); } catch (e) { throw { error: 'net', message: 'رد غير متوقع من الخادم (' + res.status + ')' }; }
  if (r && r.ok) return r.data;
  throw (r && r.error) ? r : { error: 'server', message: 'حصل خطأ غير متوقع' };
}

/* ------------------------------------------------------------------
   Offline preview backend (?mock) — mirrors the Apps Script API
   ------------------------------------------------------------------ */
const MOCK_CONFIG = {
  version: 3, rulesReady: true, lockShares: false, demo: true, bankSizes: [200, 400], defaultTotal: 200, maxPerLecture: 200, maxTotal: 600, maxLectureChars: 600000,
  rules: [{ title: 'لغة بسيطة', detail: 'إنجليزي سهل وجمل قصيرة، بنفس مصطلحات المحاضرة' }, { title: 'مش منقول حرفياً', detail: 'صياغة وزاوية بعيدة عن الأسئلة المتوقعة من أي AI' }, { title: '4 اختيارات وإجابة واحدة', detail: 'من نفس النوع وبنفس الطول، والصح متوزّع على A–D' }],
  types: [{ id: 'mcq', label: 'اختيار من متعدد', en: 'MCQ', options: 4, share: 75 }, { id: 'tf', label: 'صح وخطأ', en: 'True / False', options: 2, share: 20 }, { id: 'case', label: 'حالة إكلينيكية', en: 'Case-based MCQ', options: 4, share: 5 }],
  levels: [{ id: 'easy', label: 'سهل', en: 'Easy', share: 60 }, { id: 'medium', label: 'متوسط', en: 'Medium', share: 30 }, { id: 'hard', label: 'صعب', en: 'Hard', share: 10 }],
  blooms: [{ id: 'recall', label: 'تذكّر', en: 'Recall', share: 70 }, { id: 'understand', label: 'فهم', en: 'Understanding', share: 20 }, { id: 'apply', label: 'تطبيق', en: 'Application', share: 10 }]
};
const MOCK_APP = { name: 'بنوك الأسئلة', title: 'بنوك الأسئلة', department: 'تكنولوجيا الطوارئ والرعاية الحرجة', departmentEn: 'Emergency & Critical Care Technology', faculty: 'كلية تكنولوجيا العلوم الصحية التطبيقية', university: 'جامعة الدلتا للعلوم والتكنولوجيا', term: 'خريف 2026–2027', termEn: 'Fall 2026–2027', rev: 2, preview: true };
const KEY = 'qb_mock_v2';
let db = null;
const load = () => { if (db) return db; try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { } db = db || { users: [], courses: [], lectures: [], texts: {}, questions: [] }; return db; };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { } };
const id = p => p + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
const fail = (error, message) => { throw { error, message }; };
const clone = o => JSON.parse(JSON.stringify(o));
const cleanName = s => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = s => cleanName(s).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const validName = n => { const p = n.split(' '); return p.length === 2 && p.every(x => x.length >= 2 && /^[؀-ۿA-Za-z'\-]+$/.test(x)); };
const fakeHash = (pw, salt) => { let h = 2166136261; for (const c of salt + pw) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
const boot = u => ({ user: { id: u.id, name: u.name, role: u.role }, app: MOCK_APP, config: MOCK_CONFIG });
const session = u => Object.assign(boot(u), { token: 'mock.' + u.id });
function authed() {
  const d = load(), uid = String(token || '').replace(/^mock\./, '');
  const u = d.users.find(x => x.id === uid);
  if (!u) fail('auth', 'سجّل دخول تاني');
  return u;
}
const pubCourse = c => {
  const cat = CATALOG.find(x => x.code === c.code), d = load();
  return Object.assign({}, c, {
    name: cat ? cat.name : c.name, level: String(cat ? cat.level : c.level), credits: cat ? cat.cr : 0,
    lectures: d.lectures.filter(l => l.courseId === c.id).length,
    questions: d.questions.filter(q => q.courseId === c.id).length,
    approved: d.questions.filter(q => q.courseId === c.id && q.status === 'approved').length
  });
};

function mock(action, a) {
  const d = load();
  const out = (() => {
    switch (action) {
      case 'register': {
        const name = cleanName(a.name), pw = String(a.password || '');
        if (!validName(name)) fail('input', 'اكتب اسمك الثنائي (الاسم الأول واسم العائلة)');
        if (pw.length < 6) fail('input', 'كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل');
        if (d.users.some(u => u.nameKey === nameKey(name))) fail('dup', 'الاسم ده متسجّل قبل كده — لو ده حسابك ادخل من "تسجيل الدخول"');
        const salt = id('');
        const u = { id: id('u_'), name, nameKey: nameKey(name), salt, hash: fakeHash(pw, salt), role: d.users.length ? 'member' : 'admin' };
        d.users.push(u); persist(); return session(u);
      }
      case 'login': {
        const u = d.users.find(x => x.nameKey === nameKey(a.name));
        if (!u || fakeHash(String(a.password || ''), u.salt) !== u.hash) fail('auth_bad', 'الاسم أو كلمة المرور غير صحيحة');
        return session(u);
      }
      case 'me': return boot(authed());
      case 'changePassword': {
        const u = authed();
        if (fakeHash(String(a.oldPassword || ''), u.salt) !== u.hash) fail('auth_bad', 'كلمة المرور الحالية غير صحيحة');
        if (String(a.newPassword || '').length < 6) fail('input', 'كلمة المرور الجديدة لازم تكون 6 حروف أو أرقام على الأقل');
        u.hash = fakeHash(a.newPassword, u.salt); persist(); return true;
      }
      case 'listCourses': authed(); return d.courses.map(pubCourse);
      case 'saveCourse': {
        const u = authed(), cat = CATALOG.find(x => x.code === String(a.code || '').toUpperCase());
        if (!cat) fail('input', 'اختار المادة من القائمة');
        if (d.courses.some(x => x.code === cat.code && x.id !== a.id)) fail('dup', 'المادة ' + cat.code + ' موجودة بالفعل');
        const rec = { code: cat.code, name: cat.name, level: String(cat.level), target: [200, 400].includes(+a.target) ? +a.target : 200, updatedBy: u.name, updatedAt: Date.now() };
        let c = d.courses.find(x => x.id === a.id);
        if (c) Object.assign(c, rec); else { c = Object.assign({ id: id('c_'), createdBy: u.name, createdAt: Date.now(), savedBy: '', savedAt: 0 }, rec); d.courses.push(c); }
        persist(); return pubCourse(c);
      }
      case 'deleteCourse': {
        authed();
        d.lectures.filter(l => l.courseId === a.id).forEach(l => delete d.texts[l.id]);
        d.courses = d.courses.filter(c => c.id !== a.id); d.lectures = d.lectures.filter(l => l.courseId !== a.id); d.questions = d.questions.filter(q => q.courseId !== a.id);
        persist(); return true;
      }
      case 'listLectures': authed(); return d.lectures.filter(l => l.courseId === a.courseId).sort((x, y) => x.num - y.num);
      case 'addLecture': {
        const u = authed();
        const rec = { id: id('l_'), courseId: a.courseId, num: Math.round(+a.num || 1), title: a.title, fileName: a.fileName, kind: a.kind, units: a.units, words: a.words, uploadedBy: u.name, uploadedAt: Date.now() };
        d.lectures.push(rec); d.texts[rec.id] = String(a.text || '').slice(0, 200000); persist(); return rec;
      }
      case 'updateLecture': {
        authed(); const l = d.lectures.find(x => x.id === a.id); if (!l) fail('missing', 'المحاضرة مش موجودة');
        if (a.num != null) l.num = Math.round(+a.num); if (a.title != null) l.title = a.title; persist(); return l;
      }
      case 'deleteLecture': authed(); d.lectures = d.lectures.filter(l => l.id !== a.id); delete d.texts[a.id]; persist(); return true;
      case 'getLectureText': authed(); return d.texts[a.id] || '';
      case 'generateForLecture': {
        authed(); const l = d.lectures.find(x => x.id === a.lectureId); if (!l) fail('missing', 'المحاضرة مش موجودة');
        return { demo: true, questions: demoQuestions(l, d.texts[l.id] || '', a.spec, MOCK_CONFIG) };
      }
      case 'getBank': authed(); return d.questions.filter(q => q.courseId === a.courseId);
      case 'saveBank': {
        const u = authed(), now = Date.now();
        d.questions = d.questions.filter(q => q.courseId !== a.courseId).concat(a.questions.map(q => Object.assign({}, q, { courseId: a.courseId, updatedAt: now })));
        const c = d.courses.find(x => x.id === a.courseId); if (c) { c.savedBy = u.name; c.savedAt = now; }
        persist(); return { count: a.questions.length, savedAt: now, savedBy: u.name };
      }
      default: fail('input', 'إجراء غير معروف');
    }
  })();
  return clone(out);
}

export function demoQuestions(l, text, spec, cfg) {
  let lines = String(text).split(/\n+/).map(s => s.replace(/^\s*[-•▪◦*]\s{0,}/, '').replace(/\s+/g, ' ').trim())
    .filter(s => { const w = s.split(' ').length; return w >= 4 && w <= 30 && !/^\[(slide|page)/i.test(s); });
  if (!lines.length) lines = ['this lecture'];
  const typeSeq = [], levelSeq = [], bloomSeq = [];
  (cfg.blooms || []).forEach(t => { for (let i = 0; i < ((spec.blooms || {})[t.id] || 0); i++) bloomSeq.push(t.id); });
  cfg.types.forEach(t => { for (let i = 0; i < (spec.types[t.id] || 0); i++) typeSeq.push(t.id); });
  cfg.levels.forEach(t => { for (let i = 0; i < (spec.levels[t.id] || 0); i++) levelSeq.push(t.id); });
  const out = [];
  for (let i = 0; i < spec.count; i++) {
    const type = typeSeq[i] || 'mcq', src = lines[(i * 7 + (spec.offset || 0)) % lines.length];
    const w = src.split(' '), ex = w.slice(0, 12).join(' ') + (w.length > 12 ? '…' : '');
    const q = { id: id('q_'), lectureId: l.id, type, difficulty: levelSeq[(i * 5) % (levelSeq.length || 1)] || 'medium', bloom: type === 'case' ? 'apply' : (bloomSeq[i] || 'recall'), status: 'draft', source: 'demo', explanation: 'Sample explanation — the real rationale is written once the unified conditions are set.' };
    if (type === 'tf') { q.stem = `Sample statement (demo) based on: “${ex}”`; q.options = ['True', 'False']; q.answer = i % 2; }
    else if (type === 'case') { q.stem = `Sample case (demo): A patient presents in the emergency department… Based on “${ex}”, what is the most appropriate next step?`; q.options = ['Option A (sample)', 'Option B (sample)', 'Option C (sample)', 'Option D (sample)']; q.answer = i % 4; }
    else { q.stem = `Sample question (demo) about: “${ex}” — which of the following is correct?`; q.options = ['Option A (sample)', 'Option B (sample)', 'Option C (sample)', 'Option D (sample)']; q.answer = (i + 1) % 4; }
    out.push(q);
  }
  return out;
}
