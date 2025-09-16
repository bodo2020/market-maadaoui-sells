-- Fix product save failure due to unique constraint on inventory(product_id)
-- Change to per-branch uniqueness: (product_id, branch_id)

-- 1) Drop old unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_product_id_key'
  ) THEN
    ALTER TABLE public.inventory DROP CONSTRAINT inventory_product_id_key;
  END IF;
END$$;

-- 2) Add composite unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND conname = 'inventory_product_branch_unique'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_product_branch_unique UNIQUE (product_id, branch_id);
  END IF;
END$$;