-- Fix RLS policies for branches table to allow admin users to manage branches
-- Drop existing policies
DROP POLICY IF EXISTS "Branch managers can view their branch" ON public.branches;
DROP POLICY IF EXISTS "Super admins can manage all branches" ON public.branches;

-- Create new policies that allow both admin and super_admin to manage branches
CREATE POLICY "Admins and super admins can manage all branches" ON public.branches
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
  )
);

CREATE POLICY "Branch managers can view their branch" ON public.branches
FOR SELECT USING (
  manager_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
    AND users.role = ANY (ARRAY['super_admin'::text, 'admin'::text])
  )
);