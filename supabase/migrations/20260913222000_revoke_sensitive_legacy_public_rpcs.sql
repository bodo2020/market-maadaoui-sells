-- Remove legacy SECURITY DEFINER RPCs from the public/customer API surface.
-- These functions expose internal financial data that is not required by the
-- current customer or management application flows.

revoke execute on function public.get_product_price(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_product_price(uuid, uuid)
to service_role;

revoke execute on function public.get_branches_by_category(public.branch_category)
from public, anon, authenticated;
grant execute on function public.get_branches_by_category(public.branch_category)
to service_role;
