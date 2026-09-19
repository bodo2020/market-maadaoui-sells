-- The legacy public.damaged_products table is intentionally excluded from branch reporting.
-- It has historical rows but no branch_id, so attributing those losses to a selected branch would be unsafe.
-- get_reporting_waste_v1 exposes the same decision in its data_quality metadata in production.
comment on function public.get_reporting_waste_v1(uuid,timestamptz,timestamptz,integer)
is 'Branch-scoped waste report. Legacy public.damaged_products is excluded because it has no branch_id; authoritative source is approved negative inventory adjustment reviews for damage/breakage.';
