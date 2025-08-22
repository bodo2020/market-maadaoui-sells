-- تحديث سياسات RLS لجدول العملاء للسماح لجميع المستخدمين بالعرض
DROP POLICY IF EXISTS "Allow authenticated users to view customers" ON customers;
DROP POLICY IF EXISTS "Admins can view all customers" ON customers;
DROP POLICY IF EXISTS "Users can view their own customer data" ON customers;

CREATE POLICY "Allow all users to view customers" ON customers
FOR SELECT USING (true);

-- تحديث سياسات RLS لجدول الموردين
DROP POLICY IF EXISTS "Admins view suppliers" ON suppliers;
DROP POLICY IF EXISTS "Admins manage suppliers" ON suppliers;

CREATE POLICY "Allow all users to view suppliers" ON suppliers
FOR SELECT USING (true);

CREATE POLICY "Allow admins to manage suppliers" ON suppliers
FOR ALL USING (is_admin() OR is_super_admin()) 
WITH CHECK (is_admin() OR is_super_admin());

-- حذف العميل "غير معروف" إذا كان موجود
DELETE FROM customers WHERE name = 'غير معروف' AND phone IS NULL;

-- تحديث أسماء العملاء الفارغة أو المعطلة
UPDATE customers 
SET name = COALESCE(NULLIF(TRIM(name), ''), 'عميل ' || SUBSTR(id::text, 1, 8))
WHERE name IS NULL OR TRIM(name) = '' OR name = 'غير معروف';