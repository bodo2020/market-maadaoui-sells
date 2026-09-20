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

## Next milestones

1. Inventory workspace: جرد، Low Stock، Expiry، استلام وتحويلات.
2. Approval inbox للمشرفين والمديرين.
3. Shift handoff وملخص نهاية الوردية.
4. Manager workspace للفريق وSLA والمشاكل.
5. Push notifications وOffline recovery.
6. توحيد Design System وتقسيم `App.tsx` إلى Features مستقلة.
