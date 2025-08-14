-- Update RLS policies to allow access to records without branch_id

-- Drop existing policies for cash_transactions
DROP POLICY IF EXISTS "Admins manage cash_transactions" ON public.cash_transactions;
DROP POLICY IF EXISTS "Branch users view cash_transactions" ON public.cash_transactions;

-- Create new policies for cash_transactions
CREATE POLICY "Admins manage cash_transactions" 
ON public.cash_transactions 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Branch users view cash_transactions" 
ON public.cash_transactions 
FOR SELECT 
USING (
  branch_id IS NULL OR 
  has_branch_access(auth.uid(), branch_id) OR 
  is_admin() OR 
  is_super_admin()
);

-- Drop existing policies for cash_tracking
DROP POLICY IF EXISTS "Admins manage cash_tracking" ON public.cash_tracking;
DROP POLICY IF EXISTS "Branch users view cash_tracking" ON public.cash_tracking;

-- Create new policies for cash_tracking
CREATE POLICY "Admins manage cash_tracking" 
ON public.cash_tracking 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Branch users view cash_tracking" 
ON public.cash_tracking 
FOR SELECT 
USING (
  branch_id IS NULL OR 
  has_branch_access(auth.uid(), branch_id) OR 
  is_admin() OR 
  is_super_admin()
);

-- Drop existing policies for sales
DROP POLICY IF EXISTS "Admins manage sales" ON public.sales;
DROP POLICY IF EXISTS "Branch users view sales for their branch" ON public.sales;

-- Create new policies for sales
CREATE POLICY "Admins manage sales" 
ON public.sales 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Branch users view sales" 
ON public.sales 
FOR SELECT 
USING (
  branch_id IS NULL OR 
  has_branch_access(auth.uid(), branch_id) OR 
  is_admin() OR 
  is_super_admin()
);