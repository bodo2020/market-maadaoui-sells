-- Since the app uses custom authentication (not Supabase Auth), 
-- we need to create policies that don't depend on auth.uid()
-- Instead, we'll create policies that allow all operations since the app handles auth internally

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow all operations on sales" ON public.sales;

-- Create new policy that allows all operations without auth dependency
CREATE POLICY "Allow operations on sales without auth" 
ON public.sales 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Make sure RLS is enabled but policies allow the operations
-- (since the app handles authentication at the application level)