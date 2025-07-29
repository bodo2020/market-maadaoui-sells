-- Fix infinite recursion in users table policies
-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Admins can delete data" ON public.users;
DROP POLICY IF EXISTS "Admins can insert data" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Admins can modify users" ON public.users;
DROP POLICY IF EXISTS "Admins can update data" ON public.users;
DROP POLICY IF EXISTS "Allow create first admin or admin users can create other users" ON public.users;
DROP POLICY IF EXISTS "Branch managers can manage their branch users" ON public.users;
DROP POLICY IF EXISTS "Super admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Users can update own record" ON public.users;
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can view own data" ON public.users;
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;

-- Create simple, non-recursive policies for users table
CREATE POLICY "Enable read access for all users" ON public.users
FOR SELECT USING (true);

CREATE POLICY "Enable insert for first user or authenticated users" ON public.users
FOR INSERT WITH CHECK (
  (SELECT COUNT(*) FROM public.users) = 0 OR 
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update their own record" ON public.users
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Enable delete for authenticated users" ON public.users
FOR DELETE USING (auth.uid() IS NOT NULL);