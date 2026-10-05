# 🚀 نشر التطبيق على الإنترنت — GitHub + Render

هدفنا: رفع التطبيق على رابط عام (public URL) حتى يمسح الحضور رمز QR
ويدخلوا من **أي شبكة** (داده الهاتف أو أي WiFi)، بدون الحاجة لنفس الشبكة.

المشروع جاهز: تم تهيئة git وعمل أول commit. تبقى 3 خطوات.

---

## الخطوة 1 — إنشاء مستودع (repo) على GitHub

1. ادخل إلى https://github.com/new
2. **Repository name**: `club-quran-quiz`
3. اختر **Public** (أو Private، كلاهما يعمل مع Render).
4. **لا** تضف README أو .gitignore (عندنا بالفعل).
5. اضغط **Create repository**.
6. ستظهر صفحة فيها أوامر؛ انسخ رابط المستودع، يكون بالشكل:
   `https://github.com/USERNAME/club-quran-quiz.git`

---

## الخطوة 2 — رفع الكود إلى GitHub

افتح PowerShell في مجلد المشروع ونفّذ (استبدل الرابط برابطك):

```powershell
cd C:\Users\Lenovo\club-quran-quiz
git remote add origin https://github.com/USERNAME/club-quran-quiz.git
git push -u origin main
```

> أول مرة سيطلب منك تسجيل الدخول إلى GitHub (نافذة المتصفح) — سجّل الدخول واقبل.
> إن طلب اسم/إيميل خاص بـ git لنفسك، نفّذ قبل الـ push:
> ```powershell
> git config user.name "اسمك"
> git config user.email "بريدك@example.com"
> ```

بعد نجاح الأمر، سيظهر الكود كله على صفحة مستودعك في GitHub.

---

## الخطوة 3 — النشر على Render.com (مجاني)

1. ادخل إلى https://render.com وسجّل الدخول عبر **GitHub** (أسهل طريقة).
2. اضغط **New +** ثم **Web Service**.
3. اختر مستودع **club-quran-quiz** من قائمة GitHub (اربط حسابك إذا طُلب).
4. Render سيقرأ ملف `render.yaml` تلقائياً. تأكد من الإعدادات:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: **Free**
5. اضغط **Create Web Service**.
6. انتظر دقيقة أو دقيقتين حتى تظهر حالة **Live** (أخضر).
7. ستحصل على رابط عام مثل:
   ```
   https://club-quran-quiz.onrender.com
   ```

🎉 التطبيق الآن على الإنترنت!

---

## الروابط بعد النشر (استبدل بالرابط الذي أعطاك إياه Render)

| الاستخدام | الرابط |
|-----------|--------|
| 📱 صفحة QR للعرض على البروجيكتور | `https://....onrender.com/join` |
| 🎮 اللعب مباشرة | `https://....onrender.com` |
| 🏆 لوحة الإدارة + الفائزون | `https://....onrender.com/admin` |
| ⬇️ تحميل Excel | `https://....onrender.com/export.xlsx` |

رمز QR في صفحة `/join` سيشير **تلقائياً** إلى الرابط العام — الحضور يمسحونه ويدخلون من أي شبكة. ✅

---

## ⚠️ ملاحظات مهمة للحدث

1. **قاعدة البيانات مؤقتة على الخطة المجانية:** ملف الإجابات قد يُمحى إذا أعاد
   Render تشغيل الخادم. لحدث واحد لا مشكلة — **حمّل ملف Excel مباشرة بعد انتهاء
   المسابقة** من `/admin` لتحتفظ بالنتائج.

2. **الخطة المجانية "تنام" بعد خمول:** إذا لم يُستخدم التطبيق ~15 دقيقة، يدخل في
   وضع السكون، وأول زيارة بعده تأخذ ~30-50 ثانية ليستيقظ. الحل: افتح الرابط
   **قبل بدء الحدث بدقيقتين** لإيقاظه، ثم كل شيء سريع.

3. **تحديث الكود لاحقاً:** أي تعديل، فقط:
   ```powershell
   git add .
   git commit -m "تحديث"
   git push
   ```
   Render سيعيد النشر تلقائياً.

بالتوفيق! 🤍🌙
