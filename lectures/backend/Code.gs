/**
 * محاضرات المواد — backend API (Google Apps Script)
 * Emergency & Critical Care Technology Department — Delta University for Science and Technology.
 * Designed by Youssef Mahrous Elmaadawy.
 *
 * Collects every course's lecture files in the owner's Google Drive:
 *   "محاضرات المواد - ECC" / "<CODE> - <course name>" / original files
 *                                                    / "PDF" / converted copies (description = original file id)
 * The page lives on Cloudflare Pages (ecc-qbank.pages.dev/lectures/) and talks JSON:
 *   POST {action, args}  ->  {ok, data} | {error, message}
 * Open link by design (no accounts). Every file action is limited to files inside the tool's own folder.
 *
 * Script Properties (created automatically): ROOT_ID, F_<CODE>.
 */

var ROOT_NAME = 'محاضرات المواد - ECC';
var MAX_FILE = 300 * 1024 * 1024;          // per file
var MAX_CHUNK = 12 * 1024 * 1024;          // decoded bytes per upload request
var MAX_READ = 8 * 1024 * 1024;            // bytes per download request
var KINDS = { pptx: 'slides', ppt: 'slides', ppsx: 'slides', pps: 'slides', docx: 'doc', doc: 'doc', pdf: 'pdf' };
var GOOGLE_TYPE = { slides: 'application/vnd.google-apps.presentation', doc: 'application/vnd.google-apps.document' };
var API_FILES = 'https://www.googleapis.com/drive/v3/files';

var CATALOG = [
  ["ECC211","Foundation of the Emergency Medicine"],
  ["ECC212","Foundation of Critical Care Medicine"],
  ["ECC213","Emergency in Medicine 1"],
  ["ECC214","Pathology for Health Science Technologists"],
  ["ECC221","Respiratory Emergencies"],
  ["ECC222","Environmental Hygiene and Safety"],
  ["ECC223","Emergency in Medicine 2"],
  ["ECC224","Trauma Systems / Mechanism of Injury"],
  ["ECC311","Airway Management & Ventilation"],
  ["ECC312","Emergency Practice 1"],
  ["ECC313","Infection Control"],
  ["ECC314","Intensive Care Practice 1"],
  ["ECC321","Cardiac and Diabetic Emergencies"],
  ["ECC322","Patient Monitoring and Assessments 1"],
  ["ECC323","Emergency Practice 2"],
  ["ECC324","Patient Monitoring and Assessments 2"],
  ["ECC411","Intensive Care Practice 2"],
  ["ECC412","Emergency Pharmacology"],
  ["ECC413","Special Considerations in Emergencies & Critical Care"],
  ["ECC414","Medication Administration"],
  ["ECC421","Emergency Practice 3"],
  ["ECC422","Intensive Care Practice 3"],
  ["ECC423","Graduation Project"],
  ["ECC424","Clinical Anesthesia"],
  ["ECC425","Anesthesia Equipment"],
  ["ECC311E","Directed Studies in Intensive Care"],
  ["ECC312E","Principles of Health Care Management System"],
  ["ECC313E","Ethics and Human Rights"],
  ["ECC314E","Development and Regulation of Medical Product"],
  ["ECC411E","Quality Systems and Standards in Critical Care"],
  ["ECC412E","Hemorrhage and Shock"]
];

/* ===================== Entry points ===================== */
function doGet() { return json_({ ok: true, data: { app: 'ecc-lectures', time: Date.now() } }); }

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return json_({ error: 'input', message: 'طلب غير صالح' }); }
  var fn = API.hasOwnProperty(req.action) ? API[req.action] : null;
  if (!fn) return json_({ error: 'input', message: 'إجراء غير معروف' });
  try { return json_({ ok: true, data: fn(req.args || {}) }); }
  catch (err) {
    if (err && err.qb) return json_({ error: err.code, message: err.message });
    console.error(err && err.stack || err);
    return json_({ error: 'server', message: 'حصل خطأ في الخادم: ' + (err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to grant the Drive + external-request permissions. */
function setup() { rootFolder_(); UrlFetchApp.fetch(API_FILES + '?pageSize=1&fields=files(id)', { headers: bearer_() }); return 'ok'; }

/* ===================== API ===================== */
var API = {
  /** Number of saved lectures per course code. */
  overview: function () {
    var c = CacheService.getScriptCache(), hit = c.get('overview');
    if (hit) return JSON.parse(hit);
    var out = {}, it = rootFolder_().getFolders();
    while (it.hasNext()) {
      var f = it.next(), code = String(f.getName()).split(' ')[0];
      if (!catalogItem_(code)) continue;
      out[code] = (out[code] || 0) + listFiles_(f, false).length;
    }
    c.put('overview', JSON.stringify(out), 300);
    return out;
  },

  list: function (a) {
    var folder = courseFolder_(code_(a.code), false);
    return folder ? listFiles_(folder, true) : [];
  },

  /** Opens a Drive resumable-upload session; the bytes follow through `chunk`. */
  start: function (a) {
    var code = code_(a.code), name = fileName_(a.name), size = Math.round(Number(a.size));
    if (!(size > 0)) fail_('input', 'الملف ده فاضي');
    if (size > MAX_FILE) fail_('input', 'الملف أكبر من ' + Math.round(MAX_FILE / 1048576) + ' ميجا');
    var folder = courseFolder_(code, true);
    var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'post', contentType: 'application/json; charset=UTF-8',
      headers: merge_(bearer_(), { 'X-Upload-Content-Length': String(size) }),
      payload: JSON.stringify({ name: name, parents: [folder.getId()] }),
      muteHttpExceptions: true
    });
    var url = header_(res, 'Location');
    if (res.getResponseCode() !== 200 || !url) fail_('server', 'تعذّر بدء الرفع على Drive (' + res.getResponseCode() + ')');
    var id = hex_(24);
    CacheService.getScriptCache().put('up_' + id, JSON.stringify({ url: url, size: size, code: code, name: name, folderId: folder.getId() }), 21600);
    return { uploadId: id, maxChunk: MAX_CHUNK };
  },

  /**
   * Sends one piece ({uploadId, offset, data: base64}); without `data` it only asks Drive where to resume.
   * Returns {next} (the next byte offset to send) or {done: true, file}.
   */
  chunk: function (a) {
    var raw = CacheService.getScriptCache().get('up_' + str_(a.uploadId, 40));
    if (!raw) fail_('missing', 'جلسة الرفع انتهت — ارفع الملف تاني');
    var up = JSON.parse(raw), range, bytes = null;
    if (a.data) {
      bytes = Utilities.base64Decode(String(a.data));
      var off = Math.round(Number(a.offset)) || 0;
      if (!bytes.length || bytes.length > MAX_CHUNK || off < 0 || off + bytes.length > up.size) fail_('input', 'جزء غير صالح من الملف');
      range = 'bytes ' + off + '-' + (off + bytes.length - 1) + '/' + up.size;
    } else range = 'bytes */' + up.size;
    var opt = { method: 'put', headers: { 'Content-Range': range }, muteHttpExceptions: true, followRedirects: false };
    if (bytes) { opt.payload = bytes; opt.contentType = 'application/octet-stream'; }
    var res = UrlFetchApp.fetch(up.url, opt), status = res.getResponseCode();
    if (status === 308) {
      var m = /-(\d+)$/.exec(header_(res, 'Range') || '');
      return { next: m ? Number(m[1]) + 1 : 0 };
    }
    if (status === 200 || status === 201) {
      var fileId = JSON.parse(res.getContentText()).id;
      CacheService.getScriptCache().remove('up_' + a.uploadId);
      var folder = DriveApp.getFolderById(up.folderId);
      replaceOlder_(folder, up.name, fileId);
      changed_();
      return { done: true, file: fileInfo_(DriveApp.getFileById(fileId), pdfIndex_(folder)) };
    }
    if (status === 404 || status === 410) fail_('missing', 'جلسة الرفع انتهت — ارفع الملف تاني');
    fail_('server', 'Drive رفض الجزء ده (' + status + ')');
  },

  /** Makes (or returns) the PDF copy of a PowerPoint / Word file. */
  convert: function (a) {
    var f = ownFile_(a.id), kind = KINDS[ext_(f.getName())];
    if (kind === 'pdf') return { id: f.getId(), size: f.getSize() };
    if (!GOOGLE_TYPE[kind]) fail_('input', 'النوع ده مينفعش يتحوّل PDF');
    var folder = f.getParents().next(), pdfs = pdfFolder_(folder, true), have = pdfIndex_(folder)[f.getId()];
    if (have) return have;
    var copy = UrlFetchApp.fetch(API_FILES + '/' + f.getId() + '/copy?fields=id', {
      method: 'post', contentType: 'application/json; charset=UTF-8', headers: bearer_(),
      payload: JSON.stringify({ name: 'converting - ' + f.getName(), mimeType: GOOGLE_TYPE[kind], parents: [pdfs.getId()] }),
      muteHttpExceptions: true
    });
    if (copy.getResponseCode() !== 200) fail_('convert', 'Google مقدرش يفتح الملف ده عشان يحوّله (' + copy.getResponseCode() + ')');
    var gid = JSON.parse(copy.getContentText()).id;
    try {
      var blob = exportPdf_(gid, kind);
      var pdf = pdfs.createFile(blob.setName(f.getName().replace(/\.[^.]+$/, '') + '.pdf'));
      pdf.setDescription(f.getId());
      return { id: pdf.getId(), size: pdf.getSize() };
    } finally {
      try { UrlFetchApp.fetch(API_FILES + '/' + gid, { method: 'delete', headers: bearer_(), muteHttpExceptions: true }); } catch (x) {}
    }
  },

  /** One piece of a file's bytes, base64. */
  read: function (a) {
    var f = ownFile_(a.id), size = f.getSize();
    var off = Math.max(0, Math.round(Number(a.offset)) || 0);
    var len = Math.max(1, Math.min(MAX_READ, Math.round(Number(a.length)) || MAX_READ));
    if (off >= size) return { data: '', size: size };
    var end = Math.min(size, off + len) - 1;
    var res = UrlFetchApp.fetch(API_FILES + '/' + f.getId() + '?alt=media', {
      headers: merge_(bearer_(), { Range: 'bytes=' + off + '-' + end }), muteHttpExceptions: true
    });
    var status = res.getResponseCode();
    if (status !== 206 && status !== 200) fail_('server', 'تعذّرت قراءة الملف من Drive (' + status + ')');
    var bytes = res.getContent();
    if (status === 200 && bytes.length > end - off + 1) bytes = bytes.slice(off, end + 1);
    return { data: Utilities.base64Encode(bytes), size: size };
  },

  /** Moves a lecture (and its PDF copy) to the Drive trash. */
  remove: function (a) {
    var f = ownFile_(a.id), folder = f.getParents().next();
    var pdf = pdfIndex_(folder)[f.getId()];
    if (pdf) { try { DriveApp.getFileById(pdf.id).setTrashed(true); } catch (x) {} }
    f.setTrashed(true);
    changed_();
    return true;
  }
};

/* ===================== Folders & files ===================== */
function rootFolder_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty('ROOT_ID');
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  return withLock_(function () {
    id = p.getProperty('ROOT_ID');
    if (id) { try { var g = DriveApp.getFolderById(id); if (!g.isTrashed()) return g; } catch (e) {} }
    var folder = DriveApp.createFolder(ROOT_NAME);
    p.setProperty('ROOT_ID', folder.getId());
    return folder;
  });
}

function courseFolder_(code, create) {
  var p = PropertiesService.getScriptProperties(), key = 'F_' + code, id = p.getProperty(key);
  if (id) { try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  if (!create) return null;
  return withLock_(function () {
    id = p.getProperty(key);
    if (id) { try { var g = DriveApp.getFolderById(id); if (!g.isTrashed()) return g; } catch (e) {} }
    var folder = rootFolder_().createFolder(code + ' - ' + catalogItem_(code)[1].replace(/[\\\/:*?"<>|]/g, ' '));
    p.setProperty(key, folder.getId());
    return folder;
  });
}

function pdfFolder_(folder, create) {
  var it = folder.getFoldersByName('PDF');
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return create ? folder.createFolder('PDF') : null;
}

/** original file id -> {id, size} of its PDF copy */
function pdfIndex_(folder) {
  var out = {}, pdfs = pdfFolder_(folder, false);
  if (!pdfs) return out;
  var it = pdfs.getFiles();
  while (it.hasNext()) {
    var f = it.next(), d = f.getDescription();
    if (d && !f.isTrashed() && KINDS[ext_(f.getName())] === 'pdf') out[d] = { id: f.getId(), size: f.getSize() };
  }
  return out;
}

function listFiles_(folder, full) {
  var out = [], idx = full ? pdfIndex_(folder) : null, it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed() || !KINDS[ext_(f.getName())]) continue;
    out.push(full ? fileInfo_(f, idx) : 1);
  }
  return out;
}

function fileInfo_(f, idx) {
  var ext = ext_(f.getName()), pdf = KINDS[ext] === 'pdf' ? { id: f.getId(), size: f.getSize() } : (idx[f.getId()] || null);
  return { id: f.getId(), name: f.getName(), ext: ext, size: f.getSize(), at: f.getDateCreated().getTime(), pdf: pdf };
}

/** A re-upload with the same name replaces the older file (and its PDF copy). */
function replaceOlder_(folder, name, keepId) {
  var idx = null, it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getId() === keepId || f.isTrashed()) continue;
    idx = idx || pdfIndex_(folder);
    if (idx[f.getId()]) { try { DriveApp.getFileById(idx[f.getId()].id).setTrashed(true); } catch (x) {} }
    f.setTrashed(true);
  }
}

/** Only files that sit directly inside one of the tool's course folders may be read, converted or removed. */
function ownFile_(id) {
  id = str_(id, 80);
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) fail_('input', 'ملف غير معروف');
  var f, rootId = rootFolder_().getId();
  try { f = DriveApp.getFileById(id); } catch (e) { fail_('missing', 'الملف مش موجود'); }
  if (f.isTrashed()) fail_('missing', 'الملف اتمسح');
  var ps = f.getParents();
  while (ps.hasNext()) {
    var p = ps.next(), level = 0;
    while (p && level < 2) {                       // course folder, or its PDF sub-folder
      var up = p.getParents();
      p = up.hasNext() ? up.next() : null;
      if (p && p.getId() === rootId) return f;
      level++;
    }
  }
  fail_('missing', 'الملف مش موجود');
}

function exportPdf_(gid, kind) {
  var meta = UrlFetchApp.fetch(API_FILES + '/' + gid + '?fields=exportLinks', { headers: bearer_(), muteHttpExceptions: true });
  var links = [];
  try { links.push(JSON.parse(meta.getContentText()).exportLinks['application/pdf']); } catch (e) {}
  links.push('https://docs.google.com/' + (kind === 'slides' ? 'presentation' : 'document') + '/d/' + gid + '/export?format=pdf');
  links.push(API_FILES + '/' + gid + '/export?mimeType=application%2Fpdf');
  var last = 0;
  for (var i = 0; i < links.length; i++) {
    if (!links[i]) continue;
    var res = UrlFetchApp.fetch(links[i], { headers: bearer_(), muteHttpExceptions: true });
    last = res.getResponseCode();
    if (last === 200) { var b = res.getBlob(); if (b.getBytes().length > 100) return b.setContentType('application/pdf'); }
  }
  fail_('convert', 'التحويل لـ PDF فشل (' + last + ') — الملف ممكن يكون كبير جداً');
}

function changed_() { CacheService.getScriptCache().remove('overview'); }

/* ===================== Small utilities ===================== */
function catalogItem_(code) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i][0] === code) return CATALOG[i]; return null; }

function code_(v) {
  var code = str_(v, 20).toUpperCase().replace(/\s+/g, '');
  if (!catalogItem_(code)) fail_('input', 'اختار المادة من القائمة');
  return code;
}

function ext_(name) { var m = /\.([A-Za-z0-9]+)$/.exec(String(name)); return m ? m[1].toLowerCase() : ''; }

function fileName_(v) {
  var name = str_(v, 200).replace(/[\\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!KINDS[ext_(name)] || name.replace(/\.[^.]+$/, '') === '') fail_('input', 'المسموح: PowerPoint و PDF و Word بس');
  return name;
}

function bearer_() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }; }

function merge_(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

function header_(res, name) {
  var h = res.getHeaders(), low = name.toLowerCase();
  for (var k in h) if (String(k).toLowerCase() === low) return String(h[k]);
  return '';
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) fail_('busy', 'الخادم مشغول، جرّب كمان ثواني');
  try { return fn(); } finally { lock.releaseLock(); }
}

function fail_(code, msg) { var e = new Error(msg); e.qb = true; e.code = code; throw e; }

function str_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }

function hex_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n).toLowerCase();
}
