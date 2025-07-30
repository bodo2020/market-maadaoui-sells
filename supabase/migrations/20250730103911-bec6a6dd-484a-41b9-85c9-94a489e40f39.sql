-- Fix RLS policy for sales table to allow sales creation
-- First, drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can create sales in their branch" ON sales;

-- Create a more flexible INSERT policy that allows sales creation
-- Either the user has a branch_id that matches the sale's branch_id, 
-- OR the user is an admin/super_admin who can create sales for any branch
CREATE POLICY "Users can create sales for their branch or admins can create for any branch" 
ON sales FOR INSERT 
WITH CHECK (
  -- Allow if branch_id matches user's branch
  (branch_id IN (
    SELECT users.branch_id 
    FROM users 
    WHERE users.id = auth.uid()
  )) 
  OR 
  -- Allow if user is admin/super_admin (can create sales for any branch)
  (EXISTS (
    SELECT 1 
    FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY(ARRAY['super_admin', 'admin', 'branch_manager'])
  ))
  OR
  -- Allow if branch_id is null (fallback for legacy data)
  (branch_id IS NULL)
);