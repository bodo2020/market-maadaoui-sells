
-- Update RLS policies for users table to allow proper user creation
DROP POLICY IF EXISTS "Admins can insert users" ON public.users;
DROP POLICY IF EXISTS "Admins can update users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete users" ON public.users;

-- Create new policies that allow authenticated users with admin roles to manage users
CREATE POLICY "Allow admin roles to insert users" 
ON public.users 
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Allow admin roles to update users" 
ON public.users 
FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Allow admin roles to delete users" 
ON public.users 
FOR DELETE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
);

-- Also ensure the SELECT policy allows proper access
DROP POLICY IF EXISTS "Allow reading users for authentication" ON public.users;
CREATE POLICY "Allow reading users for authentication" 
ON public.users 
FOR SELECT 
TO authenticated
USING (true);
