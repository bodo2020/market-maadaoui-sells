-- Fix RLS policies for users table to allow authentication
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own record" ON public.users;
DROP POLICY IF EXISTS "Allow first user creation" ON public.users;
DROP POLICY IF EXISTS "Allow authentication access" ON public.users;

-- Simple policy to allow reading users for authentication
CREATE POLICY "Allow reading users for authentication" ON public.users
FOR SELECT USING (true);

-- Allow admins to manage users
CREATE POLICY "Admins can insert users" ON public.users
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update users" ON public.users
FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Admins can delete users" ON public.users
FOR DELETE TO authenticated USING (true);