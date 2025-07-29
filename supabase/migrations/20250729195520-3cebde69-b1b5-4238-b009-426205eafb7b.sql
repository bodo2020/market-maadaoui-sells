
-- Fix RLS policies for users table to allow proper viewing and management
DROP POLICY IF EXISTS "Allow reading users for authentication" ON public.users;
DROP POLICY IF EXISTS "Allow admin roles to insert users" ON public.users;
DROP POLICY IF EXISTS "Allow admin roles to update users" ON public.users;
DROP POLICY IF EXISTS "Allow admin roles to delete users" ON public.users;

-- Create policy to allow viewing users (needed for authentication and user management)
CREATE POLICY "Allow reading users for authentication" 
ON public.users 
FOR SELECT 
USING (true);

-- Create policy to allow admins to insert users
CREATE POLICY "Allow admin roles to insert users" 
ON public.users 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

-- Create policy to allow admins to update users
CREATE POLICY "Allow admin roles to update users" 
ON public.users 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

-- Create policy to allow admins to delete users
CREATE POLICY "Allow admin roles to delete users" 
ON public.users 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);
