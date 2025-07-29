-- Check current RLS policies for users table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'users';

-- Fix RLS policies for users table to allow admins to create users
DROP POLICY IF EXISTS "Enable insert for first user or authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.users;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;

-- Create new policies for users table
CREATE POLICY "Admins can manage all users" ON public.users
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Users can view all users" ON public.users
FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update their own record" ON public.users
FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Allow first user creation (when no users exist)
CREATE POLICY "Allow first user creation" ON public.users
FOR INSERT TO authenticated WITH CHECK (
  (SELECT count(*) FROM public.users) = 0
);