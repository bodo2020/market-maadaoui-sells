-- تصفير كميات المنتجات للفروع MMG و MMG1
UPDATE public.inventory
SET quantity = 0, updated_at = now()
WHERE branch_id IN (
  SELECT id FROM public.branches 
  WHERE code IN ('MMG', 'MMG1')
);