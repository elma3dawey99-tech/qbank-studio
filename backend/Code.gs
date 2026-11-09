/**
 * QBank Studio — backend API (Google Apps Script)
 * Emergency & Critical Care Technology Department — Faculty of Applied Health Sciences Technology,
 * Delta University for Science and Technology. Designed by Youssef Mahrous Elmaadawy.
 *
 * The interface lives on GitHub Pages (FRONTEND_URL). This script stores everything in the owner's
 * Google Sheet + Drive and answers JSON requests:  POST {action, token, args}  →  {ok, data} | {error, message}
 *
 * Script Properties (created automatically): DB_ID, ROOT_ID, TOKEN_SECRET.
 * Phase 1: generation returns clearly-marked demo questions until CONFIG.rules + the AI engine are added.
 */

var FRONTEND_URL = 'https://elma3dawey99-tech.github.io/qbank-studio/';

var APP = {
  name: 'QBank Studio',
  title: 'بنوك الأسئلة',
  department: 'تكنولوجيا الطوارئ والرعاية الحرجة',
  departmentEn: 'Emergency & Critical Care Technology',
  faculty: 'كلية تكنولوجيا العلوم الصحية التطبيقية',
  university: 'جامعة الدلتا للعلوم والتكنولوجيا',
  term: 'خريف 2026–2027',
  termEn: 'Fall 2026–2027',
  rev: 2
};

/* ===================== Unified conditions (same for every course) ===================== */
var CONFIG = {
  rulesReady: false,
  rules: [],                       // [{title:'', detail:''}]
  lockShares: false,               // true = colleagues can't change the type / difficulty mix
  types: [
    { id: 'mcq',  label: 'اختيار من متعدد', en: 'MCQ',            options: 4, share: 60 },
    { id: 'tf',   label: 'صح وخطأ',          en: 'True / False',   options: 2, share: 20 },
    { id: 'case', label: 'حالة إكلينيكية',   en: 'Case-based MCQ', options: 4, share: 20 }
  ],
  levels: [
    { id: 'easy',   label: 'سهل',   en: 'Easy',   share: 30 },
    { id: 'medium', label: 'متوسط', en: 'Medium', share: 50 },
    { id: 'hard',   label: 'صعب',   en: 'Hard',   share: 20 }
  ],
  defaultTotal: 50,
  maxPerLecture: 120,
  maxTotal: 600,
  maxLectureChars: 600000
};

var SHEETS = {
  Users:     ['id', 'name', 'nameKey', 'salt', 'hash', 'role', 'createdAt', 'lastLoginAt'],
  Courses:   ['id', 'code', 'name', 'level', 'program', 'target', 'folderId', 'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'savedBy', 'savedAt'],
  Lectures:  ['id', 'courseId', 'num', 'title', 'fileName', 'kind', 'units', 'words', 'textFileId', 'uploadedBy', 'uploadedAt'],
  Questions: ['id', 'courseId', 'lectureId', 'type', 'difficulty', 'stem', 'options', 'answer', 'explanation', 'status', 'source', 'createdBy', 'updatedAt']
};

/* ===================== ECC course catalog (AHS Curricula, Jan 2021) ===================== */
var CATALOG = [
  {"code": "ECC211", "name": "Foundation of the Emergency Medicine", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC212", "name": "Foundation of Critical Care Medicine", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC213", "name": "Emergency in Medicine 1", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC214", "name": "Pathology for Health Science Technologists", "level": 2, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC221", "name": "Respiratory Emergencies", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC222", "name": "Environmental Hygiene and Safety", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC223", "name": "Emergency in Medicine 2", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC224", "name": "Trauma Systems / Mechanism of Injury", "level": 2, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC311", "name": "Airway Management & Ventilation", "level": 3, "term": 1, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC312", "name": "Emergency Practice 1", "level": 3, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC313", "name": "Infection Control", "level": 3, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC314", "name": "Intensive Care Practice 1", "level": 3, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC321", "name": "Cardiac and Diabetic Emergencies", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC322", "name": "Patient Monitoring and Assessments 1", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 0, "fh": 4},
  {"code": "ECC323", "name": "Emergency Practice 2", "level": 3, "term": 2, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC324", "name": "Patient Monitoring and Assessments 2", "level": 3, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 2, "fh": 4},
  {"code": "ECC411", "name": "Intensive Care Practice 2", "level": 4, "term": 1, "elective": false, "cr": 4, "l": 2, "lab": 0, "fh": 8},
  {"code": "ECC412", "name": "Emergency Pharmacology", "level": 4, "term": 1, "elective": false, "cr": 3, "l": 3, "lab": 0, "fh": 0},
  {"code": "ECC413", "name": "Special Considerations in Emergencies & Critical Care", "level": 4, "term": 1, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC414", "name": "Medication Administration", "level": 4, "term": 1, "elective": false, "cr": 2, "l": 2, "lab": 0, "fh": 0},
  {"code": "ECC421", "name": "Emergency Practice 3", "level": 4, "term": 2, "elective": false, "cr": 4, "l": 1, "lab": 2, "fh": 8},
  {"code": "ECC422", "name": "Intensive Care Practice 3", "level": 4, "term": 2, "elective": false, "cr": 3, "l": 1, "lab": 0, "fh": 8},
  {"code": "ECC423", "name": "Graduation Project", "level": 4, "term": 2, "elective": false, "cr": 4, "l": 1, "lab": 2, "fh": 8},
  {"code": "ECC424", "name": "Clinical Anesthesia", "level": 4, "term": 2, "elective": false, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC425", "name": "Anesthesia Equipment", "level": 4, "term": 2, "elective": false, "cr": 2, "l": 2, "lab": 0, "fh": 0},
  {"code": "ECC311E", "name": "Directed Studies in Intensive Care", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC312E", "name": "Principles of Health Care Management System", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC313E", "name": "Ethics and Human Rights", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC314E", "name": "Development and Regulation of Medical Product", "level": 3, "term": 0, "elective": true, "cr": 3, "l": 3, "lab": 0, "fh": 0},
  {"code": "ECC411E", "name": "Quality Systems and Standards in Critical Care", "level": 4, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0},
  {"code": "ECC412E", "name": "Hemorrhage and Shock", "level": 4, "term": 0, "elective": true, "cr": 3, "l": 2, "lab": 2, "fh": 0}
];

/* ===================== Entry points ===================== */
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'ping') return json_({ ok: true, data: { app: APP.name, rev: APP.rev, time: Date.now() } });
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('بنوك الأسئلة · QBank Studio')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return json_({ error: 'input', message: 'طلب غير صالح' }); }
  var fn = API.hasOwnProperty(req.action) ? API[req.action] : null;
  if (!fn) return json_({ error: 'input', message: 'إجراء غير معروف' });
  return json_(run_(function () { return fn(req.args || {}, req.token); }));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== API ===================== */
var API = {
  register: function (a) {
    var name = cleanName_(a.name), pw = String(a.password == null ? '' : a.password);
    if (!validName_(name)) fail_('input', 'اكتب اسمك الثنائي (الاسم الأول واسم العائلة)');
    if (pw.length < 6) fail_('input', 'كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل');
    if (pw.length > 128) fail_('input', 'كلمة المرور طويلة جداً');
    db_();
    var user = withLock_(function () {
      var key = nameKey_(name);
      var users = rows_('Users');
      if (users.some(function (u) { return u.nameKey === key; })) fail_('dup', 'الاسم ده متسجّل قبل كده — لو ده حسابك ادخل من "تسجيل الدخول"');
      var salt = hex_(32);
      var rec = {
        id: 'u_' + hex_(12), name: name, nameKey: key, salt: salt, hash: hashPw_(pw, salt),
        role: users.length ? 'member' : 'admin', createdAt: String(Date.now()), lastLoginAt: String(Date.now())
      };
      append_('Users', rec);
      return rec;
    });
    return session_(user);
  },

  login: function (a) {
    var name = cleanName_(a.name), pw = String(a.password == null ? '' : a.password);
    if (!name || !pw) fail_('input', 'اكتب الاسم وكلمة المرور');
    var key = nameKey_(name), c = CacheService.getScriptCache();
    var fails = Number(c.get('lf_' + key) || 0);
    if (fails >= 8) fail_('locked', 'محاولات كتير غلط على الحساب ده. استنى ربع ساعة وجرّب تاني.');
    db_();
    var u = rows_('Users').filter(function (x) { return x.nameKey === key; })[0];
    if (!u || !safeEq_(hashPw_(pw, u.salt), u.hash)) {
      c.put('lf_' + key, String(fails + 1), 900);
      fail_('auth_bad', 'الاسم أو كلمة المرور غير صحيحة');
    }
    c.remove('lf_' + key);
    try { withLock_(function () { update_('Users', u, { lastLoginAt: String(Date.now()) }); }); } catch (e) {}
    return session_(u);
  },

  me: function (a, tok) { var u = auth_(tok); return boot_(u); },

  changePassword: function (a, tok) {
    var u = auth_(tok), full = rows_('Users').filter(function (x) { return x.id === u.id; })[0];
    if (!full || !safeEq_(hashPw_(String(a.oldPassword || ''), full.salt), full.hash)) fail_('auth_bad', 'كلمة المرور الحالية غير صحيحة');
    var pw = String(a.newPassword || '');
    if (pw.length < 6) fail_('input', 'كلمة المرور الجديدة لازم تكون 6 حروف أو أرقام على الأقل');
    var salt = hex_(32);
    withLock_(function () { update_('Users', full, { salt: salt, hash: hashPw_(pw, salt) }); });
    return true;
  },

  listCourses: function (a, tok) {
    auth_(tok);
    var lec = {}, qs = {}, ok = {};
    rows_('Lectures').forEach(function (l) { lec[l.courseId] = (lec[l.courseId] || 0) + 1; });
    rows_('Questions').forEach(function (q) {
      qs[q.courseId] = (qs[q.courseId] || 0) + 1;
      if (q.status === 'approved') ok[q.courseId] = (ok[q.courseId] || 0) + 1;
    });
    return rows_('Courses').map(function (c) {
      var o = pubCourse_(c);
      o.lectures = lec[c.id] || 0; o.questions = qs[c.id] || 0; o.approved = ok[c.id] || 0;
      return o;
    });
  },

  saveCourse: function (a, tok) {
    var u = auth_(tok);
    var cat = catalogItem_(str_(a.code, 20).toUpperCase().replace(/\s+/g, ''));
    if (!cat) fail_('input', 'اختار المادة من القائمة');
    var rec = {
      code: cat.code, name: cat.name, level: String(cat.level), program: APP.departmentEn,
      target: String(int_(a.target, 0, CONFIG.maxTotal * 4))
    };
    db_();
    return withLock_(function () {
      var all = rows_('Courses');
      var dup = all.filter(function (x) { return x.code === rec.code && x.id !== a.id; })[0];
      if (dup) fail_('dup', 'المادة ' + rec.code + ' موجودة بالفعل');
      var now = String(Date.now());
      if (a.id) {
        var cur = all.filter(function (x) { return x.id === a.id; })[0];
        if (!cur) fail_('missing', 'المادة مش موجودة');
        rec.updatedBy = u.name; rec.updatedAt = now;
        update_('Courses', cur, rec);
        for (var k in rec) cur[k] = rec[k];
        return pubCourse_(cur);
      }
      rec.id = 'c_' + hex_(12);
      rec.createdBy = u.name; rec.createdAt = now; rec.updatedBy = u.name; rec.updatedAt = now;
      append_('Courses', rec);
      var o = pubCourse_(rec); o.lectures = 0; o.questions = 0; o.approved = 0;
      return o;
    });
  },

  deleteCourse: function (a, tok) {
    auth_(tok);
    var id = str_(a.id, 40);
    db_();
    return withLock_(function () {
      var cur = rows_('Courses').filter(function (x) { return x.id === id; })[0];
      if (!cur) fail_('missing', 'المادة مش موجودة');
      if (cur.folderId) { try { DriveApp.getFolderById(cur.folderId).setTrashed(true); } catch (e) {} }
      removeWhere_('Questions', function (q) { return q.courseId === id; });
      removeWhere_('Lectures', function (l) { return l.courseId === id; });
      removeWhere_('Courses', function (x) { return x.id === id; });
      return true;
    });
  },

  listLectures: function (a, tok) {
    auth_(tok);
    var courseId = str_(a.courseId, 40);
    return rows_('Lectures').filter(function (l) { return l.courseId === courseId; }).map(pubLecture_)
      .sort(function (x, y) { return x.num - y.num; });
  },

  addLecture: function (a, tok) {
    var u = auth_(tok);
    var courseId = str_(a.courseId, 40);
    var text = String(a.text || '').slice(0, CONFIG.maxLectureChars);
    if (text.replace(/\s/g, '').length < 20) fail_('input', 'الملف ده مفيهوش نص كفاية');
    var rec = {
      id: 'l_' + hex_(12), courseId: courseId,
      num: String(int_(a.num, 1, 99)),
      title: str_(a.title, 200) || 'Lecture',
      fileName: str_(a.fileName, 200),
      kind: ['pptx', 'pdf', 'docx'].indexOf(a.kind) >= 0 ? a.kind : 'pdf',
      units: String(int_(a.units, 0, 5000)),
      words: String(int_(a.words, 0, 2000000)),
      uploadedBy: u.name, uploadedAt: String(Date.now())
    };
    db_();
    var course = rows_('Courses').filter(function (x) { return x.id === courseId; })[0];
    if (!course) fail_('missing', 'المادة مش موجودة');
    var folder = courseFolder_(course);
    var f = folder.createFile(rec.num + ' - ' + rec.title.replace(/[\\\/:*?"<>|]/g, ' ') + '.txt', text, MimeType.PLAIN_TEXT);
    rec.textFileId = f.getId();
    withLock_(function () { append_('Lectures', rec); });
    return pubLecture_(rec);
  },

  updateLecture: function (a, tok) {
    auth_(tok);
    var id = str_(a.id, 40);
    return withLock_(function () {
      var cur = rows_('Lectures').filter(function (x) { return x.id === id; })[0];
      if (!cur) fail_('missing', 'المحاضرة مش موجودة');
      var rec = {};
      if (a.num != null) rec.num = String(int_(a.num, 1, 99));
      if (a.title != null) rec.title = str_(a.title, 200) || cur.title;
      update_('Lectures', cur, rec);
      for (var k in rec) cur[k] = rec[k];
      return pubLecture_(cur);
    });
  },

  deleteLecture: function (a, tok) {
    auth_(tok);
    var id = str_(a.id, 40);
    return withLock_(function () {
      var cur = rows_('Lectures').filter(function (x) { return x.id === id; })[0];
      if (!cur) return true;
      if (cur.textFileId) { try { DriveApp.getFileById(cur.textFileId).setTrashed(true); } catch (e) {} }
      removeWhere_('Lectures', function (x) { return x.id === id; });
      return true;
    });
  },

  getLectureText: function (a, tok) {
    auth_(tok);
    return lectureText_(lectureById_(str_(a.id, 40)));
  },

  generateForLecture: function (a, tok) {
    auth_(tok);
    var l = lectureById_(str_(a.lectureId, 40));
    if (l.courseId !== str_(a.courseId, 40)) fail_('input', 'المحاضرة مش تبع المادة دي');
    var spec = cleanSpec_(a.spec);
    var text = lectureText_(l);
    // Phase 2: when CONFIG.rulesReady and the AI key exist, the real generator goes here.
    return { demo: true, questions: demoQuestions_(l, text, spec) };
  },

  getBank: function (a, tok) {
    auth_(tok);
    var courseId = str_(a.courseId, 40);
    return rows_('Questions').filter(function (q) { return q.courseId === courseId; }).map(function (q) {
      var opts = [];
      try { opts = JSON.parse(q.options || '[]'); } catch (e) {}
      return {
        id: q.id, lectureId: q.lectureId, type: q.type, difficulty: q.difficulty, stem: q.stem,
        options: opts, answer: Number(q.answer) || 0, explanation: q.explanation, status: q.status,
        source: q.source, createdBy: q.createdBy, updatedAt: Number(q.updatedAt) || 0
      };
    });
  },

  saveBank: function (a, tok) {
    var u = auth_(tok);
    var courseId = str_(a.courseId, 40), qs = a.questions;
    if (!Array.isArray(qs)) fail_('input', 'بيانات البنك غير صحيحة');
    if (qs.length > CONFIG.maxTotal * 4) fail_('input', 'عدد الأسئلة أكبر من المسموح');
    var types = CONFIG.types.map(function (t) { return t.id; });
    var levels = CONFIG.levels.map(function (t) { return t.id; });
    var now = String(Date.now());
    var rows = qs.map(function (q) {
      var opts = (Array.isArray(q.options) ? q.options : []).slice(0, 8).map(function (o) { return str_(o, 1000); });
      return {
        id: /^q_[0-9a-f]{12}$/.test(q.id) ? q.id : 'q_' + hex_(12),
        courseId: courseId,
        lectureId: str_(q.lectureId, 40),
        type: types.indexOf(q.type) >= 0 ? q.type : types[0],
        difficulty: levels.indexOf(q.difficulty) >= 0 ? q.difficulty : levels[1] || levels[0],
        stem: str_(q.stem, 4000),
        options: JSON.stringify(opts),
        answer: String(int_(q.answer, 0, Math.max(0, opts.length - 1))),
        explanation: str_(q.explanation, 4000),
        status: q.status === 'approved' ? 'approved' : 'draft',
        source: ['demo', 'ai', 'manual'].indexOf(q.source) >= 0 ? q.source : 'manual',
        createdBy: str_(q.createdBy, 60) || u.name,
        updatedAt: now
      };
    }).filter(function (r) { return r.stem; });
    db_();
    return withLock_(function () {
      removeWhere_('Questions', function (q) { return q.courseId === courseId; });
      appendMany_('Questions', rows);
      var cur = rows_('Courses').filter(function (x) { return x.id === courseId; })[0];
      if (cur) update_('Courses', cur, { savedBy: u.name, savedAt: now });
      return { count: rows.length, savedAt: Number(now), savedBy: u.name };
    });
  }
};

/* ===================== Accounts & sessions ===================== */
function cleanName_(s) { return str_(s, 80).replace(/\s+/g, ' '); }

function validName_(n) {
  var parts = n.split(' ');
  return parts.length === 2 && parts.every(function (p) { return p.length >= 2 && /^[؀-ۿA-Za-z'\-]+$/.test(p); });
}

function nameKey_(s) {
  return cleanName_(s).toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
}

function hashPw_(pw, salt) {
  var key = Utilities.newBlob(salt).getBytes();
  var h = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(pw)).getBytes(), key);
  for (var i = 0; i < 300; i++) h = Utilities.computeHmacSha256Signature(h, key);
  return Utilities.base64Encode(h);
}

function secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('TOKEN_SECRET');
  if (!s) { s = hex_(64); p.setProperty('TOKEN_SECRET', s); }
  return s;
}

function sig_(body) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, secret_())).replace(/=+$/, '');
}

function session_(u) {
  var body = u.id + '.' + (Date.now() + 30 * 864e5);
  var b = boot_(u);
  b.token = body + '.' + sig_(body);
  return b;
}

function auth_(tok) {
  var parts = String(tok || '').split('.');
  if (parts.length !== 3 || !/^u_[0-9a-f]{12}$/.test(parts[0])) fail_('auth', 'سجّل دخول تاني');
  if (!safeEq_(sig_(parts[0] + '.' + parts[1]), parts[2])) fail_('auth', 'سجّل دخول تاني');
  if (Number(parts[1]) < Date.now()) fail_('auth', 'انتهت الجلسة، سجّل دخول تاني');
  var c = CacheService.getScriptCache(), hit = c.get('u_' + parts[0]);
  if (hit) return JSON.parse(hit);
  var u = rows_('Users').filter(function (x) { return x.id === parts[0]; })[0];
  if (!u) fail_('auth', 'الحساب ده مش موجود');
  var pub = { id: u.id, name: u.name, role: u.role };
  c.put('u_' + u.id, JSON.stringify(pub), 600);
  return pub;
}

function boot_(u) {
  return { user: { id: u.id, name: u.name, role: u.role }, app: APP, config: publicConfig_() };
}

function publicConfig_() {
  var hasAI = !!PropertiesService.getScriptProperties().getProperty('AI_API_KEY');
  return {
    rulesReady: CONFIG.rulesReady, rules: CONFIG.rules, lockShares: CONFIG.lockShares,
    types: CONFIG.types, levels: CONFIG.levels, defaultTotal: CONFIG.defaultTotal,
    maxPerLecture: CONFIG.maxPerLecture, maxTotal: CONFIG.maxTotal, maxLectureChars: CONFIG.maxLectureChars,
    demo: !(CONFIG.rulesReady && hasAI)
  };
}

/* ===================== Courses & lectures helpers ===================== */
function catalogItem_(code) { return CATALOG.filter(function (c) { return c.code === code; })[0] || null; }

function pubCourse_(c) {
  var cat = catalogItem_(c.code);
  return {
    id: c.id, code: c.code, name: cat ? cat.name : c.name, level: cat ? String(cat.level) : c.level,
    credits: cat ? cat.cr : 0, program: APP.departmentEn,
    target: Number(c.target) || 0,
    createdBy: c.createdBy || '', updatedBy: c.updatedBy || '', updatedAt: Number(c.updatedAt) || 0,
    savedBy: c.savedBy || '', savedAt: Number(c.savedAt) || 0
  };
}

function lectureById_(id) {
  var l = rows_('Lectures').filter(function (x) { return x.id === id; })[0];
  if (!l) fail_('missing', 'المحاضرة مش موجودة');
  return l;
}

function lectureText_(l) {
  try { return DriveApp.getFileById(l.textFileId).getBlob().getDataAsString('UTF-8'); }
  catch (e) { fail_('missing', 'ملف نص المحاضرة مش موجود على Drive'); }
}

function pubLecture_(l) {
  return {
    id: l.id, courseId: l.courseId, num: Number(l.num) || 0, title: l.title, fileName: l.fileName,
    kind: l.kind, units: Number(l.units) || 0, words: Number(l.words) || 0,
    uploadedBy: l.uploadedBy || '', uploadedAt: Number(l.uploadedAt) || 0
  };
}

/* ===================== Generation (phase 1 = demo) ===================== */
function cleanSpec_(spec) {
  spec = spec || {};
  var count = int_(spec.count, 1, CONFIG.maxPerLecture);
  function mix(src, list) {
    var out = {}, sum = 0;
    list.forEach(function (t) { out[t.id] = int_(src && src[t.id], 0, count); sum += out[t.id]; });
    if (sum !== count) out = splitShares_(count, list);
    return out;
  }
  return { count: count, offset: int_(spec.offset, 0, 100000), types: mix(spec.types, CONFIG.types), levels: mix(spec.levels, CONFIG.levels) };
}

function splitShares_(n, list) {
  var tot = list.reduce(function (s, t) { return s + t.share; }, 0) || 1;
  var raw = list.map(function (t) { return n * t.share / tot; });
  var out = {}, used = 0;
  list.forEach(function (t, i) { out[t.id] = Math.floor(raw[i]); used += out[t.id]; });
  var order = list.map(function (t, i) { return i; }).sort(function (a, b) { return (raw[b] % 1) - (raw[a] % 1); });
  for (var k = 0; used < n; k++, used++) out[list[order[k % list.length]].id]++;
  return out;
}

function demoQuestions_(l, text, spec) {
  var lines = String(text).split(/\n+/).map(function (s) { return s.replace(/^\s*[-•▪◦*]\s{0,}/, '').replace(/\s+/g, ' ').trim(); })
    .filter(function (s) { var w = s.split(' ').length; return w >= 4 && w <= 30 && !/^\[(slide|page)/i.test(s); });
  if (!lines.length) lines = ['this lecture'];
  var typeSeq = [], levelSeq = [];
  CONFIG.types.forEach(function (t) { for (var i = 0; i < spec.types[t.id]; i++) typeSeq.push(t.id); });
  CONFIG.levels.forEach(function (t) { for (var i = 0; i < spec.levels[t.id]; i++) levelSeq.push(t.id); });
  var out = [];
  for (var i = 0; i < spec.count; i++) {
    var type = typeSeq[i] || 'mcq';
    var src = lines[(i * 7 + spec.offset) % lines.length];
    var words = src.split(' ');
    var excerpt = words.slice(0, 12).join(' ') + (words.length > 12 ? '…' : '');
    var q = {
      id: 'q_' + hex_(12), lectureId: l.id, type: type, difficulty: levelSeq[(i * 5) % levelSeq.length] || 'medium',
      status: 'draft', source: 'demo', explanation: 'Sample explanation — the real rationale is written once the unified conditions are set.'
    };
    if (type === 'tf') {
      q.stem = 'Sample statement (demo) based on: “' + excerpt + '”';
      q.options = ['True', 'False']; q.answer = i % 2;
    } else if (type === 'case') {
      q.stem = 'Sample case (demo): A patient presents in the emergency department… Based on “' + excerpt + '”, what is the most appropriate next step?';
      q.options = ['Option A (sample)', 'Option B (sample)', 'Option C (sample)', 'Option D (sample)']; q.answer = i % 4;
    } else {
      q.stem = 'Sample question (demo) about: “' + excerpt + '” — which of the following is correct?';
      q.options = ['Option A (sample)', 'Option B (sample)', 'Option C (sample)', 'Option D (sample)']; q.answer = (i + 1) % 4;
    }
    out.push(q);
  }
  return out;
}

/* ===================== Storage helpers ===================== */
function db_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('DB_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    id = p.getProperty('DB_ID');
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) {} }
    var ss = SpreadsheetApp.create('QBank Studio – Data');
    Object.keys(SHEETS).forEach(function (n, i) {
      var s = i === 0 ? ss.getSheets()[0].setName(n) : ss.insertSheet(n);
      prepSheet_(s, n);
    });
    try { DriveApp.getFileById(ss.getId()).moveTo(rootFolder_()); } catch (e) {}
    p.setProperty('DB_ID', ss.getId());
    return ss;
  } finally { lock.releaseLock(); }
}

function prepSheet_(s, n) {
  s.getRange('A:Z').setNumberFormat('@');
  s.getRange(1, 1, 1, SHEETS[n].length).setValues([SHEETS[n]]).setFontWeight('bold');
  s.setFrozenRows(1);
}

function rootFolder_() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty('ROOT_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  var folder = DriveApp.createFolder('QBank Studio');
  p.setProperty('ROOT_ID', folder.getId());
  return folder;
}

function courseFolder_(course) {
  if (course.folderId) { try { var f = DriveApp.getFolderById(course.folderId); if (!f.isTrashed()) return f; } catch (e) {} }
  var folder = rootFolder_().createFolder(course.code + ' – ' + (catalogItem_(course.code) || course).name);
  withLock_(function () {
    var cur = rows_('Courses').filter(function (x) { return x.id === course.id; })[0];
    if (cur) update_('Courses', cur, { folderId: folder.getId() });
  });
  course.folderId = folder.getId();
  return folder;
}

function sheet_(name) {
  var ss = db_();
  var s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); prepSheet_(s, name); return s; }
  var lastCol = Math.max(1, s.getLastColumn());
  var head = s.getRange(1, 1, 1, lastCol).getValues()[0];
  var missing = SHEETS[name].filter(function (k) { return head.indexOf(k) < 0; });
  if (missing.length) s.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return s;
}

function header_(s) { return s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0].map(String); }

function rows_(name) {
  var s = sheet_(name);
  var v = s.getDataRange().getValues();
  var h = v.shift().map(String);
  var out = [];
  v.forEach(function (r, i) {
    if (r[0] === '') return;
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j] === '' || r[j] == null ? '' : String(r[j]); });
    out.push(o);
  });
  return out;
}

function append_(name, obj) { appendMany_(name, [obj]); }

function appendMany_(name, list) {
  if (!list.length) return;
  var s = sheet_(name), h = header_(s);
  var vals = list.map(function (o) { return h.map(function (k) { return cell_(o[k]); }); });
  s.getRange(s.getLastRow() + 1, 1, vals.length, h.length).setNumberFormat('@').setValues(vals);
}

function update_(name, cur, patch) {
  var s = sheet_(name), h = header_(s);
  var row = s.getRange(cur._row, 1, 1, h.length);
  var vals = row.getValues()[0];
  if (String(vals[0]) !== cur.id) {
    var again = rows_(name).filter(function (x) { return x.id === cur.id; })[0];
    if (!again) fail_('missing', 'السجل اتغير، حدّث الصفحة');
    cur._row = again._row; row = s.getRange(cur._row, 1, 1, h.length); vals = row.getValues()[0];
  }
  h.forEach(function (k, j) { vals[j] = cell_(patch.hasOwnProperty(k) ? patch[k] : vals[j]); });
  row.setValues([vals]);
}

function removeWhere_(name, pred) {
  var s = sheet_(name), h = header_(s);
  var last = s.getLastRow();
  if (last < 2) return 0;
  var data = s.getRange(2, 1, last - 1, h.length).getValues();
  var keep = data.filter(function (r) {
    var o = {}; h.forEach(function (k, j) { o[k] = String(r[j]); });
    return !pred(o);
  });
  if (keep.length === data.length) return 0;
  s.getRange(2, 1, last - 1, h.length).clearContent();
  if (keep.length) s.getRange(2, 1, keep.length, h.length).setValues(keep.map(function (r) { return r.map(cell_); }));
  return data.length - keep.length;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('busy', 'في حد بيحفظ دلوقتي، جرّب كمان ثواني');
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ===================== Small utilities ===================== */
function run_(fn) {
  try { return { ok: true, data: fn() }; }
  catch (e) {
    if (e && e.qb) return { error: e.code, message: e.message };
    console.error(e && e.stack || e);
    return { error: 'server', message: 'حصل خطأ في الخادم: ' + (e && e.message || e) };
  }
}

function fail_(code, msg) { var e = new Error(msg); e.qb = true; e.code = code; throw e; }

function str_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || 500);
}

function int_(v, min, max) {
  var n = Math.round(Number(v));
  if (!isFinite(n)) n = min;
  return Math.max(min, Math.min(max, n));
}

function cell_(v) {
  v = v == null ? '' : String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function hex_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n).toLowerCase();
}

function safeEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
