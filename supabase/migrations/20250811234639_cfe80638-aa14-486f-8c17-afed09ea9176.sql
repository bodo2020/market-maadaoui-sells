-- Add branch_id to inventory and inventory_records for single-branch operations
-- 1) Add column branch_id and set default value from first branch for existing rows

-- Add branch_id to inventory table
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

-- Add FK constraint to branches (allow NULLs, keep existing data safe)
ALTER TABLE public.inventory
ADD CONSTRAINT IF NOT EXISTS inventory_branch_id_fkey
FOREIGN KEY (branch_id) REFERENCES public.branches(id)
ON DELETE SET NULL;

-- Index for branch filtering
CREATE INDEX IF NOT EXISTS idx_inventory_branch_id
ON public.inventory(branch_id);

-- Optional composite index to speed up product+branch lookups
CREATE INDEX IF NOT EXISTS idx_inventory_product_branch
ON public.inventory(product_id, branch_id);

-- 2) Add branch_id to inventory_records used by daily inventory
ALTER TABLE public.inventory_records
ADD COLUMN IF NOT EXISTS branch_id uuid;

-- Set branch_id for existing records to the first available branch (if any)
UPDATE public.inventory_records
SET branch_id = sub.id
FROM (
  SELECT id FROM public.branches
  ORDER BY created_at ASC NULLS LAST
  LIMIT 1
) AS sub
WHERE public.inventory_records.branch_id IS NULL;

-- Add FK constraint and indexes
ALTER TABLE public.inventory_records
ADD CONSTRAINT IF NOT EXISTS inventory_records_branch_id_fkey
FOREIGN KEY (branch_id) REFERENCES public.branches(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_records_branch_id
ON public.inventory_records(branch_id);

-- Note: inventory_sessions currently aggregates by date only. We keep it unchanged for now.
-- Frontend will filter by branch_id when reading/writing inventory records and inventory quantities.
