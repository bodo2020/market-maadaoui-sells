-- Check current policies on branches table first
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'branches';

-- Fix the RLS policies by first dropping all existing policies
DROP POLICY IF EXISTS "Admins and super admins can manage all branches" ON public.branches;
DROP POLICY IF EXISTS "Branch managers can view their branch" ON public.branches;

-- Create new policies with proper permissions
CREATE POLICY "Admins can manage all branches" ON public.branches
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('super_admin', 'admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Branch managers can view their own branch" ON public.branches
FOR SELECT TO authenticated USING (
  manager_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('super_admin', 'admin')
  )
);