-- Add temporary policies to allow all operations on suppliers
CREATE POLICY "Temporary allow all operations on suppliers" 
ON public.suppliers 
FOR ALL 
USING (true)
WITH CHECK (true);

-- Drop the restrictive admin policy
DROP POLICY IF EXISTS "Allow admins to manage suppliers" ON public.suppliers;