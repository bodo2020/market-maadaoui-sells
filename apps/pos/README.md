# المعداوي POS لأندرويد

هذه الحزمة تغلّف **تطبيق POS الرئيسي** الموجود في جذر المستودع بـ Capacitor 7. شاشة `/` هي شاشة الكاشير الأصلية. هوية التطبيق `com.elmadawy.pos` مستقلة عن تطبيق Growth وعن تطبيق Staff.

## بناء APK تجريبي

شغّل GitHub Actions → **Main POS APK** → **Run workflow**. ستجد ملف APK في Artifacts باسم `elmadawy-pos-<رقم التشغيل>` بعد اكتمال البناء. الـ APK تجريبي وموقّع بمفتاح Android الافتراضي للتطوير؛ إصدار المتجر يحتاج مفتاح توقيع محفوظ وآلية نشر خاصة به.

## تطوير محلي

يلزم Node.js 22 وAndroid Studio وJDK 21 وAndroid SDK:

```sh
npm ci
npm run build
cd apps/pos
npm install
npm run android:add     # أول مرة فقط؛ لا تعِد توليد android بعد تخصيصه
python3 ../../scripts/configure-pos-android.py
npm run android:sync
npm run android:open
```

لو مشروع `android` موجود استخدم `npm run android:sync` بعد أي تغيير في واجهة الويب. صلاحية الكاميرا موجودة لماسح الباركود. يعمل الغلاف بالملفات المدمجة محليًا ويتصل بخدمات Supabase عبر HTTPS؛ العمليات التي تتطلب الشبكة ما زالت تحتاج اتصالًا، وآلية البيع دون اتصال تتبع قواعد POS نفسه.
