-- إضافة سياسة مؤقتة للسماح بقراءة جداول النقدية لجميع المستخدمين
CREATE POLICY IF NOT EXISTS "Temporary public view cash_tracking" 
ON public.cash_tracking 
FOR SELECT 
USING (true);

CREATE POLICY IF NOT EXISTS "Temporary public view cash_transactions" 
ON public.cash_transactions 
FOR SELECT 
USING (true);