-- Fix RLS policies for sales table to allow INSERT for all authenticated users

-- Drop existing policies for sales
DROP POLICY IF EXISTS "Admins manage sales" ON public.sales;
DROP POLICY IF EXISTS "Branch users view sales" ON public.sales;

-- Create new policies for sales
CREATE POLICY "Allow authenticated users to insert sales" 
ON public.sales 
FOR INSERT 
TO authenticated
WITH CHECK (true);

CREATE POLICY "Admins can manage all sales" 
ON public.sales 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Branch users can view sales" 
ON public.sales 
FOR SELECT 
USING (
  branch_id IS NULL OR 
  has_branch_access(auth.uid(), branch_id) OR 
  is_admin() OR 
  is_super_admin()
);

CREATE POLICY "Users can update their own sales" 
ON public.sales 
FOR UPDATE 
USING (
  cashier_id = auth.uid() OR 
  is_admin() OR 
  is_super_admin()
);