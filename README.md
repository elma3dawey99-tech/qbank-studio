# بنوك الأسئلة · QBank Studio

أداة موحدة لتجهيز بنوك الأسئلة لمواد **قسم تكنولوجيا الطوارئ والرعاية الحرجة** — كلية تكنولوجيا العلوم الصحية التطبيقية، جامعة الدلتا للعلوم والتكنولوجيا.

**الرابط:** https://ecc-qbank.pages.dev/

## إزاي بتشتغل
1. اعمل حساب بالاسم الثنائي وكلمة مرور (مرة واحدة) وادخل من أي جهاز.
2. أضف المادة من قائمة مواد القسم (المستوى 2 → 4).
3. ارفع المحاضرات (PowerPoint / PDF / Word) — النص بيتقري على جهازك.
4. حدد عدد الأسئلة والتوزيع، ولّد، راجع واعتمد.
5. احفظ البنك للفريق، وصدّر Word (بنموذج إجابة) أو Excel.

## التكوين
| الجزء | المكان |
|---|---|
| الواجهة | GitHub Pages — الملفات اللي في الريبو ده (`index.html`, `assets/`) |
| البيانات والحسابات | Google Apps Script (`backend/Code.gs`) — Google Sheet + Drive على حساب صاحب الأداة |
| رابط الـ API | `assets/js/config.js` → `API_URL` |
| قائمة المواد | `assets/js/catalog.js` و `CATALOG` في `backend/Code.gs` (لازم يتطابقوا) |
| الشروط الموحدة / أنواع الأسئلة | `CONFIG` في `backend/Code.gs` |

- كلمات المرور بتتحفظ hashed (HMAC-SHA256 × 300 مع salt)، والجلسة توكن موقّع صالح 30 يوم.
- `?mock` في آخر الرابط = وضع معاينة من غير خادم (البيانات على المتصفح بس).

## المرحلة الجاية
إضافة الشروط الموحدة (`CONFIG.rules`) ومحرك الذكاء الاصطناعي في `generateForLecture` بدل الأسئلة التجريبية.

## ملاحظات تقنية للـ Apps Script
- `backend/Index.html` صفحة صغيرة بتوجّه الرابط القديم للموقع الجديد. Apps Script بيشيل التعليقات من صفحات HtmlService بأداة بسيطة ممكن تقص أي سطر فيه `//` — فالصفحة دي من غير JavaScript خالص.
- النشر: Deploy → Manage deployments → Edit → New version (بيحافظ على نفس الرابط).

تصميم: يوسف محروس المعداوي

## محاضرات المواد (`lectures/`)

Lecture collection page: https://ecc-qbank.pages.dev/lectures/ — pick a course, upload its lectures (PowerPoint / PDF / Word), save, download all (as uploaded, or all as PDF).
Open link, no accounts. Files live in the owner's Google Drive folder "محاضرات المواد - ECC" (one folder per course, PDF copies in a `PDF` sub-folder).
Backend: separate Apps Script project "ECC Lectures - محاضرات المواد" (`lectures/backend/Code.gs`), deployed as a web app (execute as owner, access: anyone); its exec URL is `API_URL` in `lectures/index.html`.
