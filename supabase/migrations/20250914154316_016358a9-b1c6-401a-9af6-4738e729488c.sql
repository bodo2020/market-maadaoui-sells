-- Create unambiguous RPC wrapper to avoid PostgREST overload ambiguity
CREATE OR REPLACE FUNCTION public.add_cash_transaction_api(
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
SET search_path = 'public'
AS $$
DECLARE
  v_result numeric;
BEGIN
  -- Call the 6-arg version explicitly by passing all params
  v_result := public.add_cash_transaction(
    p_amount,
    p_transaction_type,
    p_register_type,
    p_notes,
    p_created_by,
    p_branch_id
  );
  RETURN v_result;
END;
$$;