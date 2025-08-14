-- Fix RLS policies to allow unauthenticated users to insert sales

-- Update the INSERT policy for sales to allow anyone (including anonymous users)
DROP POLICY IF EXISTS "Allow authenticated users to insert sales" ON public.sales;

CREATE POLICY "Allow anyone to insert sales" 
ON public.sales 
FOR INSERT 
WITH CHECK (true);

-- Also update SELECT policy to show all sales if no authentication is available
DROP POLICY IF EXISTS "Branch users can view sales" ON public.sales;

CREATE POLICY "Anyone can view sales" 
ON public.sales 
FOR SELECT 
USING (true);