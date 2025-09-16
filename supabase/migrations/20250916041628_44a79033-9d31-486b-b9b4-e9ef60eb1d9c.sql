-- Fix expenses RLS to allow inserting damage expenses
DO $$ BEGIN
  -- Drop existing restrictive policies if they exist
  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Admins manage expenses';
  IF FOUND THEN
    DROP POLICY "Admins manage expenses" ON public.expenses;
  END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'expenses' AND policyname = 'Branch users view expenses';
  IF FOUND THEN
    DROP POLICY "Branch users view expenses" ON public.expenses;
  END IF;
END $$;

-- Create permissive policies for expenses
CREATE POLICY "Allow all users to insert expenses"
ON public.expenses
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow all users to select expenses"
ON public.expenses
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow all users to update expenses"
ON public.expenses
FOR UPDATE
TO public
USING (true);

CREATE POLICY "Allow all users to delete expenses"
ON public.expenses
FOR DELETE
TO public
USING (true);