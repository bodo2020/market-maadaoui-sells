-- Update function to record created_by for cash transactions and tracking
CREATE OR REPLACE FUNCTION public.add_cash_transaction(
    p_amount numeric,
    p_transaction_type text,
    p_register_type text,
    p_notes text
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_current_balance numeric;
    v_new_balance numeric;
BEGIN
    -- Get the current balance
    SELECT COALESCE(
        (
            SELECT closing_balance 
            FROM public.cash_tracking 
            WHERE register_type = p_register_type
            ORDER BY date DESC, created_at DESC 
            LIMIT 1
        ), 
        0
    ) INTO v_current_balance;

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

    -- Insert transaction record (include created_by)
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
        p_register_type,
        p_notes,
        v_new_balance,
        auth.uid()
    );

    -- Insert tracking record (include created_by)
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
        p_register_type,
        v_current_balance,
        v_new_balance,
        CASE 
            WHEN p_transaction_type = 'deposit' THEN p_amount 
            ELSE -p_amount 
        END,
        p_notes,
        auth.uid()
    );

    RETURN v_new_balance;
END;
$$;