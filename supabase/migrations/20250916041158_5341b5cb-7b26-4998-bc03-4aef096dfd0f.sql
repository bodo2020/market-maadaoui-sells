-- تحديث سياسات الأمان لجدول الرواتب
DROP POLICY IF EXISTS "Admins can manage all salaries" ON public.salaries;
DROP POLICY IF EXISTS "Users can view their own salary" ON public.salaries;

-- إنشاء سياسات أكثر مرونة
CREATE POLICY "Allow authenticated users to insert salaries" 
ON public.salaries 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to select salaries" 
ON public.salaries 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to update salaries" 
ON public.salaries 
FOR UPDATE 
TO authenticated
USING (true);

CREATE POLICY "Allow authenticated users to delete salaries" 
ON public.salaries 
FOR DELETE 
TO authenticated
USING (true);