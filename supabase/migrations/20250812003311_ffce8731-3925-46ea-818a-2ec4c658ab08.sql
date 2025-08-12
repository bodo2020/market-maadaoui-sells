-- Update add_cash_transaction to accept optional p_created_by and write it to both tables
CREATE OR REPLACE FUNCTION public.add_cash_transaction(
  p_amount numeric,
  p_transaction_type text,
  p_register_type text,
  p_notes text,
  p_created_by uuid DEFAULT NULL::uuid
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
BEGIN
    v_created_by := COALESCE(auth.uid(), p_created_by);

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
        v_created_by
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
        v_created_by
    );

    RETURN v_new_balance;
END;
$function$;

-- Ensure SELECT policy on users exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'users' 
      AND policyname = 'Allow all users to view users'
  ) THEN
    CREATE POLICY "Allow all users to view users"
    ON public.users
    FOR SELECT
    USING (true);
  END IF;
END $$;