# Elmadawy Staff

تطبيق التشغيل الداخلي لموظفي المعداوي. نفس الـAPK يعمل كـ **Role-aware workspace**؛ الوحدات والإجراءات الظاهرة تتحدد من صلاحيات الموظف والفرع.

## حدود المنتج

Staff لا يحل محل POS أو Delivery أو Control Center:

- POS: البيع، الدرج، إغلاق وردية الكاشير.
- Delivery: المندوب، التتبع، المسارات وإثبات التسليم.
- Control Center: الإدارة الكاملة والتهيئة والتقارير المتقدمة.
- Staff: التنفيذ اليومي داخل الفرع، الإشراف السريع، وخدمات الموظف.

## Staff V1 — 0.13.0

### الأساس
- تسجيل الدخول، Google Password Manager، Trusted Device.
- الرئيسية "يومي" حسب الدور.
- Task Center.
- الحضور والانصراف والاستثناءات.
- الإشعارات.
- البطاقة، الإجازات، السلف وتصحيح الحضور.

### Online fulfillment
- استلام وتجهيز الطلب.
- Barcode picking.
- النواقص والبدائل.
- Approval للبديل داخل Staff.
- التسوية المالية لفروق البدائل والنواقص من خلال Payment Ledger.

### Inventory workspace
- الجرد اليومي العشوائي.
- Blind Count + Barcode verification.
- إعادة عد بموظف مختلف.
- اعتماد/رفض فروق المخزون.
- تحويلات المخزون: شحن، استلام، وفروق.
- Low Stock / Out of Stock / Coverage Risk.
- Spot Count قبل قرارات الشراء أو التحويل.

### Expiry V2
- مصدر الحقيقة هو `product_batches` وليس `products.expiry_date` القديم.
- استبعاد دفعات `DAMAGED-*` القديمة من Workspace.
- إظهار الدفعات المنتهية والقريبة من الانتهاء مع تكلفة الشراء والمورد.
- الإهلاك وإرجاع المورد ذريان: Batch + Inventory + Ledger + Cost/Return.
- حماية الكمية المحجوزة للطلبات Online.
- لا يسمح بالإهلاك/الإرجاع إلا بعد Matched Inventory Count خلال آخر 4 ساعات.
- الإهلاك يسجل Non-cash expense مشتقًا من تكلفة الشراء، ولا يسحب من الخزنة.
- Supplier Return يخرج المخزون ويظل `pending_credit` حتى وصول Credit Note.
- تسجيل Credit Note يتم لاحقًا بواسطة المشتريات/المالية ولا يعدل رصيد المورد تلقائيًا بدون مستند محاسبي.

### Approval & manager
- Approval Inbox: مخزون، HR، حضور، بدائل، وتسويات مالية.
- Manager Workspace: الفريق، الموافقات، المتأخر، الأونلاين، الجرد، الكاش وخدمة العملاء.
- لا يوجد Productivity Score موحد؛ تظهر مؤشرات تشغيل فعلية فقط.

### Shift handoff
- POS يغلق الوردية.
- Staff يستلم عهدة الوردية المغلقة.
- عد فعلي + سبب أي فرق.
- التوريد يسجل في خزنة الفرع من خلال الباك إند المالي.

### Offline Recovery V1
- Banner واضح عند انقطاع الاتصال.
- Cache محلي لآخر Tasks / Attendance / Notifications وبعض Workspaces التشغيلية.
- Inventory risks / transfers / expiry / supplier returns تدعم fallback للقراءة.
- العمليات الحساسة لا تنفذ Offline؛ تنتظر عودة الاتصال بدل تكرار أو نصف تنفيذ.

## Backend migration

Expiry actions موجودة في:

`supabase/migrations/20260921003500_staff_expiry_actions_v2.sql`

الـMigration **لم يتم تطبيقها على Production** أثناء تطوير هذا الفرع.

## المتبقي قبل Release

1. اختبار Migration على Supabase Preview/Development branch قبل Production.
2. Push Notifications Native بعد توفير FCM / Google Services configuration.
3. QA بأدوار حقيقية: Picker، Inventory، Cashier، Online Supervisor، Inventory Supervisor، Branch Manager، Finance.
4. Stable Android signing secrets.
5. APK تجريبي ثم إصلاح ملاحظات الأجهزة الفعلية.
6. تقسيم `App.tsx` تدريجيًا إلى Features بعد تثبيت السلوك.
