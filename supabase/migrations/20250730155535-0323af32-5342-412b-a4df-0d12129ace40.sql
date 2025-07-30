-- Drop all existing policies on sales table
DROP POLICY IF EXISTS "Allow authenticated users to create sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;

-- Create very permissive policies for testing
CREATE POLICY "Allow all operations on sales" 
ON public.sales 
FOR ALL 
USING (true)
WITH CHECK (true);