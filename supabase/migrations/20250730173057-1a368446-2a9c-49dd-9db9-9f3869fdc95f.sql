-- Update RLS policy for branch_inventory to allow inserting without auth for return processing
DROP POLICY IF EXISTS "Users can manage inventory for their branch" ON public.branch_inventory;

CREATE POLICY "Users can manage inventory for their branch" 
ON public.branch_inventory 
FOR ALL 
USING (
  -- Allow super admin and admin roles
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  )) OR
  -- Allow users to manage inventory for their branch
  (branch_id IN ( 
    SELECT users.branch_id FROM users 
    WHERE users.id = auth.uid()
  )) OR
  -- Allow service role (for return processing)
  (auth.role() = 'service_role'::text)
) 
WITH CHECK (
  -- Allow super admin and admin roles
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  )) OR
  -- Allow users to manage inventory for their branch
  (branch_id IN ( 
    SELECT users.branch_id FROM users 
    WHERE users.id = auth.uid()
  )) OR
  -- Allow service role (for return processing)
  (auth.role() = 'service_role'::text) OR
  -- Allow anonymous inserts for return processing
  (auth.uid() IS NULL)
);