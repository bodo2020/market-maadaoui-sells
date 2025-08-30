-- Drop the existing restrictive policies and create more permissive ones
DROP POLICY IF EXISTS "Users can insert cash tracking for their branch" ON public.cash_tracking;
DROP POLICY IF EXISTS "Users can update cash tracking for their branch" ON public.cash_tracking;

-- Create temporary policies to allow cash tracking operations for all users
CREATE POLICY "Allow all insert cash tracking" 
ON public.cash_tracking 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow all update cash tracking" 
ON public.cash_tracking 
FOR UPDATE 
USING (true) 
WITH CHECK (true);