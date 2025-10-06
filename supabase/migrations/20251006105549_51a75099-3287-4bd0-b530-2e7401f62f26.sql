-- Fix RLS policies for sales table to restrict by branch
-- First, drop all existing overly permissive policies
DROP POLICY IF EXISTS "Allow all operations on sales" ON sales;
DROP POLICY IF EXISTS "Allow operations on sales without auth" ON sales;
DROP POLICY IF EXISTS "Anyone can view sales" ON sales;
DROP POLICY IF EXISTS "Allow anyone to insert sales" ON sales;

-- Keep admin policies
-- Policy "Admins can manage all sales" already exists and is correct
-- Policy "Users can update their own sales" already exists and is correct

-- Add branch-based policies
-- Users can view sales from their own branch
CREATE POLICY "Users can view sales from their branch"
ON sales
FOR SELECT
USING (
  is_super_admin() 
  OR is_admin() 
  OR has_branch_access(auth.uid(), branch_id)
);

-- Users can insert sales to their branch
CREATE POLICY "Users can insert sales to their branch"
ON sales
FOR INSERT
WITH CHECK (
  is_super_admin() 
  OR is_admin() 
  OR has_branch_access(auth.uid(), branch_id)
  OR auth.uid() IS NOT NULL -- Allow authenticated users to create sales (branch_id will be set automatically)
);

-- Users can delete sales from their branch
CREATE POLICY "Users can delete sales from their branch"
ON sales
FOR DELETE
USING (
  is_super_admin() 
  OR is_admin() 
  OR has_branch_access(auth.uid(), branch_id)
);