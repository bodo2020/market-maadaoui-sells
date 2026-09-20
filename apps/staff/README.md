# Elmadawy Staff

تطبيق التشغيل الداخلي لموظفي المعداوي. التطبيق مبني كـ **Role-aware workspace**: نفس الـAPK، لكن الوحدات الظاهرة تتحدد من صلاحيات الموظف والفرع.

## Staff V1

الوحدات المعتمدة في البداية:

- تسجيل الدخول وهوية الموظف والأجهزة الموثوقة.
- الرئيسية "يومي" مع الوردية والأولوية الحالية.
- Task Center.
- الحضور والانصراف والاستثناءات.
- الإشعارات التشغيلية.
- تجهيز الطلبات والباركود والبدائل حسب الصلاحية.
- خدمات الموظف: البطاقة، الإجازات، السلف، وتصحيح الحضور.

## Product boundary

Staff لا يحل محل POS ولا Delivery:

- البيع والكاشير: `apps/pos` / واجهة POS.
- التوصيل وتتبع المندوب: Delivery App.
- الإدارة والمالية وHR الكامل: Control Center.
- Staff: تنفيذ الموظف اليومي داخل الفرع وخدماته الذاتية.

## Role-aware navigation

تبويب التشغيل لا يظهر إلا لمن لديه:

- `online_orders.prepare`
- أو `online_orders.manage`

ونفس المبدأ سيطبق على الوحدات التالية بدل عرض شاشات لا تخص دور الموظف.

## المنفذ في Staff V1

- Role-aware Home وNavigation.
- Inventory workspace: جرد أعمى، إعادة عد، اعتماد فروق، شحن واستلام التحويلات.
- Approval Inbox: مخزون، طلبات موظفين، واستثناءات حضور.
- Manager workspace: تشغيل الفريق، المتأخر، الموافقات، المخزون، الأونلاين، الكاش وخدمة العملاء.
- كل العمليات تعتمد على نفس RPCs وAudit trails الخاصة بـControl Center.

## Next milestones

1. Shift handoff وملخص نهاية الوردية.
2. Low Stock + Expiry execution workflows داخل Staff.
3. Specialized approvals للبدائل والتسويات المالية.
4. Push notifications وOffline recovery.
5. توحيد Design System وتقسيم `App.tsx` إلى Features مستقلة.
6. QA على أدوار فعلية ثم Release APK تجريبي.
