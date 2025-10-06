-- Update get_merged_cash_balance to accept branch_id parameter
CREATE OR REPLACE FUNCTION public.get_merged_cash_balance(p_branch_id uuid DEFAULT NULL)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_store_balance numeric := 0;
    v_online_balance numeric := 0;
    v_total_balance numeric := 0;
BEGIN
    -- Get latest store balance for the specified branch
    SELECT COALESCE(balance_after, 0) INTO v_store_balance
    FROM public.cash_transactions
    WHERE register_type = 'store'
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY transaction_date DESC, created_at DESC
    LIMIT 1;
    
    -- If not found in transactions, check tracking table
    IF v_store_balance = 0 THEN
        SELECT COALESCE(closing_balance, 0) INTO v_store_balance
        FROM public.cash_tracking
        WHERE register_type = 'store'
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        ORDER BY date DESC, created_at DESC
        LIMIT 1;
    END IF;
    
    -- Get latest online balance for the specified branch
    SELECT COALESCE(balance_after, 0) INTO v_online_balance
    FROM public.cash_transactions
    WHERE register_type = 'online'
      AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    ORDER BY transaction_date DESC, created_at DESC
    LIMIT 1;
    
    -- If not found in transactions, check tracking table
    IF v_online_balance = 0 THEN
        SELECT COALESCE(closing_balance, 0) INTO v_online_balance
        FROM public.cash_tracking
        WHERE register_type = 'online'
          AND (p_branch_id IS NULL OR branch_id = p_branch_id)
        ORDER BY date DESC, created_at DESC
        LIMIT 1;
    END IF;
    
    v_total_balance := COALESCE(v_store_balance, 0) + COALESCE(v_online_balance, 0);
    
    RETURN v_total_balance;
END;
$function$;

-- Update record_merged_cash_transaction to accept branch_id parameter
CREATE OR REPLACE FUNCTION public.record_merged_cash_transaction(
    p_amount numeric, 
    p_transaction_type text, 
    p_notes text, 
    p_created_by uuid DEFAULT NULL,
    p_branch_id uuid DEFAULT NULL
)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_current_balance numeric;
    v_new_balance numeric;
    v_created_by uuid;
BEGIN
    v_created_by := COALESCE(auth.uid(), p_created_by);
    
    -- Get current merged balance for the specified branch
    v_current_balance := public.get_merged_cash_balance(p_branch_id);
    
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

    -- Insert transaction record for merged register with branch_id
    INSERT INTO public.cash_transactions (
        transaction_date,
        amount,
        transaction_type,
        register_type,
        notes,
        balance_after,
        created_by,
        branch_id
    ) VALUES (
        NOW(),
        p_amount,
        p_transaction_type,
        'merged',
        p_notes,
        v_new_balance,
        v_created_by,
        p_branch_id
    );

    -- Insert tracking record for merged register with branch_id
    INSERT INTO public.cash_tracking (
        date,
        register_type,
        opening_balance,
        closing_balance,
        difference,
        notes,
        created_by,
        branch_id
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
        v_created_by,
        p_branch_id
    );

    RETURN v_new_balance;
END;
$function$;