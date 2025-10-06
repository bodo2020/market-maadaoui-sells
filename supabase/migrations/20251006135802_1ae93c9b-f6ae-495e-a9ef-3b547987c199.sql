-- Allow anonymous (no Supabase auth) clients to read cash tables for this app's custom auth
-- This keeps existing branch-based policies intact and simply adds an OR policy for unauthenticated sessions

-- cash_tracking: add permissive SELECT for anonymous sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'cash_tracking' AND policyname = 'Anonymous can view cash_tracking'
  ) THEN
    CREATE POLICY "Anonymous can view cash_tracking"
    ON public.cash_tracking
    FOR SELECT
    USING (auth.uid() IS NULL);
  END IF;
END$$;

-- cash_transactions: add permissive SELECT for anonymous sessions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'cash_transactions' AND policyname = 'Anonymous can view cash_transactions'
  ) THEN
    CREATE POLICY "Anonymous can view cash_transactions"
    ON public.cash_transactions
    FOR SELECT
    USING (auth.uid() IS NULL);
  END IF;
END$$;