# دليل Multi-Schema Architecture

## نظرة عامة
تم تطبيق معمارية Multi-Schema لعزل بيانات الفروع الخارجية في schemas منفصلة، مما يوفر:
- **عزل كامل للبيانات** بين الفروع
- **أمان أفضل** لكل فرع
- **أداء محسّن** مع إمكانية التوسع
- **مرونة في التخصيص** لكل فرع

---

## البنية التحتية

### 1. قاعدة البيانات

تم إضافة الحقول والـ functions التالية:

#### حقل schema_name في جدول branches
```sql
ALTER TABLE branches ADD COLUMN schema_name TEXT;
```

#### Functions الأساسية:

##### `create_branch_schema(branch_id, branch_code)`
ينشئ schema جديد للفرع ويحدّث جدول branches

##### `setup_branch_tables(schema_name)`
ينسخ هيكل الجداول الأساسية إلى الـ schema الجديد:
- products
- inventory
- sales
- main_categories
- subcategories
- companies

##### `initialize_external_branch(branch_id, branch_code)`
Function مدمجة تنشئ schema كامل جاهز للاستخدام

---

## كيفية الاستخدام

### إنشاء فرع خارجي جديد

```typescript
import { initializeExternalBranch } from '@/lib/schemaContext';

// عند إنشاء فرع خارجي جديد
const branchId = "uuid-here";
const branchCode = "EXT001";

const schemaName = await initializeExternalBranch(branchId, branchCode);
console.log(`Schema created: ${schemaName}`);
```

### استخدام Schema-Aware Services

```typescript
import { 
  fetchProductsForBranch, 
  createProductInBranch 
} from '@/services/supabase/schemaAwareProductService';

// جلب منتجات الفرع (تلقائياً يستخدم الـ schema الصحيح)
const products = await fetchProductsForBranch(currentBranchId, {
  searchQuery: 'laptop',
  categoryId: 'category-uuid'
});

// إنشاء منتج جديد
const newProduct = await createProductInBranch(currentBranchId, {
  name: 'New Product',
  price: 100,
  purchase_price: 80,
  quantity: 50,
  // ... باقي الحقول
});
```

### التحقق من نوع الفرع

```typescript
import { getBranchInfo, hasDedicatedSchema } from '@/lib/schemaContext';

const branchInfo = await getBranchInfo(branchId);
console.log('Branch type:', branchInfo.branch_type); // 'internal' | 'external'
console.log('Has custom schema:', branchInfo.schema_name);

// أو بشكل مباشر
const hasCustomSchema = await hasDedicatedSchema(branchId);
```

---

## الحالة الحالية

### ✅ تم التنفيذ:
1. إضافة schema_name لجدول branches
2. Functions لإنشاء وإعداد schemas جديدة
3. Schema Context Manager (schemaContext.ts)
4. Schema-Aware Product Service (schemaAwareProductService.ts)
5. Caching للـ branch info لتحسين الأداء

### 🔄 قيد التطوير:
1. RPC functions لتنفيذ الـ queries على schemas مخصصة
2. تكامل كامل مع باقي الـ services:
   - categoryService
   - companyService
   - inventoryService
   - saleService
3. Migration tool للفروع الموجودة
4. Dashboard لإدارة الـ schemas

### 📋 الخطوات القادمة:

#### المرحلة 2: إنشاء RPC Functions
```sql
-- مثال: جلب منتجات من schema محدد
CREATE FUNCTION get_products_from_schema(schema_name TEXT, filters JSONB)
RETURNS JSONB
```

#### المرحلة 3: تحديث باقي الـ Services
- إضافة schema awareness لكل الـ services
- تحديث الـ UI components لاستخدام الـ services الجديدة

#### المرحلة 4: Migration Tool
- أداة لنقل بيانات الفروع الخارجية الموجودة إلى schemas منفصلة
- Backup تلقائي قبل الـ migration

---

## أمثلة متقدمة

### مثال: إنشاء فرع خارجي كامل

```typescript
// 1. إنشاء الفرع في جدول branches
const { data: branch } = await supabase
  .from('branches')
  .insert({
    name: 'فرع القاهرة الخارجي',
    code: 'CAIRO-EXT',
    branch_type: 'external',
    independent_inventory: true,
    independent_pricing: true
  })
  .select()
  .single();

// 2. تهيئة الـ schema
const schemaName = await initializeExternalBranch(branch.id, branch.code);

// 3. إضافة بيانات أولية (categories, companies, etc.)
await createProductInBranch(branch.id, {
  name: 'First Product',
  price: 100,
  purchase_price: 80,
  quantity: 10
});
```

### مثال: التبديل بين الفروع

```typescript
import { clearBranchCache, getSchemaForBranch } from '@/lib/schemaContext';

// عند تبديل الفرع
function onBranchChange(newBranchId: string) {
  // تنظيف الـ cache
  clearBranchCache();
  
  // تحديث الـ current branch
  useBranchStore.getState().setBranch(newBranchId);
  
  // الـ queries التالية ستستخدم الـ schema الصحيح تلقائياً
}
```

---

## اعتبارات الأمان

### RLS Policies
كل schema له RLS policies منفصلة تسمح فقط للمستخدمين المصرح لهم بالوصول

### Permissions
تم منح الصلاحيات للـ authenticated users فقط

### Isolation
عزل كامل بين schemas - فرع لا يمكنه الوصول لبيانات فرع آخر

---

## الأداء

### Caching
- معلومات الفروع يتم cache-ها لتجنب queries متكررة
- يمكن تنظيف الـ cache عند الحاجة

### Indexes
كل schema له indexes خاصة به لتحسين الأداء

### Scalability
يمكن إضافة عدد غير محدود من الفروع، كل فرع في schema منفصل

---

## Troubleshooting

### مشكلة: Schema لم ينشأ
```typescript
// التحقق من إنشاء الـ schema
const { data } = await supabase
  .rpc('create_branch_schema', {
    p_branch_id: branchId,
    p_branch_code: branchCode
  });
console.log('Schema name:', data);
```

### مشكلة: Permissions خاطئة
```sql
-- منح الصلاحيات يدوياً
GRANT USAGE ON SCHEMA branch_cairo_ext TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA branch_cairo_ext TO authenticated;
```

### مشكلة: Cache قديم
```typescript
import { clearBranchCache } from '@/lib/schemaContext';
clearBranchCache(); // تنظيف كل الـ cache
clearBranchCache(branchId); // تنظيف cache فرع محدد
```

---

## الخلاصة

تم تطبيق البنية الأساسية للـ Multi-Schema Architecture بنجاح! 

للاستخدام الكامل، يتبقى:
1. استكمال RPC functions
2. تحديث باقي الـ services
3. إنشاء UI لإدارة الـ schemas
4. أداة migration للفروع الموجودة

المعمارية الحالية جاهزة للاستخدام مع الفروع الجديدة وتوفر أساس متين للتوسع المستقبلي.
