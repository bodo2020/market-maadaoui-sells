-- Create trigger function to ensure branch_id is set
CREATE OR REPLACE FUNCTION public.ensure_branch_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- If branch_id is NULL, try to get it from user_branch_roles
  IF NEW.branch_id IS NULL THEN
    SELECT ubr.branch_id INTO NEW.branch_id
    FROM public.user_branch_roles ubr
    WHERE ubr.user_id = COALESCE(NEW.created_by, auth.uid())
    ORDER BY ubr.created_at NULLS LAST
    LIMIT 1;
    
    -- If still NULL, raise error
    IF NEW.branch_id IS NULL THEN
      RAISE EXCEPTION 'branch_id cannot be NULL. Please specify a branch or assign user to a branch.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply trigger to cash_transactions
DROP TRIGGER IF EXISTS ensure_branch_id_cash_transactions ON public.cash_transactions;
CREATE TRIGGER ensure_branch_id_cash_transactions
  BEFORE INSERT ON public.cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_branch_id();

-- Apply trigger to cash_tracking
DROP TRIGGER IF EXISTS ensure_branch_id_cash_tracking ON public.cash_tracking;
CREATE TRIGGER ensure_branch_id_cash_tracking
  BEFORE INSERT ON public.cash_tracking
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_branch_id();

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_cash_transactions_branch_register_date 
  ON public.cash_transactions(branch_id, register_type, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_cash_tracking_branch_register_date 
  ON public.cash_tracking(branch_id, register_type, date DESC, created_at DESC);