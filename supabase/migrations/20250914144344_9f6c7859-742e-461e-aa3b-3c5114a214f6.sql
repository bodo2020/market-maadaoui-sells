-- إزالة constraint القديم وإضافة الجديد مع القيمة 'approved'
ALTER TABLE public.inventory_sessions 
DROP CONSTRAINT IF EXISTS check_inventory_session_status;

ALTER TABLE public.inventory_sessions 
DROP CONSTRAINT IF EXISTS inventory_sessions_status_check;

-- إضافة constraint جديد يتضمن جميع القيم المطلوبة
ALTER TABLE public.inventory_sessions 
ADD CONSTRAINT inventory_sessions_status_check 
CHECK (status IN ('active', 'completed', 'approved'));