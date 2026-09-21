# Staff Native Push — Setup & Release Guide

App package: `com.elmadawy.staff`
Staff version: `0.14.0`
Provider: FCM HTTP v1

## Architecture

Staff لا يملك Push backend منفصل. التطبيق يستخدم البنية الموحدة الموجودة بالفعل:

- Device registration: `register_push_device_v2`
- Device status: `get_my_push_device_status_v2`
- Device unregister: `unregister_push_device_v2`
- Queue: `private.notification_delivery_queue_v2`
- Worker: `process-push-notifications`
- Provider health: `private.push_provider_operational_snapshot_v1()`
- Credential source: Supabase Vault secret named `fcm_service_account_json`

الـEdge Worker على هذا الفرع يقرأ:
1. `FCM_SERVICE_ACCOUNT_JSON` إن وُجد كـEdge environment secret.
2. ثم Supabase Vault عبر `get_push_provider_secret_v1` كـfallback موحد.

## Current production status at development time

لا تفترض أن Push جاهز لمجرد أن الـAPK يحتوي Plugin.

وقت تطوير 0.14.0 كانت الحالة:
- Push worker: disabled.
- FCM provider: not configured.
- Active Staff Push devices: 0.
- توجد أجهزة Push لأنواع تطبيقات أخرى، لكن ليس Staff.

لا تشغّل الـworker قبل اكتمال الخطوات التالية.

## 1. Firebase Android client

أنشئ/استخدم Firebase project الخاص بالمعداوي، ثم Android app بالـpackage:

`com.elmadawy.staff`

نزّل `google-services.json` الخاص بهذه الحزمة.

### GitHub Actions

لا ترفع الملف إلى Git.

حوّل محتوى `google-services.json` إلى Base64 وضعه في GitHub Actions secret:

`STAFF_FIREBASE_GOOGLE_SERVICES_JSON_BASE64`

Workflow `.github/workflows/staff-apk.yml`:
- يفك الـBase64 إلى `android/app/google-services.json`.
- يتحقق أن JSON صالح.
- يسجل `push_client_configured=true` في `staff-build-info.txt`.
- إذا الـsecret غير موجود، الـAPK التجريبي يظل يبني ويعمل لكن Native Push registration لن يكتمل.

## 2. FCM HTTP v1 service account

استخدم Service Account مخصص لإرسال FCM HTTP v1 وبأقل صلاحيات لازمة.

لا تضع JSON في Git أو في client APK.

المصدر المعتمد في قاعدة البيانات هو Supabase Vault بالاسم:

`fcm_service_account_json`

يفضل إدخاله من Supabase Dashboard > Vault.

لو تم الإدخال من SQL Editor، صيغة Vault الحالية تدعم:

```sql
select vault.create_secret(
  '<FCM_SERVICE_ACCOUNT_JSON>',
  'fcm_service_account_json',
  'Elmadawy FCM HTTP v1 service account'
);
```

لا تنفذ المثال حرفيًا بقيمة Placeholder، ولا تحفظ نسخة ثانية بنفس الاسم إن كان Secret موجودًا؛ استخدم update/rotation بصورة منظمة.

## 3. Deploy worker version

قبل تشغيل Push في Production، انشر نسخة:

`supabase/functions/process-push-notifications/index.ts`

الموجودة على فرع Staff بعد مراجعتها.

الـworker يستخدم custom authentication بواسطة:
- `x-notification-worker-secret`
- `verify_notification_worker_secret_v2`

لا تغيّر هذا إلى endpoint عام.

## 4. Provider health gate

بعد إضافة FCM credential، افحص الحالة بدون عرض الـsecret:

```sql
select private.push_provider_operational_snapshot_v1();
```

المطلوب قبل التفعيل:
- `provider_configured = true`
- `provider_valid = true`
- `project_id` مطابق لمشروع Firebase المتوقع
- issue `FCM_NOT_CONFIGURED` غير موجود

في هذه المرحلة يمكن أن يظل:
- `worker_enabled = false`
- `ready = false`

وده طبيعي قبل التفعيل النهائي.

## 5. Staff device registration

ثبّت APK مبني ومعه Firebase client config.

من:
**خدماتي → إشعارات العمل → تفعيل إشعارات العمل**

المتوقع:
1. Android permission يظهر عند الحاجة فقط.
2. يحصل التطبيق على FCM token.
3. يسجل الجهاز بـ:
   - `app_kind = staff`
   - `platform = android`
   - `provider = fcm`
   - device key من هوية الجهاز الموثوقة.
4. يظهر الجهاز ضمن Push status.

لا تطلب Permission تلقائيًا كل مرة عند فتح التطبيق.

## 6. Enable worker

فقط بعد نجاح provider health + تسجيل Staff device اختباري.

التفعيل يتم من مسار الإدارة الحالي الخاص بـPush / `set_push_worker_enabled_v1` بواسطة Super Admin.

بعدها يجب أن تصبح health status:
- `worker_enabled = true`
- `ready = true`

## 7. Functional test

اختبر Notification واحدة لموظف الاختبار:

- التطبيق في foreground.
- التطبيق في background.
- التطبيق مغلق.
- الضغط على الإشعار.

تحقق أن Deep Link لا يخرج عن المسارات المسموحة داخل Staff.

Channels:
- `orders`
- `tasks`
- `general`
- `offers`

## 8. Failure handling

الـworker الحالي:
- يعطل FCM token غير صالح/UNREGISTERED.
- يعمل Retry للأخطاء المؤقتة مثل 429/5xx.
- لا يكرر notification delivery row لنفس notification/channel.
- يسجل sent / retrying / failed / suppressed.

لو لا يوجد جهاز نشط:
- Push delivery تتحول إلى suppressed بدل loop فاشل.

## 9. Logout / account changes

عند Logout:
- Staff يحاول `unregister_push_device_v2` للتوكن الحالي.
- ثم يستدعي Native unregister.
- فشل cleanup لا يمنع تسجيل الخروج.

اختبر تسجيل الدخول بحساب موظف مختلف على نفس الجهاز للتأكد أن التوكن يعاد ربطه بالمستخدم الصحيح.

## Release gate

Push لا يعتبر Production-ready إلا بعد:
- Firebase Android client مطابق `com.elmadawy.staff`.
- FCM HTTP v1 credential صالح في Vault.
- Worker deployment مطابق للفرع.
- Provider health صالح.
- جهاز Staff واحد على الأقل مسجل.
- إرسال Push اختباري ناجح foreground/background/closed.
- Deep Link آمن.
- Logout unregister ناجح.
- Invalid token cleanup مختبر.
