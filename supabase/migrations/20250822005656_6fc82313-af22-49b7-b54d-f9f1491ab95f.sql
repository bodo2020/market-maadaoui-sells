-- إصلاح الوظيفة لتحديد search_path
DROP FUNCTION IF EXISTS public.get_current_cash_balance(text, uuid);

CREATE OR REPLACE FUNCTION public.get_current_cash_balance(p_register_type text, p_branch_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance numeric;
BEGIN
    SELECT COALESCE(balance_after, 0) INTO v_balance
    FROM public.cash_transactions
    WHERE register_type = p_register_type
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY transaction_date DESC, created_at DESC
    LIMIT 1;
    
    RETURN COALESCE(v_balance, 0);
END;
$$;

-- إصلاح مشكلة الجرد - تحديث سياسات RLS
UPDATE inventory_records 
SET status = 'pending'
WHERE status IS NULL;

-- تأكد من وجود جلسة جرد نشطة لليوم الحالي
INSERT INTO inventory_sessions (session_date, total_products, completed_products, matched_products, discrepancy_products, total_difference_value, status)
SELECT 
    CURRENT_DATE,
    COUNT(*),
    COUNT(CASE WHEN status != 'pending' THEN 1 END),
    COUNT(CASE WHEN status = 'checked' THEN 1 END), 
    COUNT(CASE WHEN status = 'discrepancy' THEN 1 END),
    COALESCE(SUM(CASE WHEN status = 'discrepancy' THEN ABS(difference_value) ELSE 0 END), 0),
    'active'
FROM inventory_records 
WHERE inventory_date = CURRENT_DATE
AND NOT EXISTS (
    SELECT 1 FROM inventory_sessions 
    WHERE session_date = CURRENT_DATE
)
HAVING COUNT(*) > 0;