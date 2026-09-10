revoke all on function public.charge_employee_wallet_purchase_v1(uuid,uuid,numeric,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.charge_employee_wallet_purchase_v1(uuid,uuid,numeric,text,text,uuid,text,text) to service_role;

-- The function remains callable by its owner from SECURITY DEFINER sale workflows,
-- but cashiers cannot create standalone employee debt outside a POS sale.
