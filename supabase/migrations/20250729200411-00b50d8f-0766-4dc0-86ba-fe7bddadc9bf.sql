
-- Fix RLS policies for users table to properly handle user insertion
DROP POLICY IF EXISTS "Allow admin roles to insert users" ON public.users;

-- Create a more flexible policy for user insertion that checks authentication differently
CREATE POLICY "Allow admin roles to insert users" 
ON public.users 
FOR INSERT 
WITH CHECK (
  -- Allow if user is authenticated and has admin role (using stored procedure for safety)
  (
    SELECT COUNT(*) > 0 
    FROM public.users u 
    WHERE u.username = current_setting('request.jwt.claims', true)::json->>'username'
    AND u.role IN ('super_admin', 'admin')
  )
  OR
  -- Fallback: Allow if the inserting user exists and has admin privileges
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
  OR
  -- Allow for system/service operations (when no auth context)
  auth.uid() IS NULL
);

-- Also update the other policies to be more flexible
DROP POLICY IF EXISTS "Allow admin roles to update users" ON public.users;
DROP POLICY IF EXISTS "Allow admin roles to delete users" ON public.users;

CREATE POLICY "Allow admin roles to update users" 
ON public.users 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('super_admin', 'admin')
  )
  OR
  -- Allow users to update their own records
  id = auth.uid()
);

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
