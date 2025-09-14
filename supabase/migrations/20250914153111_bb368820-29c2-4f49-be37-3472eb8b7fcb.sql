-- Remove branch_id dependency from cash tracking tables
-- This will help merge online sales with branch sales

-- Update cash_tracking table to remove branch_id constraints
ALTER TABLE public.cash_tracking ALTER COLUMN branch_id DROP NOT NULL;

-- Update cash_transactions table to remove branch_id constraints  
ALTER TABLE public.cash_transactions ALTER COLUMN branch_id DROP NOT NULL;

-- Create a function to merge cash balances across all register types
CREATE OR REPLACE FUNCTION public.get_merged_cash_balance()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_store_balance numeric := 0;
    v_online_balance numeric := 0;
    v_total_balance numeric := 0;
BEGIN
    -- Get latest store balance
    SELECT COALESCE(closing_balance, 0) INTO v_store_balance
    FROM public.cash_tracking
    WHERE register_type = 'store'
    ORDER BY date DESC, created_at DESC
    LIMIT 1;
    
    -- Get latest online balance  
    SELECT COALESCE(closing_balance, 0) INTO v_online_balance
    FROM public.cash_tracking
    WHERE register_type = 'online'
    ORDER BY date DESC, created_at DESC
    LIMIT 1;
    
    v_total_balance := COALESCE(v_store_balance, 0) + COALESCE(v_online_balance, 0);
    
    RETURN v_total_balance;
END;
$$;

-- Create a function to record merged cash transactions
CREATE OR REPLACE FUNCTION public.record_merged_cash_transaction(
    p_amount numeric,
    p_transaction_type text,
    p_notes text,
    p_created_by uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_current_balance numeric;
    v_new_balance numeric;
    v_created_by uuid;
BEGIN
    v_created_by := COALESCE(auth.uid(), p_created_by);
    
    -- Get current merged balance
    v_current_balance := public.get_merged_cash_balance();
    
    -- Calculate new balance
    IF p_transaction_type = 'deposit' THEN
        v_new_balance := v_current_balance + p_amount;
    ELSE
        -- Check for sufficient funds on withdrawal
        IF p_amount > v_current_balance THEN
            RAISE EXCEPTION 'Insufficient funds. Current balance: %', v_current_balance;
        END IF;
        v_new_balance := v_current_balance - p_amount;
    END IF;

    -- Insert transaction record for merged register
    INSERT INTO public.cash_transactions (
        transaction_date,
        amount,
        transaction_type,
        register_type,
        notes,
        balance_after,
        created_by
    ) VALUES (
        NOW(),
        p_amount,
        p_transaction_type,
        'merged',
        p_notes,
        v_new_balance,
        v_created_by
    );

    -- Insert tracking record for merged register
    INSERT INTO public.cash_tracking (
        date,
        register_type,
        opening_balance,
        closing_balance,
        difference,
        notes,
        created_by
    ) VALUES (
        CURRENT_DATE,
        'merged',
        v_current_balance,
        v_new_balance,
        CASE 
            WHEN p_transaction_type = 'deposit' THEN p_amount 
            ELSE -p_amount 
        END,
        p_notes,
        v_created_by
    );

    RETURN v_new_balance;
END;
$$;