-- Create RLS policies for purchases table
CREATE POLICY "Admins and super admins can manage purchases" 
ON public.purchases 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Allow all users to view purchases" 
ON public.purchases 
FOR SELECT 
USING (true);

-- Create RLS policies for purchase_items table if not exist
CREATE POLICY "Admins and super admins can manage purchase items" 
ON public.purchase_items 
FOR ALL 
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

CREATE POLICY "Allow all users to view purchase items" 
ON public.purchase_items 
FOR SELECT 
USING (true);