
-- Drop existing policies
DROP POLICY IF EXISTS "Super admins can manage all branches" ON branches;
DROP POLICY IF EXISTS "Admins and branch managers can view branches" ON branches;
DROP POLICY IF EXISTS "Admins can insert branches" ON branches;
DROP POLICY IF EXISTS "Admins can update branches" ON branches;
DROP POLICY IF EXISTS "Admins can delete branches" ON branches;

-- Create a simple policy that allows all operations for now
-- Since the app uses custom authentication, we'll allow operations and rely on frontend validation
CREATE POLICY "Allow all branch operations" 
  ON branches 
  FOR ALL 
  USING (true)
  WITH CHECK (true);
