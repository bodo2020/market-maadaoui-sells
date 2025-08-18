-- إصلاح سياسات RLS للأقسام الرئيسية والفرعية
-- حذف السياسات القديمة وإنشاء سياسات جديدة تسمح بالتحديث

-- حذف السياسات القديمة للأقسام الرئيسية
DROP POLICY IF EXISTS "Branch managers and admins can manage main categories" ON public.main_categories;
DROP POLICY IF EXISTS "All users can view main categories" ON public.main_categories;

-- إنشاء سياسات جديدة للأقسام الرئيسية
CREATE POLICY "Allow all users to view main categories" 
ON public.main_categories 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all authenticated users to manage main categories" 
ON public.main_categories 
FOR ALL 
USING (true)
WITH CHECK (true);

-- حذف السياسات القديمة للأقسام الفرعية
DROP POLICY IF EXISTS "Branch managers and admins can manage subcategories" ON public.subcategories;
DROP POLICY IF EXISTS "All users can view subcategories" ON public.subcategories;

-- إنشاء سياسات جديدة للأقسام الفرعية
CREATE POLICY "Allow all users to view subcategories" 
ON public.subcategories 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all authenticated users to manage subcategories" 
ON public.subcategories 
FOR ALL 
USING (true)
WITH CHECK (true);