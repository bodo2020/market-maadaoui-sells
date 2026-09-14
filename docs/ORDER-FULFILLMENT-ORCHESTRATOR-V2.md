# Elmadawy Market — Order Fulfillment & Smart Work Dispatch V2

## الهدف
تحويل تشغيل الطلبات الأونلاين من نموذج يعتمد على أن الموظف يرى قائمة مهام مفتوحة ويختار/يعمل Claim، إلى نموذج موجّه بالـSLA يقوم فيه النظام باستقبال الطلب والتحقق منه وترتيب الأولوية وتوجيه العمل تلقائيًا، مع إبقاء الموظف والمدير في مسار الاستثناءات والقرارات البشرية.

هذا التصميم لا يلغي `operations_tasks`. المطلوب أن يتحول الجدول إلى سجل تشغيل/Audit ومصدر للمهام المتخصصة، بينما أعمال الطلبات الحساسة للوقت تُدار بواسطة Order Orchestrator وSmart Work Dispatch.

## ما نتعلمه من المشغلين الكبار

### Walmart
- لديه Online Order Filling Associates مخصصون لتجهيز وتسليم طلبات الأونلاين، ويتعاملون مع الدقة والبدائل والتواصل عند الحاجة.
- يستخدم المتجر نفسه كـfulfillment node، ومع APD/MFC يمكن للأتمتة جلب الأصناف إلى محطة العامل بدل المشي داخل المتجر، بينما تبقى الأصناف الطازجة/الكبيرة Picking بشريًا.
- في مراكز fulfillment المتقدمة يمكن للعامل تجميع/تعبئة عدة طلبات في نفس الوقت بدل التعامل مع طلب واحد فقط.
- أحدث Digital Shelf Labels تدعم Pick-to-Light لتقليل زمن البحث وتحسين دقة الـPicking.

### Target
- يفصل العمل إلى Pick → Prep → Pack/Sort/Hold ويقيس الجودة والدقة والالتزام بالوقت.
- فريق Fulfillment متخصص ويتغير توزيع العمل حسب نمط الطلب اليومي.

### Instacart
- الـBatch قد يحتوي حتى 4 طلبات.
- Partner Pick يفصل بوضوح بين Pick وStage وDelivery، ويمكن لموظف المتجر تجهيز الطلب ثم استلامه بواسطة مندوب آخر.
- منطقة Staging لها رفوف/ثلاجات/فريزر، ويمكن استخدام Bag Barcodes عند تسليم الطلب للمندوب.
- يوصي بقياس سرعة قبول الـbatches، نسبة تجهيز الطلب قبل الـwindow، وزمن انتظار العميل/المندوب.
- time slots مرتبطة بالطاقة الاستيعابية حتى لا يعد النظام العميل بوقت لا يستطيع الوفاء به.

### Amazon / Whole Foods
- Micro-fulfillment automation تقوم بالretrieve/sort/stage عبر مناطق حرارة مختلفة ثم handoff لموظف لإكمال الطلب والتسليم/الاستلام.

> الشركات لا تنشر خوارزميات توزيع الموظفين الداخلية بالتفصيل. الأوزان والخوارزمية المقترحة أدناه هي تصميم Elmadawy Market مبني على المبادئ العلنية السابقة وعلى البنية الحالية للنظام.

## المشكلة في النموذج الحالي

النظام الحالي يدعم:
- `operations_tasks`: open → claim → start → complete.
- `claim_order_fulfillment_v1`: الموظف يستلم تجهيز Order يدويًا.
- `get_my_order_fulfillment_workspace_v1`: يعرض قائمة Orders وحالة SLA.
- Order Intake V1 يدعم `shadow` و`assisted`.
- Delivery لديه recommendation engine منفصل لترشيح المندوب.

المشكلة ليست في وجود المهام، بل في جعل الـPull/Claim هو المسار الأساسي للأوردر. هذا يسمح عمليًا بـcherry-picking، وقد يترك Order عاجل بلا مالك بينما موظف آخر اختار Order أسهل.

## المبدأ المستهدف

**الطلب هو Workflow رئيسي، وليس Task واحدة.**

Order
→ Intake / Validation
→ Picking
→ Exceptions / Substitutions
→ Packing + QC
→ Staging
→ Driver Dispatch
→ Handoff
→ Delivery / Collection
→ Financial Settlement

كل مرحلة قد تنتج Task أو Assignment، لكن الـOrchestrator هو الذي يحدد ما يجب أن يحدث بعد ذلك.

---

# 1. Order Intake V2

## استقبال الطلب
عند إنشاء الطلب يقوم النظام تلقائيًا بـ:
1. تثبيت الفرع المناسب.
2. التحقق من address/delivery zone.
3. التحقق من payment state.
4. فحص stock snapshot والقيود الأساسية.
5. حساب `promised_ready_at` و`promised_delivery_at`.
6. حساب Capacity للفرع.
7. تصنيف الطلب:
   - `auto_eligible`
   - `manual_review`
   - `blocked`
8. إرسال إشعار للعميل بحالة الاستقبال.

## أوضاع التشغيل
نستفيد من البنية الحالية ونوسعها إلى:

### Shadow
النظام يحسب القرار المتوقع فقط ولا يغيّر التشغيل. نقارن قراره بقرار الموظف لمدة 1–2 أسبوع.

### Assisted
الطلبات السليمة تظهر كتوصية جاهزة: **تأكيد وابدأ التجهيز**، والاستثناءات تظهر بوضوح مع السبب. هذا الوضع موجود جزئيًا الآن.

### Auto
بعد إثبات الدقة:
- الطلب السليم ينتقل تلقائيًا من `pending` إلى `confirmed/queued`.
- لا يحتاج إنسانًا للضغط على Confirm.
- فقط الحالات الاستثنائية تفتح Intake Review.

لا يتم تشغيل Auto مباشرة في الإنتاج بدون بيانات Shadow/Assisted.

---

# 2. Smart Work Dispatch بدل Open Task Marketplace

## القاعدة
الموظف لا يختار من عشرات الطلبات.
الـStaff App يعرض:
- **مهمتك الحالية**
- **مهمتك التالية**
- زر بدء/استكمال
- الاستثناءات المرتبطة بالمهمة

قائمة كل المهام تظل ثانوية للمدير والمراجعات، وليست واجهة الـPicker الأساسية.

## Assignment lifecycle
`queued → offered → acknowledged → active → completed`

وحالات إضافية:
`expired / declined_with_reason / reassigned / cancelled`

### Offer Lease
- النظام يعرض المهمة لموظف مناسب لمدة 60–90 ثانية.
- الموظف يعمل Acknowledge، وليس Claim تنافسيًا.
- عند عدم الاستجابة أو خروج الموظف من الوردية، Lease تنتهي ويُعاد التوزيع آليًا.
- لا يوجد Double Assignment.

## من هو الموظف المؤهل؟
- في Shift مفتوحة.
- حاضر ومسموح له بالفرع.
- لديه permission/skill المناسب.
- الجهاز trusted/online عند الحاجة.
- ليس لديه workload يتجاوز الحد.
- ليس في Break أو Task حرجة أخرى.

## Assignment score المقترح
الأوزان Configurable وليست Hard-coded:
- SLA / Urgency: 45%
- Zone / walking proximity أو القسم الحالي: 20%
- Current workload: 20%
- Skills / role fit: 10%
- Fairness بين الموظفين: 5%

`score_snapshot` يتم حفظه مع كل Assignment حتى نفهم لاحقًا لماذا اختار النظام الموظف.

---

# 3. Batching / Waves

ليس كل Order لازم Picker مستقل.

## Single Order
يستخدم للطلب:
- العاجل جدًا.
- الكبير جدًا.
- الذي به Frozen/Fresh حساس.
- Express.

## Batch
النظام يجمع 2–4 Orders متوافقة عندما يكون ذلك أوفر:
- delivery windows متقاربة.
- نفس zone/aisles داخل الفرع.
- إجمالي عدد الأصناف مناسب للعربة.
- لا يهدد SLA أي طلب.

كل Order يحتفظ بأكياس/حاويات منفصلة مع Barcode/QR لمنع الخلط.

## Phase لاحقة
Route داخل المتجر:
- shelf_location / aisle ترتيب الأصناف.
- يبدأ المسار من أقرب قسم وينتهي عند Packing/Staging.
- لاحقًا يمكن إضافة Pick-to-Light إذا تم تركيب ESL/DSL مناسب.

---

# 4. Picking Workflow

الـPicker يرى Route وليس قائمة عشوائية:
1. المنتج التالي.
2. الصورة + الاسم + barcode.
3. Shelf/Aisle.
4. الكمية/الوزن المطلوب.
5. Scan إلزامي عند المنتجات المناسبة.
6. تأكيد الوزن الحقيقي للميزان/الوزني.

إذا لم يجد المنتج:
- Search nearby/alternative stock.
- اقتراح بديل.
- أو Shortage.

البدائل والنواقص تستخدم الـfinancial adjustment flows الموجودة حاليًا، فلا توجد تسوية صامتة.

---

# 5. Packing + QC

بعد انتهاء الـPicking:
- يمنع Pack إذا توجد Substitution pending.
- يمنع Ready إذا توجد unresolved quantities.
- QC checks configurable:
  - عدد الخطوط.
  - الوزن التقريبي.
  - أصناف Frozen/Chilled.
  - المنتجات القابلة للكسر.
  - Bag count.

في الحمل المنخفض يمكن أن يكون Picker نفسه Packer.
في الحمل العالي يصبح Packing محطة وموظفًا منفصلًا.

---

# 6. Staging — المرحلة الناقصة بوضوح

لا يكفي أن يكون الطلب `ready` في الداتا.
يجب وضع الأكياس فعليًا في Location.

## Staging locations
أمثلة:
- A-01, A-02: Ambient
- C-01, C-02: Chilled
- F-01, F-02: Frozen

كل Bag يحصل على Label:
- Order display ID
- Bag number / total bags
- Temperature class
- QR/Barcode

العامل يمسح:
1. Bag barcode.
2. Staging slot barcode.

بعد اكتمال كل الأكياس فقط يصبح:
`staged / ready_for_dispatch = true`.

---

# 7. Driver Dispatch + Handoff

لدينا بالفعل `order_dispatch_recommendation_v1` وترشيح driver حسب المسافة/الحمل/وقت الوصول.

التطوير المطلوب:
- Dispatch لا يعتمد فقط على status=ready؛ يعتمد على **Staged**.
- يمكن بدء تحريك المندوب قبل اكتمال الطلب بقليل عندما ETA الوصول ≈ ETA الجاهزية، لكن لا يتم handoff قبل staging.
- Driver arrival يبدأ Rider Wait Timer.
- Handoff يتطلب Scan Bag Labels أو Order QR.
- لو أكياس ناقصة لا يمكن بدء الرحلة.

هذا يقلل:
- driver wait.
- تسليم الطلب الخطأ.
- نسيان أكياس المبرد/الفريزر.

---

# 8. Exceptions Center

الإنسان يركز على الاستثناءات فقط:
- payment problem.
- address outside zone.
- stock inconsistency.
- substitution approval.
- customer unreachable.
- financial adjustment.
- order running late.
- driver rejected/no driver.
- staging mismatch.

كل Exception لها:
- owner.
- SLA.
- severity.
- recommended action.
- resolution audit.

---

# 9. Capacity & Delivery Slots

قبل قبول الوعود الزمنية نحسب:
- active pickers.
- average lines/minute لكل فرع.
- active batches.
- packing capacity.
- staging capacity.
- available drivers / delivery capacity.

عندما يقترب الفرع من الحد:
- لا نغلق الطلبات بالضرورة.
- نعرض Delivery Slot أبعد.

هذا يمنع أن نستقبل 20 Order في نفس الدقيقة ثم نحاول علاج التأخير بعد حدوثه.

---

# 10. Control Tower للمدير

صفحة واحدة بدل متابعة عدة قوائم:

### Now
- Orders يجب بدءها الآن.
- الموظفون الحاليون ومهامهم.

### Next 30 min
- ما سيحتاج Picking/Pack/Driver قريبًا.

### At Risk
- SLA risk.
- picker stalled.
- substitution waiting.
- payment/refund waiting.
- driver late/no driver.

### Staging
- Ready to stage.
- Staged bags/locations.
- driver arrived / waiting.

المدير يستطيع Override/Reassign مع Reason، وكل تغيير Audit logged.

---

# 11. Data Model المقترح — Additive

لا نكسر الجداول الحالية.

## `private.order_work_assignments_v1`
- id
- branch_id
- order_id
- operations_task_id
- work_kind (`pick`, `pack`, `stage`, `handoff`, ...)
- assigned_to
- assignment_mode (`auto`, `manual_override`)
- status (`offered`, `acknowledged`, `active`, `completed`, `expired`, `declined`, `reassigned`, `cancelled`)
- offered_at
- ack_deadline
- acknowledged_at
- started_at
- completed_at
- lease_expires_at
- attempt
- batch_id
- score
- score_snapshot jsonb
- reassignment_reason
- metadata

Unique partial index يمنع أكثر من Active assignment لنفس work step.

## `private.order_work_batches_v1`
- id
- branch_id
- state
- work_kind
- promised_window_start/end
- max_orders
- item_count
- temperature_profile
- created_at

## `private.order_work_batch_orders_v1`
ربط Orders بالـBatch + tote/bag identifiers.

## `private.order_staging_slots_v1`
- branch_id
- code
- zone type
- temperature class
- active

## `private.order_bags_v1`
- order_id
- bag_no
- barcode
- temperature class
- staging_slot_id
- staged_at/by
- handed_over_at/by

---

# 12. RPCs / Services

- `dispatch_next_order_work_v1(branch_id)` — server/internal dispatcher.
- `get_my_next_order_work_v1(branch_id)` — current + next assignment.
- `ack_my_order_work_v1(assignment_id)`.
- `start_my_order_work_v1(assignment_id)`.
- `decline_my_order_work_v1(assignment_id, reason)` — reasons tracked; not silent cherry-pick.
- `complete_my_order_work_v1(...)`.
- `reassign_order_work_v1(...)` — manager override.
- `stage_order_bag_v1(order_id, bag_barcode, slot_barcode)`.
- `verify_order_handoff_v1(order_id, bag_barcodes[])`.
- `get_order_control_tower_v1(branch_id)`.

Concurrency:
- row locks / `FOR UPDATE SKIP LOCKED`.
- lease expiry.
- idempotency.
- unique active assignment guards.

---

# 13. Rollout Plan

## Phase 0 — Observe
- أبقِ التشغيل الحالي.
- فعّل Intake `shadow` مع dashboards وقرارات predicted.
- سجل workload/SLA/employee metrics بدون Auto Assignment.

## Phase 1 — Assisted Intake
- النظام يرتب Orders ويظهر next recommended action.
- الموظف يؤكد فقط الطلبات السليمة.
- exceptions منفصلة.

## Phase 2 — Smart Assignment Shadow
- Dispatch engine يحسب من كان سيستلم كل Pick Task، لكن الموظفين يستمرون في النظام الحالي.
- نقارن الاختيار بالواقع ونتأكد من fairness/SLA.

## Phase 3 — Push Assignment
- Picker يحصل على Current/Next Work.
- lease + acknowledge + auto reassign.
- المدير Override.

## Phase 4 — Staging + Bag Scan
- bag labels.
- ambient/chilled/frozen slots.
- Handoff scan.

## Phase 5 — Batching 2–4 Orders
- يبدأ بطلبات سهلة ومتقاربة فقط.
- يقاس أثره على speed/accuracy قبل التوسع.

## Phase 6 — Capacity-driven Slots
- delivery promises مبنية على قدرة الفرع الفعلية.

## Phase 7 — Optimization
- route-aware picking.
- Pick-to-Light / ESL integration مستقبلًا.
- forecasting by hour/day/category.

---

# 14. KPIs اللازمة

### Intake
- order received → validation.
- first response time.
- auto-eligible rate.
- manual exception rate.

### Picking
- time-to-first-pick.
- lines/minute.
- found rate.
- scan accuracy.
- shortage rate.
- substitution rate + approval time.

### Packing/Staging
- pack time.
- QC failure rate.
- staged before promise %.
- staging dwell time.

### Delivery Handoff
- driver arrival vs ready time.
- driver wait seconds.
- missing/wrong bag rate.

### End-to-End
- on-time ready %.
- on-time delivery %.
- total order cycle time.
- reassign rate.
- customer issue/refund rate.

### Workforce
- utilization without overload.
- active work time.
- idle time.
- fairness distribution.
- task interruption/reassignment.

---

# القرار المعماري المقترح

1. لا نلغي Task Center؛ نعيد تعريف دوره.
2. الطلبات الأونلاين الحساسة للوقت تتحول من Pull/Claim إلى Push/Lease Smart Assignment.
3. Intake يتم تدريجيًا Shadow → Assisted → Auto.
4. Picking يصبح guided/scanned وممكن batched.
5. Ready تتحول عمليًا إلى Pack/QC → Staged، ثم Dispatch/Handoff.
6. الاستثناءات والموافقات تبقى Human-in-the-loop.
7. Delivery يبقى نظامًا منفصلًا لوجستيًا، ويرتبط بالOrder عند Staging/Handoff.
8. كل خطوة Event/Audit قابلة للقياس والتراجع.

## Public references used for the operating model
- Walmart Careers — Online Order Filling Team Associate.
- Walmart Corporate — Market Fulfillment Centers / APD and Next Generation Fulfillment Centers.
- Walmart Corporate — Pick-to-Light with Digital Shelf Labels.
- Target — Fulfillment Expert role/process.
- Instacart Docs — Partner Pick, staging, batches, last-mile staging and bag barcode handoff.
- Amazon / Whole Foods — automated micro-fulfillment and staging.
