-- Update the sales table RLS policy to allow inserts without branch restriction
DROP POLICY IF EXISTS "Users can create sales for their branch or admins can create fo" ON public.sales;

-- Create a more permissive policy for sales creation
CREATE POLICY "Allow authenticated users to create sales" 
ON public.sales 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Update the select policy to be more permissive too
DROP POLICY IF EXISTS "Users can view sales in their branch" ON public.sales;

CREATE POLICY "Authenticated users can view sales" 
ON public.sales 
FOR SELECT 
USING (auth.uid() IS NOT NULL);