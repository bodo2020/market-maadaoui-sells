-- Fix previous migration error by adding FKs via DO blocks

-- Ensure branch_id column exists on inventory
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Set branch_id for existing inventory rows to the first available branch (if any)
UPDATE public.inventory
SET branch_id = sub.id
FROM (
  SELECT id FROM public.branches
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1
) AS sub
WHERE public.inventory.branch_id IS NULL;

-- Add FK constraint to branches if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public' AND table_name = 'inventory' AND constraint_name = 'inventory_branch_id_fkey'
  ) THEN
    ALTER TABLE public.inventory
    ADD CONSTRAINT inventory_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.branches(id)
    ON DELETE SET NULL;
  END IF;
END$$;

-- Indexes for inventory
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id
ON public.inventory(branch_id);

CREATE INDEX IF NOT EXISTS idx_inventory_product_branch
ON public.inventory(product_id, branch_id);

-- Ensure branch_id column exists on inventory_records
ALTER TABLE public.inventory_records
ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Set branch_id for existing inventory_records rows
UPDATE public.inventory_records
SET branch_id = sub.id
FROM (
  SELECT id FROM public.branches
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1
) AS sub
WHERE public.inventory_records.branch_id IS NULL;

-- Add FK constraint to branches for inventory_records if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public' AND table_name = 'inventory_records' AND constraint_name = 'inventory_records_branch_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_records
    ADD CONSTRAINT inventory_records_branch_id_fkey
    FOREIGN KEY (branch_id) REFERENCES public.branches(id)
    ON DELETE SET NULL;
  END IF;
END$$;

-- Index for inventory_records
CREATE INDEX IF NOT EXISTS idx_inventory_records_branch_id
ON public.inventory_records(branch_id);
