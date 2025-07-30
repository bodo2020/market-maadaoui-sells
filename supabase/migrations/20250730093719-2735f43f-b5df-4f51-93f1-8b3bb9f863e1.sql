-- Update existing products to have branch_id and reset quantities
-- First, add branch_id to existing products (set to first available branch)
UPDATE products 
SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
WHERE branch_id IS NULL;

-- Reset all product quantities to 0 for existing products
UPDATE products SET quantity = 0;

-- Add branch_id to delivery location tables
ALTER TABLE governorates ADD COLUMN branch_id UUID REFERENCES branches(id);
ALTER TABLE cities ADD COLUMN branch_id UUID REFERENCES branches(id);
ALTER TABLE areas ADD COLUMN branch_id UUID REFERENCES branches(id);
ALTER TABLE neighborhoods ADD COLUMN branch_id UUID REFERENCES branches(id);

-- Create branch_inventory table for better inventory management
CREATE TABLE IF NOT EXISTS public.branch_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, branch_id)
);

-- Enable RLS on branch_inventory
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

-- Create policies for branch_inventory
CREATE POLICY "Users can view inventory for their branch" 
ON public.branch_inventory 
FOR SELECT 
USING (
  branch_id IN (
    SELECT users.branch_id 
    FROM users 
    WHERE users.id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 
    FROM users u 
    WHERE u.id = auth.uid() AND u.role = 'super_admin'
  )
);

CREATE POLICY "Users can manage inventory for their branch" 
ON public.branch_inventory 
FOR ALL 
USING (
  branch_id IN (
    SELECT users.branch_id 
    FROM users 
    WHERE users.id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 
    FROM users u 
    WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin', 'branch_manager')
  )
);

-- Create function to sync product quantities with branch inventory
CREATE OR REPLACE FUNCTION sync_product_branch_inventory()
RETURNS TRIGGER AS $$
BEGIN
  -- When a product is created, create inventory records for all branches
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.branch_inventory (product_id, branch_id, quantity)
    SELECT NEW.id, b.id, 0
    FROM branches b
    WHERE NOT EXISTS (
      SELECT 1 FROM public.branch_inventory 
      WHERE product_id = NEW.id AND branch_id = b.id
    );
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create inventory records
CREATE TRIGGER sync_product_branch_inventory_trigger
  AFTER INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_product_branch_inventory();

-- Update delivery location policies to include branch filtering
DROP POLICY IF EXISTS "All users can view governorates" ON governorates;
CREATE POLICY "Users can view governorates for their branch" 
ON public.governorates 
FOR SELECT 
USING (
  branch_id IS NULL OR 
  branch_id IN (
    SELECT users.branch_id 
    FROM users 
    WHERE users.id = auth.uid()
  ) OR 
  EXISTS (
    SELECT 1 
    FROM users u 
    WHERE u.id = auth.uid() AND u.role = 'super_admin'
  )
);

-- Update existing delivery locations to be associated with the first branch
UPDATE governorates 
SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
WHERE branch_id IS NULL;

UPDATE cities 
SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
WHERE branch_id IS NULL;

UPDATE areas 
SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
WHERE branch_id IS NULL;

UPDATE neighborhoods 
SET branch_id = (SELECT id FROM branches ORDER BY created_at LIMIT 1)
WHERE branch_id IS NULL;