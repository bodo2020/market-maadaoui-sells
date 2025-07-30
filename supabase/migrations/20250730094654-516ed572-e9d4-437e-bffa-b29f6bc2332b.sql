-- Temporarily disable RLS on products table to debug
ALTER TABLE products DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS and create simpler policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Branch managers and admins can manage products" ON products;
DROP POLICY IF EXISTS "Users can view products in their branch" ON products;

-- Create new, simpler policies for products
CREATE POLICY "Users can view all products" 
ON products 
FOR SELECT 
USING (true);

CREATE POLICY "Users can manage all products" 
ON products 
FOR ALL 
USING (true);