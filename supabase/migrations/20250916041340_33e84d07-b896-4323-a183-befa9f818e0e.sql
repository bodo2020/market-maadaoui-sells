-- Relax salaries RLS to allow inserts without Supabase auth session
DO $$ BEGIN
  -- Drop previous authenticated-only policies if they exist
  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'salaries' AND policyname = 'Allow authenticated users to insert salaries';
  IF FOUND THEN
    DROP POLICY "Allow authenticated users to insert salaries" ON public.salaries;
  END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'salaries' AND policyname = 'Allow authenticated users to select salaries';
  IF FOUND THEN
    DROP POLICY "Allow authenticated users to select salaries" ON public.salaries;
  END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'salaries' AND policyname = 'Allow authenticated users to update salaries';
  IF FOUND THEN
    DROP POLICY "Allow authenticated users to update salaries" ON public.salaries;
  END IF;

  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'salaries' AND policyname = 'Allow authenticated users to delete salaries';
  IF FOUND THEN
    DROP POLICY "Allow authenticated users to delete salaries" ON public.salaries;
  END IF;
END $$;

-- Create permissive policies for all (anon + authenticated)
CREATE POLICY "Allow all users to insert salaries"
ON public.salaries
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow all users to select salaries"
ON public.salaries
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow all users to update salaries"
ON public.salaries
FOR UPDATE
TO public
USING (true);

CREATE POLICY "Allow all users to delete salaries"
ON public.salaries
FOR DELETE
TO public
USING (true);