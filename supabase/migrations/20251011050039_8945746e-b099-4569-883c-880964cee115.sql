-- Sync all quantities from products to inventory for branches MMG and MMG1
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT id FROM public.branches WHERE code IN ('MMG','MMG1')
  ) LOOP
    INSERT INTO public.inventory (product_id, quantity, branch_id, created_at, updated_at)
    SELECT p.id, COALESCE(p.quantity, 0), r.id, now(), now()
    FROM public.products p
    ON CONFLICT (product_id, branch_id)
    DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = now();
  END LOOP;
END $$;