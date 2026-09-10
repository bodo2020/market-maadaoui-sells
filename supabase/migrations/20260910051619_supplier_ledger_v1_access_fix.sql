create or replace function public.get_supplier_ledger_v1(p_supplier_id uuid,p_branch_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_supplier public.suppliers%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then
    if not private.can_manage_financial_branch(null) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
  elsif not (public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then
    raise exception using errcode='42501',message='FINANCE_VIEW_DENIED';
  end if;
  select * into v_supplier from public.suppliers where id=p_supplier_id;
  if v_supplier.id is null then raise exception using errcode='22023',message='SUPPLIER_NOT_FOUND'; end if;
  return jsonb_build_object('supplier',to_jsonb(v_supplier),'branch_balance',case when p_branch_id is null then null else coalesce((select round(sum(signed_amount),2) from private.supplier_ledger_v1 where supplier_id=p_supplier_id and branch_id=p_branch_id),0) end,'global_balance',coalesce((select round(sum(signed_amount),2) from private.supplier_ledger_v1 where supplier_id=p_supplier_id),0),'entries',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select l.*,u.name created_by_name,r.name representative_name,p.invoice_number from private.supplier_ledger_v1 l left join public.users u on u.id=l.created_by left join private.supplier_representatives_v1 r on r.id=l.representative_id left join public.purchases p on p.id=l.purchase_id where l.supplier_id=p_supplier_id and (p_branch_id is null or l.branch_id=p_branch_id) order by l.created_at desc limit greatest(1,least(coalesce(p_limit,100),300))) x),'[]'::jsonb));
end $$;