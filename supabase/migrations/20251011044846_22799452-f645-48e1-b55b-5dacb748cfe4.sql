-- Copy quantities from products table to inventory table for branch MMG1
DO $$
DECLARE
  v_branch_id uuid := '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'; -- MMG1 branch
BEGIN
  -- Copy quantities from products to inventory for MMG1 branch
  -- If record exists, update it; otherwise insert new record
  INSERT INTO public.inventory (product_id, quantity, branch_id, created_at, updated_at)
  SELECT 
    p.id as product_id,
    COALESCE(p.quantity, 0) as quantity,
    v_branch_id as branch_id,
    now() as created_at,
    now() as updated_at
  FROM public.products p
  ON CONFLICT (product_id, branch_id) 
  DO UPDATE SET 
    quantity = EXCLUDED.quantity,
    updated_at = now();
    
  RAISE NOTICE 'Successfully copied quantities to inventory for branch MMG1';
END $$;