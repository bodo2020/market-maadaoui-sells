create or replace function public.create_pos_sale_v6(p_request_id uuid, p_branch_id uuid, p_sale jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_has_customer_credit boolean:=false;
  v_result jsonb;
  v_sale public.sales%rowtype;
  v_paid_base numeric(14,2):=0;
  v_points bigint:=0;
  v_enabled boolean:=false;
  v_rate numeric:=0;
  v_kind text;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_limit numeric(14,2);
  v_available numeric(14,2);
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_sale->'payment_splits','[]'::jsonb))='array' then
    select exists(select 1 from jsonb_array_elements(coalesce(p_sale->'payment_splits','[]'::jsonb)) s join public.pos_payment_methods pm on pm.id=nullif(s->>'payment_method_id','')::uuid and pm.branch_id=p_branch_id where pm.code='customer_credit' and coalesce((s->>'base_amount')::numeric,0)>0) into v_has_customer_credit;
  end if;
  if v_has_customer_credit then perform set_config('app.defer_pos_loyalty','1',true); end if;
  v_result:=public.create_pos_sale_v6_core(p_request_id,p_branch_id,p_sale);
  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.id is null then raise exception using errcode='55000',message='SALE_NOT_CONFIRMED'; end if;
  if v_has_customer_credit and coalesce(v_sale.customer_credit_amount,0)>0 and v_sale.customer_id is not null then
    v_paid_base:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-coalesce(v_sale.customer_credit_amount,0),2),0);
    select coalesce(enabled,false),coalesce(points_per_egp,0) into v_enabled,v_rate from public.loyalty_settings where singleton=true;
    v_points:=case when v_enabled then floor(v_paid_base*v_rate)::bigint else 0 end;
    update public.sales set loyalty_points_earned=v_points where id=v_sale.id;
    update public.pos_invoices set loyalty_points_earned=v_points where sale_id=v_sale.id;
    if v_points>0 then perform private.post_loyalty_entry(v_sale.customer_id,'earn',v_points,v_paid_base,'pos_sale',v_sale.id,v_sale.branch_id,v_sale.invoice_number,jsonb_build_object('channel','store','policy','paid_now_only','sale_total',v_sale.total,'voucher_amount',coalesce(v_sale.loyalty_voucher_amount,0),'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),'eligible_amount',v_paid_base,'credit_earns_points',false,'receivable_payment_earns_points',false),v_sale.cashier_id); end if;
  end if;
  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.customer_id is not null then
    select round(coalesce(a.balance,0),2),round(coalesce(a.credit_limit,0),2) into v_after,v_limit from private.customer_receivable_accounts_v1 a where a.branch_id=p_branch_id and a.customer_id=v_sale.customer_id;
    if found then v_kind:='customer'; v_before:=round(v_after-coalesce(v_sale.customer_credit_amount,0),2); v_available:=greatest(round(v_limit-v_after,2),0); end if;
  elsif v_sale.employee_id is not null then
    select round(coalesce(a.receivable_balance,0),2),round(coalesce(a.credit_limit,0),2) into v_after,v_limit from private.hr_employee_wallet_accounts a where a.employee_id=v_sale.employee_id;
    if found then v_kind:='employee'; v_before:=round(v_after-coalesce(v_sale.employee_credit_amount,0),2); v_available:=greatest(round(v_limit-v_after,2),0); end if;
  end if;
  if v_kind is not null then
    update public.sales set receivable_party_kind=v_kind,receivable_balance_before=v_before,receivable_balance_after=v_after,receivable_credit_limit=v_limit,receivable_credit_available_after=v_available where id=v_sale.id returning * into v_sale;
    update public.pos_invoices set receivable_party_kind=v_kind,receivable_balance_before=v_before,receivable_balance_after=v_after,receivable_credit_limit=v_limit,receivable_credit_available_after=v_available where sale_id=v_sale.id;
  end if;
  if v_has_customer_credit and coalesce(v_sale.customer_credit_amount,0)>0 and v_sale.customer_id is not null then
    return coalesce(v_result,'{}'::jsonb)||to_jsonb(v_sale)||jsonb_build_object('sale_version',8,'loyalty_policy','paid_now_only','loyalty_eligible_paid_amount',v_paid_base,'loyalty_credit_amount_excluded',coalesce(v_sale.customer_credit_amount,0),'loyalty_points_earned',v_points,'receivable_payment_earns_points',false);
  end if;
  return coalesce(v_result,'{}'::jsonb)||to_jsonb(v_sale)||jsonb_build_object('sale_version',8);
end;
$function$;

create or replace function public.create_pos_sale_v7(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language sql security definer set search_path=''
as $function$ select public.create_pos_sale_v6(p_request_id,p_branch_id,p_sale)||jsonb_build_object('sale_version',8); $function$;
