# Elmadawy Staff V1 — QA Matrix

Target branch: `work/staff-app-v1`
App version: `0.14.0`

## قواعد الاختبار

- كل اختبار يتم بحساب حقيقي له Role/Permissions محددة.
- لا تستخدم Super Admin لاختبارات الموظفين العادية.
- اختبر فرعًا واحدًا ثم فرعًا ثانيًا للتأكد من Branch Scope.
- أي إجراء مخزون/مالية يجب التحقق منه في Audit/ledger بعد التنفيذ.
- Offline tests لا تسمح بأي Write حساس.

## 1. Picker / Online preparation

Permissions:
- `online_orders.prepare`
- `online_orders.view`

Expected:
- يظهر Home + Tasks + Orders + Attendance + Services.
- لا يظهر Manager أو Finance أو Inventory إن لم توجد صلاحية.
- يستطيع Claim/Start picking.
- Barcode scan يلتقط الصنف الصحيح.
- Shortage يعمل.
- Propose substitution يعمل.
- لا يستطيع اعتماد البديل إن لم يكن لديه `online_orders.manage`.

Negative:
- محاولة فتح Inventory مباشرة عبر URL يجب ألا تسمح بالتشغيل.
- Offline: لا Claim/Start/Confirm writes.

## 2. Online Supervisor

Permissions:
- `online_orders.manage`

Expected:
- يظهر Approval Inbox.
- اعتماد/رفض البديل.
- فرق السعر ينشئ Financial Adjustment عند الحاجة.
- التسوية المالية لا تتم بدون الصلاحية المطلوبة من الباك إند.

## 3. Inventory Employee

Permissions:
- `inventory.view`
- `inventory.count`

Expected:
- Inventory tab يظهر.
- Blind Count يخفي رصيد النظام قبل الإرسال.
- Barcode verification.
- Count مطابق => matched.
- Count مختلف => Recount/Adjustment workflow.
- لا يستطيع Approve adjustment بدون `inventory.approve_adjustment`/manage حسب Backend.

Offline:
- يرى آخر Tasks/Inventory cache.
- Submit count يتوقف برسالة Offline.

## 4. Inventory Supervisor

Permissions:
- `inventory.view`
- `inventory.count`
- `inventory.recount`
- `inventory.manage`
- `inventory.transfer`
- `inventory.manage_sessions`

Expected:
- Daily/Spot counts.
- Recount بموظف مختلف.
- Approve/reject adjustment.
- Dispatch/Receive transfer.
- Low Stock / Out of Stock / Coverage Risk.
- Expiry workspace.
- زر الإهلاك.

Expiry safety:
1. بدون Matched Count حديث => العملية مرفوضة.
2. إنشاء Spot Count.
3. تنفيذ count مطابق.
4. محاولة إهلاك كمية أكبر من Batch => مرفوضة.
5. كمية محجوزة Online تمنع النزول تحت Reserved stock.
6. إهلاك ناجح:
   - batch quantity تقل.
   - inventory quantity تقل.
   - inventory movement يتسجل.
   - noncash expense يتسجل لو purchase price > 0.
   - لا Cash Ledger movement.
7. إعادة نفس request_id => idempotent، لا خصم مضاعف.

## 5. Purchases / Supplier Returns

Permissions:
- `purchases.manage`
- مع صلاحية عرض/تشغيل المخزون المناسبة.

Expected:
- Supplier Return فقط لو المورد معروف من Batch أو Purchase Item.
- بعد Return:
  - Batch تقل.
  - Inventory يقل.
  - Supplier Return = pending_credit.
  - Expected Credit من purchase cost.
  - لا تعديل تلقائي لرصيد المورد.
- Credit Note settlement:
  - reference مطلوب.
  - actual credit >= 0.
  - status ينتقل إلى credited.
  - لا يسمح بالتسوية مرتين.

## 6. Cashier

Expected:
- البيع يظل داخل POS وليس Staff.
- Staff يعرض Attendance/Tasks/Services حسب الصلاحية.
- إغلاق الوردية يظل POS.

## 7. Finance / Shift handoff

Permissions:
- `finance.manage` / appropriate finance access.

Expected:
- تسليمات الورديات المعلقة.
- expected amount من POS closed shift.
- received amount يدوي.
- variance يحتاج سبب.
- الاستلام يحرك العهدة إلى Branch Safe.
- لا يسمح بتسليم مكرر.

Supplier returns:
- Finance يستطيع رؤية Pending Credit إذا مسموح.
- يستطيع Settlement حسب backend permission.
- Settlement لا ينشئ Cash movement تلقائيًا.

## 8. Branch Manager

Permissions:
- `hr.view` أو `branch.manage_staff` + صلاحيات تشغيل مناسبة.

Expected:
- Manager Workspace يظهر.
- عدد الموظفين.
- approvals pending.
- overdue tasks.
- Online / Inventory / Cashier / Customer service metrics.
- قائمة needs_attention.
- لا Productivity Score موحد.

## 9. Attendance / HR

Expected:
- Check-in/out مع Trusted Device.
- GPS/geofence.
- Exception flow.
- Verification photo مؤقتة للمراجعة.
- Approval/Reject من المشرف.
- HR self-service: Leave / Advance / Attendance correction.

## 10. Offline Recovery

1. افتح التطبيق Online لتحميل Cache.
2. افصل الشبكة.
3. Banner Offline يظهر.
4. Tasks/Home/Attendance/Notifications المدعومة تعرض آخر Cache.
5. Inventory risk/transfers/expiry/supplier returns تعرض آخر Cache لو سبق تحميلها.
6. Claim/Complete/Count/Transfer/Expiry/Settlement تتوقف.
7. رجّع الشبكة.
8. Refresh يعيد البيانات Live.
9. لا توجد عملية مكررة بعد عودة الاتصال.

## 11. Branch isolation

لكل Role:
- لا يرى Tasks فرع آخر.
- لا يرى Inventory فرع آخر.
- لا يرى Expiry batches فرع آخر.
- لا يرى Supplier Returns فرع آخر.
- لا يستطيع تمرير branch_id لفرع غير مصرح به.

## 12. Android APK

- Fresh install.
- Update over previous test APK.
- Google Password Manager.
- Trusted Device identity.
- Camera.
- Barcode scanner.
- GPS.
- Back navigation.
- Deep links داخل التطبيق.
- Screen rotation / process recreation.
- Weak network.
- Background then resume.

## Release blockers

لا Release نهائي قبل:
- تطبيق Migration الجديدة على Preview/Development DB وتجربة السيناريوهات أعلاه.
- كل GitHub checks خضراء.
- Stable Android signing متاح.
- اختبار جهاز Android فعلي واحد على الأقل.
- تأكيد عدم وجود Regression في POS / Customer / Delivery.


## 13. Native Push

Prerequisites:
- APK مبني بـ Firebase client config الصحيح لـ `com.elmadawy.staff`.
- FCM HTTP v1 provider configured.
- Push worker مفعّل فقط بعد نجاح health checks.

Device registration:
1. افتح «خدماتي».
2. قبل التفعيل: لا يظهر Android permission بشكل إجباري عند startup.
3. اضغط «تفعيل إشعارات العمل».
4. وافق على Permission.
5. تحقق أن `get_my_push_device_status_v2` يعرض الجهاز.
6. تحقق أن `app_kind = staff`.
7. إعادة فتح التطبيق مع Permission granted تعيد التسجيل بصورة آمنة بدون جهاز مكرر.

Notification delivery:
- General notification.
- Task notification.
- Order notification.
- Critical/high priority notification.
- Foreground: notification تظهر ويحدث unread badge.
- Background: notification تصل.
- App killed: notification تصل حسب Android/FCM.
- Tap يفتح `action_url` المسموح.
- action_url غير مسموح يعود إلى `/notifications`.

Channels:
- `general`
- `tasks`
- `orders`
- `offers`

Token lifecycle:
- Logout يلغي تسجيل token لهذا الجهاز.
- Login بحساب موظف آخر يعيد ربط token بالحساب الجديد.
- FCM UNREGISTERED token يتم تعطيله server-side.
- 429/5xx يدخل retry وليس duplicate send.

Permission cases:
- granted.
- prompt.
- denied.
- Android app بدون google-services config: التطبيق لا ينهار؛ تفعيل Push يعطي خطأ مفهوم بدل crash.

Operational status:
- لا يسمح بتشغيل worker لو provider غير configured/valid.
- بعد التفعيل النهائي: `ready = true`.
- queue sent/failed/retrying قابلة للمراجعة.
