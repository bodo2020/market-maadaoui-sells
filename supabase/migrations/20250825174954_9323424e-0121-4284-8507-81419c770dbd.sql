-- حذف السياسات الموجودة وإضافة سياسات جديدة للوصول العام المؤقت
DROP POLICY IF EXISTS "Temporary public view cash_tracking" ON public.cash_tracking;
DROP POLICY IF EXISTS "Temporary public view cash_transactions" ON public.cash_transactions;

-- إضافة سياسة مؤقتة للسماح بقراءة جداول النقدية لجميع المستخدمين
CREATE POLICY "Temporary public view cash_tracking" 
ON public.cash_tracking 
FOR SELECT 
USING (true);

CREATE POLICY "Temporary public view cash_transactions" 
ON public.cash_transactions 
FOR SELECT 
USING (true);