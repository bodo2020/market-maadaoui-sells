-- Phase 1: Add branch_id to product_batches table
ALTER TABLE public.product_batches 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_product_batches_branch_id ON public.product_batches(branch_id);

-- Link existing batches to main branch (MMG1)
UPDATE public.product_batches 
SET branch_id = (
  SELECT id FROM public.branches 
  WHERE code = 'MMG1' 
  LIMIT 1
)
WHERE branch_id IS NULL;

-- Update RLS policies for product_batches
DROP POLICY IF EXISTS "Allow all users to manage product batches" ON public.product_batches;
DROP POLICY IF EXISTS "Allow all users to view product batches" ON public.product_batches;

-- Create new branch-aware RLS policies for product_batches
CREATE POLICY "Users can view batches for their branch"
ON public.product_batches
FOR SELECT
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Admins can manage batches for their branch"
ON public.product_batches
FOR ALL
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);

-- Phase 2: Add branch_id to purchase_items table
ALTER TABLE public.purchase_items 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_purchase_items_branch_id ON public.purchase_items(branch_id);

-- Link existing purchase items to main branch (MMG1) through their purchases
UPDATE public.purchase_items pi
SET branch_id = p.branch_id
FROM public.purchases p
WHERE pi.purchase_id = p.id
AND pi.branch_id IS NULL;

-- Phase 3: Update the trigger to use branch_id from purchase_items
CREATE OR REPLACE FUNCTION public.create_product_batch_from_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only create batch if expiry_date is provided
  IF NEW.expiry_date IS NOT NULL THEN
    INSERT INTO public.product_batches (
      product_id,
      batch_number,
      quantity,
      expiry_date,
      shelf_location,
      notes,
      purchase_item_id,
      branch_id,
      created_at,
      updated_at
    ) VALUES (
      NEW.product_id,
      COALESCE(NEW.batch_number, 'BATCH-' || NEW.id::text),
      NEW.quantity,
      NEW.expiry_date,
      NEW.shelf_location,
      NEW.notes,
      NEW.id,
      NEW.branch_id,
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$function$;