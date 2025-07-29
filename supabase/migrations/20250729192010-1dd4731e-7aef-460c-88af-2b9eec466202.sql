
-- Update RLS policies for branches table to allow super_admin users to create branches
DROP POLICY IF EXISTS "Admins can manage all branches" ON branches;
DROP POLICY IF EXISTS "Branch managers can view their own branch" ON branches;

-- Create new comprehensive policy for branch management
CREATE POLICY "Super admins can manage all branches" 
  ON branches 
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'super_admin'
    )
  );

-- Allow admins and branch managers to view branches
CREATE POLICY "Admins and branch managers can view branches" 
  ON branches 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'admin', 'branch_manager')
    ) OR
    manager_id = auth.uid()
  );

-- Allow admins to insert and update branches
CREATE POLICY "Admins can insert branches" 
  ON branches 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can update branches" 
  ON branches 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can delete branches" 
  ON branches 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('super_admin', 'admin')
    )
  );
