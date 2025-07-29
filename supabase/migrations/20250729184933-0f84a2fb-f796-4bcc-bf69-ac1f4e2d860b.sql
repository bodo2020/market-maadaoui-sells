-- Fix RLS policies for users table to allow authentication
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Allow first user creation" ON public.users;
DROP POLICY IF EXISTS "Allow authentication access" ON public.users;

-- Create new policies that allow authentication
CREATE POLICY "Allow authentication access" ON public.users
FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Admins can manage all users" ON public.users
FOR ALL TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()::text 
    AND u.role IN ('super_admin', 'admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()::text 
    AND u.role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Users can update their own record" ON public.users
FOR UPDATE TO authenticated USING (auth.uid()::text = id);

-- Allow first user creation (when no users exist)
CREATE POLICY "Allow first user creation" ON public.users
FOR INSERT TO authenticated WITH CHECK (
  (SELECT count(*) FROM public.users) = 0
);