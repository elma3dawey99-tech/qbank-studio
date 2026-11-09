/* ---------------- tiny utils ---------------- */
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ic = (n, c = '') => `<svg class="ico ${c}"><use href="#i-${n}"/></svg>`;
export const fmt = n => Number(n || 0).toLocaleString('en-US');
export const uid = p => p + Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => b.toString(16).padStart(2, '0')).join('');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const toInt = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
export const isAr = s => /[؀-ۿ]/.test(s);

export function plural(n, one, two, few, many) {
  return n === 1 ? one : n === 2 ? two : (n >= 3 && n <= 10) ? `${n} ${few}` : `${fmt(n)} ${many}`;
}
export function nLec(n) { return n === 0 ? 'لا محاضرات' : plural(n, 'محاضرة واحدة', 'محاضرتين', 'محاضرات', 'محاضرة'); }
export function ago(ms) {
  if (!ms) return '';
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'الآن';
  const m = Math.round(s / 60); if (m < 60) return 'منذ ' + plural(m, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const h = Math.round(m / 60); if (h < 24) return 'منذ ' + plural(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  const d = Math.round(h / 24); if (d < 30) return 'منذ ' + plural(d, 'يوم', 'يومين', 'أيام', 'يوم');
  return new Date(ms).toLocaleDateString('ar-EG');
}
export function store(k, v) {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k));
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { return null; }
}
const loaded = {};
export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('تعذّر تحميل مكتبة مطلوبة — اتأكد من الإنترنت')); };
    document.head.appendChild(s);
  });
  return loaded[src];
}
export function termHtml(t) { return esc(t).replace(/(\d{4})\s*[–-]\s*(\d{4})/, '<bdi dir="ltr">$1–$2</bdi>'); }
export function countUp(el, to, ms = 900) {
  if (!el) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || to < 2) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = t => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt(Math.round(to * e)); if (p < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}

export const LIBS = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
};
export async function needZip() { if (!window.JSZip) await loadScript(LIBS.jszip); return window.JSZip; }

/* ---------------- text extraction (runs on the user's device) ---------------- */
function resolvePath(dir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = dir ? dir.split('/') : [];
  for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); }
  return parts.join('/');
}
async function zipXml(zip, path) {
  const f = zip.file(path); if (!f) return null;
  return new DOMParser().parseFromString(await f.async('string'), 'application/xml');
}
async function zipRels(zip, path) {
  const i = path.lastIndexOf('/'), dir = path.slice(0, i), d = await zipXml(zip, `${dir}/_rels/${path.slice(i + 1)}.rels`);
  const m = {}; if (!d) return m;
  for (const r of d.getElementsByTagName('Relationship')) m[r.getAttribute('Id')] = { target: resolvePath(dir, r.getAttribute('Target') || ''), type: r.getAttribute('Type') || '' };
  return m;
}
function paras(doc, pTag, tTag) {
  const out = [];
  for (const p of doc.getElementsByTagName(pTag)) {
    let t = ''; for (const n of p.getElementsByTagName(tTag)) t += n.textContent;
    t = t.replace(/\s+/g, ' ').trim(); if (t) out.push(t);
  }
  return out;
}
async function extractPptx(buf, withNotes, onProg) {
  const JSZip = await needZip(), zip = await JSZip.loadAsync(buf);
  let slides = [];
  const pres = await zipXml(zip, 'ppt/presentation.xml');
  if (pres) {
    const pr = await zipRels(zip, 'ppt/presentation.xml');
    for (const s of pres.getElementsByTagName('p:sldId')) { const r = pr[s.getAttribute('r:id')]; if (r && zip.file(r.target)) slides.push(r.target); }
  }
  if (!slides.length) slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1]);
  const out = [];
  for (let i = 0; i < slides.length; i++) {
    const d = await zipXml(zip, slides[i]); if (!d) continue;
    out.push(`[Slide ${i + 1}]`, ...paras(d, 'a:p', 'a:t'));
    if (withNotes) {
      const rel = Object.values(await zipRels(zip, slides[i])).find(r => /notesSlide$/.test(r.type));
      if (rel) { const nd = await zipXml(zip, rel.target); if (nd) { const n = paras(nd, 'a:p', 'a:t').filter(t => !/^\d+$/.test(t)); if (n.length) out.push('Notes: ' + n.join(' ')); } }
    }
    onProg && onProg(i + 1, slides.length);
  }
  return { text: out.join('\n'), units: slides.length };
}
async function extractDocx(buf, onProg) {
  const JSZip = await needZip(), zip = await JSZip.loadAsync(buf);
  const d = await zipXml(zip, 'word/document.xml');
  if (!d) throw new Error('الملف مش Word صالح');
  const out = [];
  for (const p of d.getElementsByTagName('w:p')) {
    let t = '';
    for (const n of p.getElementsByTagName('*')) {
      if (n.nodeName === 'w:t') t += n.textContent;
      else if (n.nodeName === 'w:tab') t += ' ';
      else if (n.nodeName === 'w:br' || n.nodeName === 'w:cr') t += '\n';
    }
    t = t.replace(/[ \t]+/g, ' ').trim(); if (t) out.push(t);
  }
  onProg && onProg(1, 1);
  return { text: out.join('\n'), units: Math.max(1, Math.round(out.join(' ').split(/\s+/).length / 450)) };
}
async function extractPdf(buf, onProg) {
  if (!window.pdfjsLib) { await loadScript(LIBS.pdf); window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker; }
  const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i), tc = await page.getTextContent();
    const lines = []; let line = '';
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      line += it.str;
      if (it.hasEOL) { lines.push(line); line = ''; } else if (it.str && !/\s$/.test(it.str)) line += ' ';
    }
    if (line.trim()) lines.push(line);
    out.push(`[Page ${i}]`, ...lines.map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean));
    onProg && onProg(i, pdf.numPages);
    page.cleanup && page.cleanup();
  }
  pdf.destroy && pdf.destroy();
  return { text: out.join('\n'), units: pdf.numPages };
}
const countWords = text => text.split('\n').filter(l => !/^\[(Slide|Page) \d+\]$/.test(l)).join(' ').split(/\s+/).filter(Boolean).length;
export async function extractFile(file, { withNotes = true, onProg } = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'ppt' || ext === 'doc') throw new Error('الصيغة القديمة (.' + ext + ') مش مدعومة — افتح الملف واحفظه بصيغة .' + ext + 'x');
  if (!['pptx', 'pdf', 'docx'].includes(ext)) throw new Error('نوع الملف مش مدعوم — المسموح PowerPoint و PDF و Word');
  if (file.size > 150 * 1024 * 1024) throw new Error('الملف أكبر من 150 ميجا');
  const buf = await file.arrayBuffer();
  const r = ext === 'pptx' ? await extractPptx(buf, withNotes, onProg) : ext === 'docx' ? await extractDocx(buf, onProg) : await extractPdf(buf, onProg);
  r.kind = ext; r.words = countWords(r.text);
  return r;
}
export function guessNum(name, fallback) {
  const m = name.match(/(?:lec(?:ture)?|lect|ch(?:apter)?|module|محاضر[ةه]|L)\s*[-_.#]?\s*(\d{1,2})(?!\d)/i) || name.match(/^(\d{1,2})(?!\d)/);
  return m ? +m[1] : fallback;
}
export const cleanTitle = name => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

/* ---------------- distribution math ---------------- */
export function largestRemainder(total, weights) {
  if (!weights.length) return [];
  let w = weights; if (w.reduce((a, b) => a + b, 0) <= 0) w = w.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map(x => total * x / sum), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => i).sort((a, b) => (raw[b] % 1) - (raw[a] % 1));
  for (let k = 0; left > 0; k++, left--) out[order[k % order.length]]++;
  return out;
}
export function splitShares(n, shares, list) {
  const parts = largestRemainder(n, list.map(t => Math.max(0, Number(shares[t.id]) || 0)));
  const o = {}; list.forEach((t, i) => o[t.id] = parts[i] || 0); return o;
}
export const sharesSum = obj => Object.values(obj).reduce((a, b) => a + (Number(b) || 0), 0);
export function takeMix(pool, n, list) {
  const left = sharesSum(pool), out = {};
  if (left <= n) { list.forEach(t => { out[t.id] = pool[t.id]; pool[t.id] = 0; }); return out; }
  const part = splitShares(n, Object.fromEntries(list.map(t => [t.id, pool[t.id]])), list);
  list.forEach(t => { out[t.id] = Math.min(part[t.id], pool[t.id]); pool[t.id] -= out[t.id]; });
  return out;
}

/* ---------------- Word (.docx) builder ---------------- */
const xe = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function wRun(text, o = {}) {
  const pr = `<w:rPr>${o.b ? '<w:b/><w:bCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}${isAr(text) ? '<w:rtl/>' : ''}</w:rPr>`;
  return String(text).split('\n').map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${pr}<w:t xml:space="preserve">${xe(line)}</w:t></w:r>`).join('');
}
export function wP(runs, o = {}) {
  const list = typeof runs === 'string' ? [Object.assign({ t: runs }, o)] : runs;
  const ar = o.bidi != null ? o.bidi : isAr(list.map(r => r.t).join(''));
  return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}${ar ? '<w:bidi/>' : ''}<w:spacing w:before="${o.before || 0}" w:after="${o.after == null ? 60 : o.after}"/>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ''}${o.align ? `<w:jc w:val="${o.align}"/>` : ''}</w:pPr>${list.map(r => wRun(r.t, r)).join('')}</w:p>`;
}
export function wTable(rows, widths) {
  const tr = (cells, head) => `<w:tr>${cells.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="E7F0FA"/>' : ''}</w:tcPr>${wP([{ t: String(c), b: head, sz: 20 }], { after: 0 })}</w:tc>`).join('')}</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="BFC9D6"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.map((r, i) => tr(r, i === 0)).join('')}</w:tbl>`;
}
export async function docxBlob(bodyXml) {
  const OX = 'http://schemas.openxmlformats.org/';
  const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const doc = `${DECL}<w:document xmlns:w="${OX}wordprocessingml/2006/main" xmlns:r="${OX}officeDocument/2006/relationships"><w:body>${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `${DECL}<w:styles xmlns:w="${OX}wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial" w:eastAsia="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB" w:bidi="ar-EG"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>`;
  const JSZip = await needZip(), zip = new JSZip();
  zip.file('[Content_Types].xml', `${DECL}<Types xmlns="${OX}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `${DECL}<Relationships xmlns="${OX}package/2006/relationships"><Relationship Id="rId1" Type="${OX}officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `${DECL}<Relationships xmlns="${OX}package/2006/relationships"><Relationship Id="rId1" Type="${OX}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('word/document.xml', doc);
  zip.file('word/styles.xml', styles);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
export function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
