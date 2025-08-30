-- Allow users to insert cash tracking records for their branch
CREATE POLICY "Users can insert cash tracking for their branch" 
ON public.cash_tracking 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    branch_id IS NULL OR 
    has_branch_access(auth.uid(), branch_id) OR 
    is_admin() OR 
    is_super_admin()
  )
);

-- Allow users to update cash tracking records for their branch
CREATE POLICY "Users can update cash tracking for their branch" 
ON public.cash_tracking 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL AND (
    branch_id IS NULL OR 
    has_branch_access(auth.uid(), branch_id) OR 
    is_admin() OR 
    is_super_admin()
  )
) 
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    branch_id IS NULL OR 
    has_branch_access(auth.uid(), branch_id) OR 
    is_admin() OR 
    is_super_admin()
  )
);