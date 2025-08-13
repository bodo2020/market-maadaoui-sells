-- Update add_cash_transaction to include branch_id and set it on inserted rows
CREATE OR REPLACE FUNCTION public.add_cash_transaction(
  p_amount numeric,
  p_transaction_type text,
  p_register_type text,
  p_notes text,
  p_created_by uuid DEFAULT NULL,
  p_branch_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_current_balance numeric;
    v_new_balance numeric;
    v_created_by uuid;
    v_branch_id uuid;
BEGIN
    v_created_by := COALESCE(auth.uid(), p_created_by);
    -- Determine branch: prefer provided, otherwise user's first branch
    v_branch_id := COALESCE(
      p_branch_id,
      (
        SELECT ubr.branch_id
        FROM public.user_branch_roles ubr
        WHERE ubr.user_id = v_created_by
        ORDER BY ubr.created_at NULLS LAST
        LIMIT 1
      )
    );

    -- Get the current balance for this register and branch (if branch available)
    SELECT COALESCE(
        (
            SELECT ct.balance_after 
            FROM public.cash_transactions ct
            WHERE ct.register_type = p_register_type
              AND (v_branch_id IS NULL OR ct.branch_id = v_branch_id)
            ORDER BY ct.transaction_date DESC 
            LIMIT 1
        ), 
        (
            SELECT ctk.closing_balance 
            FROM public.cash_tracking ctk
            WHERE ctk.register_type = p_register_type
              AND (v_branch_id IS NULL OR ctk.branch_id = v_branch_id)
            ORDER BY ctk.date DESC, ctk.created_at DESC 
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

    -- Insert transaction record (include created_by and branch_id)
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
        p_register_type,
        p_notes,
        v_new_balance,
        v_created_by,
        v_branch_id
    );

    -- Insert tracking record (include created_by and branch_id)
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
        p_register_type,
        v_current_balance,
        v_new_balance,
        CASE 
            WHEN p_transaction_type = 'deposit' THEN p_amount 
            ELSE -p_amount 
        END,
        p_notes,
        v_created_by,
        v_branch_id
    );

    RETURN v_new_balance;
END;
$function$;