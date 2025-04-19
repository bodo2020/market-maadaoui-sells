
-- Create the function to add cash transactions with proper RLS
CREATE OR REPLACE FUNCTION public.add_cash_transaction(
  p_amount NUMERIC,
  p_transaction_type TEXT,
  p_register_type TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance NUMERIC;
  new_balance NUMERIC;
  v_user_id UUID;
BEGIN
  -- Get the current user ID
  v_user_id := auth.uid();
  
  -- Get the current balance
  SELECT 
    COALESCE(
      (SELECT closing_balance 
       FROM cash_tracking 
       WHERE register_type = p_register_type 
       ORDER BY date DESC, created_at DESC 
       LIMIT 1),
      0
    ) INTO current_balance;
  
  -- Calculate the new balance
  IF p_transaction_type = 'deposit' THEN
    new_balance := current_balance + p_amount;
  ELSIF p_transaction_type = 'withdrawal' THEN
    new_balance := current_balance - p_amount;
    
    -- Check if there's enough balance
    IF new_balance < 0 THEN
      RAISE EXCEPTION 'لا يوجد رصيد كافي في الخزنة';
    END IF;
  ELSE
    RAISE EXCEPTION 'نوع العملية غير صالح';
  END IF;
  
  -- Insert record into cash_transactions
  INSERT INTO cash_transactions (
    transaction_date,
    amount,
    balance_after,
    transaction_type,
    register_type,
    notes,
    created_by
  ) VALUES (
    now(),
    p_amount,
    new_balance,
    p_transaction_type,
    p_register_type,
    p_notes,
    v_user_id
  );
  
  -- Insert record into cash_tracking
  INSERT INTO cash_tracking (
    date,
    opening_balance,
    closing_balance,
    difference,
    notes,
    created_by,
    register_type
  ) VALUES (
    CURRENT_DATE,
    current_balance,
    new_balance,
    CASE WHEN p_transaction_type = 'deposit' THEN p_amount ELSE -p_amount END,
    p_notes,
    v_user_id,
    p_register_type
  );
  
  RETURN new_balance;
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION public.add_cash_transaction TO authenticated;
