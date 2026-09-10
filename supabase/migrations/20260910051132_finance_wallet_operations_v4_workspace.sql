create or replace function public.get_finance_wallet_workspace_v4(p_branch_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
  select jsonb_build_object(
    'version',4,
    'wallets',coalesce((select jsonb_agg(jsonb_build_object('account_id',pa.id,'name',pa.name,'balance',private.payment_account_balance(pa.id),'method_id',ppm.id,'code',ppm.code,'method_name',ppm.name,'method_type',ppm.method_type,'fee_type',ppm.fee_type,'fee_value',ppm.fee_value,'fee_bearer',ppm.fee_bearer,'require_reference',ppm.require_reference) order by ppm.sort_order nulls last,ppm.name)
      from public.payment_accounts pa join public.pos_payment_methods ppm on ppm.settlement_account_id=pa.id and ppm.branch_id=pa.branch_id and ppm.active is true
      where pa.branch_id=p_branch_id and pa.active is true and pa.account_type='gateway_clearing' and ppm.method_type='digital_wallet'),'[]'::jsonb),
    'suppliers',coalesce((select jsonb_agg(jsonb_build_object('supplier_id',s.id,'name',s.name,'phone',s.phone,'branch_balance',coalesce((select round(sum(l.signed_amount),2) from private.supplier_ledger_v1 l where l.supplier_id=s.id and l.branch_id=p_branch_id),0),'global_balance',coalesce(s.balance,0)) order by s.name) from public.suppliers s),'[]'::jsonb),
    'representatives',coalesce((select jsonb_agg(to_jsonb(r) order by r.name) from private.supplier_representatives_v1 r where r.branch_id=p_branch_id),'[]'::jsonb),
    'open_purchases',coalesce((select jsonb_agg(jsonb_build_object('purchase_id',p.id,'supplier_id',p.supplier_id,'invoice_number',p.invoice_number,'date',p.date,'total',p.total,'paid',p.paid,'outstanding',round(p.total-p.paid,2)) order by p.date desc) from public.purchases p where p.branch_id=p_branch_id and round(p.total-p.paid,2)>0),'[]'::jsonb),
    'recent_operations',coalesce((select jsonb_agg(jsonb_build_object('operation_id',o.id,'request_id',o.request_id,'operation_type',o.operation_type,'account_id',o.payment_account_id,'account_name',pa.name,'principal_amount',o.principal_amount,'expected_fee_amount',o.expected_fee_amount,'actual_fee_amount',o.actual_fee_amount,'fee_saving_amount',o.fee_saving_amount,'total_debit',o.total_debit,'supplier_id',o.supplier_id,'supplier_name',s.name,'representative_id',o.representative_id,'representative_name',r.name,'purchase_id',o.purchase_id,'expense_id',o.expense_id,'apply_to_supplier',o.apply_to_supplier,'provider_reference',o.provider_reference,'note',o.note,'status',o.status,'created_by',o.created_by,'created_by_name',u.name,'created_at',o.created_at,'voided_at',o.voided_at,'void_reason',o.void_reason) order by o.created_at desc)
      from (select * from private.finance_wallet_operations_v4 where branch_id=p_branch_id order by created_at desc limit greatest(1,least(coalesce(p_limit,100),300))) o
      join public.payment_accounts pa on pa.id=o.payment_account_id left join public.suppliers s on s.id=o.supplier_id left join private.supplier_representatives_v1 r on r.id=o.representative_id left join public.users u on u.id=o.created_by),'[]'::jsonb),
    'legacy_unassigned_supplier_entries',(select count(*) from private.supplier_ledger_v1 where branch_id is null)
  ) into v_result;
  return v_result;
end $$;

create or replace function public.save_supplier_representative_v1(
  p_branch_id uuid,p_supplier_id uuid,p_name text,p_phone text default null,p_can_receive_payments boolean default false,p_payout_method text default null,p_payout_destination text default null,p_payment_limit numeric default null,p_notes text default null,p_active boolean default true,p_representative_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row private.supplier_representatives_v1%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  if nullif(trim(coalesce(p_name,'')),'') is null then raise exception using errcode='22023',message='REPRESENTATIVE_NAME_REQUIRED'; end if;
  if p_payment_limit is not null and p_payment_limit<0 then raise exception using errcode='22023',message='INVALID_PAYMENT_LIMIT'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception using errcode='22023',message='SUPPLIER_NOT_FOUND'; end if;
  if p_representative_id is null then
    insert into private.supplier_representatives_v1(branch_id,supplier_id,name,phone,active,can_receive_payments,payout_method,payout_destination,payment_limit,notes,created_by,updated_by)
    values(p_branch_id,p_supplier_id,trim(p_name),nullif(trim(coalesce(p_phone,'')),''),coalesce(p_active,true),coalesce(p_can_receive_payments,false),nullif(trim(coalesce(p_payout_method,'')),''),nullif(trim(coalesce(p_payout_destination,'')),''),p_payment_limit,nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning * into v_row;
  else
    update private.supplier_representatives_v1 set supplier_id=p_supplier_id,name=trim(p_name),phone=nullif(trim(coalesce(p_phone,'')),''),active=coalesce(p_active,true),can_receive_payments=coalesce(p_can_receive_payments,false),payout_method=nullif(trim(coalesce(p_payout_method,'')),''),payout_destination=nullif(trim(coalesce(p_payout_destination,'')),''),payment_limit=p_payment_limit,notes=nullif(trim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now()
    where id=p_representative_id and branch_id=p_branch_id returning * into v_row;
    if v_row.id is null then raise exception using errcode='22023',message='REPRESENTATIVE_NOT_FOUND'; end if;
  end if;
  return to_jsonb(v_row);
end $$;

create or replace function public.get_supplier_ledger_v1(p_supplier_id uuid,p_branch_id uuid default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_supplier public.suppliers%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is not null and not (public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
  select * into v_supplier from public.suppliers where id=p_supplier_id;
  if v_supplier.id is null then raise exception using errcode='22023',message='SUPPLIER_NOT_FOUND'; end if;
  return jsonb_build_object('supplier',to_jsonb(v_supplier),'branch_balance',case when p_branch_id is null then null else coalesce((select round(sum(signed_amount),2) from private.supplier_ledger_v1 where supplier_id=p_supplier_id and branch_id=p_branch_id),0) end,'global_balance',coalesce((select round(sum(signed_amount),2) from private.supplier_ledger_v1 where supplier_id=p_supplier_id),0),'entries',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select l.*,u.name created_by_name,r.name representative_name,p.invoice_number from private.supplier_ledger_v1 l left join public.users u on u.id=l.created_by left join private.supplier_representatives_v1 r on r.id=l.representative_id left join public.purchases p on p.id=l.purchase_id where l.supplier_id=p_supplier_id and (p_branch_id is null or l.branch_id=p_branch_id) order by l.created_at desc limit greatest(1,least(coalesce(p_limit,100),300))) x),'[]'::jsonb));
end $$;

revoke all on function public.get_finance_wallet_workspace_v4(uuid,integer) from public,anon;
revoke all on function public.save_supplier_representative_v1(uuid,uuid,text,text,boolean,text,text,numeric,text,boolean,uuid) from public,anon;
revoke all on function public.get_supplier_ledger_v1(uuid,uuid,integer) from public,anon;
grant execute on function public.get_finance_wallet_workspace_v4(uuid,integer) to authenticated;
grant execute on function public.save_supplier_representative_v1(uuid,uuid,text,text,boolean,text,text,numeric,text,boolean,uuid) to authenticated;
grant execute on function public.get_supplier_ledger_v1(uuid,uuid,integer) to authenticated;