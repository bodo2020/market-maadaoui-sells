-- Broaden RLS to allow inserts/updates/deletes for purchases and purchase_items (internal app)
-- Purchases
CREATE POLICY "Anyone can insert purchases" 
ON public.purchases 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update purchases" 
ON public.purchases 
FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can delete purchases" 
ON public.purchases 
FOR DELETE 
USING (true);

-- Purchase items
CREATE POLICY "Anyone can insert purchase_items" 
ON public.purchase_items 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update purchase_items" 
ON public.purchase_items 
FOR UPDATE 
USING (true)
WITH CHECK (true);

CREATE POLICY "Anyone can delete purchase_items" 
ON public.purchase_items 
FOR DELETE 
USING (true);