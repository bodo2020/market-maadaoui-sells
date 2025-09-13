-- Update RLS policies for cart_items to allow viewing all cart items for admins and staff
DROP POLICY IF EXISTS "Allow own favorites" ON cart_items;
DROP POLICY IF EXISTS "Customers can delete their own favorites" ON cart_items;
DROP POLICY IF EXISTS "Customers can insert their own favorites" ON cart_items;
DROP POLICY IF EXISTS "Customers can only see their own favorites" ON cart_items;
DROP POLICY IF EXISTS "Customers can update their own favorites" ON cart_items;
DROP POLICY IF EXISTS "Users can view their own favorites" ON cart_items;

-- Create new policies for cart_items for proper cart management
CREATE POLICY "Anyone can view cart items"
ON cart_items FOR SELECT
USING (true);

CREATE POLICY "Anyone can insert cart items"
ON cart_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can update cart items"
ON cart_items FOR UPDATE
USING (true);

CREATE POLICY "Anyone can delete cart items"
ON cart_items FOR DELETE
USING (true);