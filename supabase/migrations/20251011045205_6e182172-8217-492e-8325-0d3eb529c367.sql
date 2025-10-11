-- Update all quantities in inventory table to match products table for branch MMG1
DO $$
DECLARE
  v_branch_id uuid := '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'; -- MMG1 branch
  v_updated_count integer;
BEGIN
  -- Update existing inventory records
  UPDATE public.inventory i
  SET quantity = COALESCE(p.quantity, 0),
      updated_at = now()
  FROM public.products p
  WHERE i.product_id = p.id 
    AND i.branch_id = v_branch_id
    AND i.quantity != COALESCE(p.quantity, 0);
    
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % inventory records to match products quantities', v_updated_count;
  
  -- Insert any missing products
  INSERT INTO public.inventory (product_id, quantity, branch_id, created_at, updated_at)
  SELECT 
    p.id as product_id,
    COALESCE(p.quantity, 0) as quantity,
    v_branch_id as branch_id,
    now() as created_at,
    now() as updated_at
  FROM public.products p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory i 
    WHERE i.product_id = p.id AND i.branch_id = v_branch_id
  );
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Inserted % new inventory records', v_updated_count;
END $$;