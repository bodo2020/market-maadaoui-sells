-- إصلاح مشكلة الخزينة - حساب الرصيد الصحيح من المعاملات
-- حذف السجل الخاطئ الذي يجعل الرصيد صفر
DELETE FROM cash_tracking 
WHERE id = 'a8ad11b2-4d5f-496f-9be4-55aa911126bc' 
AND closing_balance = 0 
AND difference = -15394.13;

DELETE FROM cash_transactions 
WHERE id = '0d3d6417-5078-4e91-9ec6-979d0d1959d6' 
AND amount = 15394.13 
AND transaction_type = 'withdrawal';

-- إنشاء وظيفة لحساب الرصيد الصحيح
CREATE OR REPLACE FUNCTION public.get_current_cash_balance(p_register_type text, p_branch_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
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