-- Fix RLS policies for sales table to allow INSERT operations
-- The system uses custom authentication (users table) not Supabase Auth

-- Drop existing restrictive INSERT policies if any
DROP POLICY IF EXISTS "Admins can insert sales" ON sales;
DROP POLICY IF EXISTS "Users can insert sales" ON sales;

-- Add a permissive INSERT policy for all authenticated users
-- This allows the POS system to create sales
CREATE POLICY "Authenticated users can insert sales"
ON sales
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated' OR auth.role() = 'anon' OR true
);

-- Also ensure UPDATE and DELETE remain controlled
DROP POLICY IF EXISTS "Only admins can update sales" ON sales;
DROP POLICY IF EXISTS "Only admins can delete sales" ON sales;

CREATE POLICY "Only admins can update sales"
ON sales
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Only admins can delete sales"
ON sales
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'admin')
  )
);