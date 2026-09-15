alter function public.create_pos_sale_v6(uuid,uuid,jsonb) rename to create_pos_sale_v6_core;

create or replace function public.create_pos_sale_v6(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_has_customer_credit boolean:=false;
  v_result jsonb;
  v_sale public.sales%rowtype;
  v_paid_base numeric(14,2):=0;
  v_points bigint:=0;
  v_enabled boolean:=false;
  v_rate numeric:=0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_sale->'payment_splits','[]'::jsonb))='array' then
    select exists(
      select 1 from jsonb_array_elements(coalesce(p_sale->'payment_splits','[]'::jsonb)) s
      join public.pos_payment_methods pm on pm.id=nullif(s->>'payment_method_id','')::uuid and pm.branch_id=p_branch_id
      where pm.code='customer_credit' and coalesce((s->>'base_amount')::numeric,0)>0
    ) into v_has_customer_credit;
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
    if v_points>0 then
      perform private.post_loyalty_entry(v_sale.customer_id,'earn',v_points,v_paid_base,'pos_sale',v_sale.id,v_sale.branch_id,v_sale.invoice_number,
        jsonb_build_object('channel','store','policy','paid_now_only','sale_total',v_sale.total,'voucher_amount',coalesce(v_sale.loyalty_voucher_amount,0),
          'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),'eligible_amount',v_paid_base,'credit_earns_points',false,'receivable_payment_earns_points',false),v_sale.cashier_id);
    end if;
    select * into v_sale from public.sales where id=v_sale.id;
    v_result:=coalesce(v_result,'{}'::jsonb)||to_jsonb(v_sale)||jsonb_build_object('sale_version',7,'loyalty_policy','paid_now_only',
      'loyalty_eligible_paid_amount',v_paid_base,'loyalty_credit_amount_excluded',coalesce(v_sale.customer_credit_amount,0),
      'loyalty_points_earned',v_points,'receivable_payment_earns_points',false);
  else
    v_result:=coalesce(v_result,'{}'::jsonb)||jsonb_build_object('sale_version',7);
  end if;
  return v_result;
end;
$function$;

create or replace function public.create_pos_sale_v7(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language sql security definer set search_path=''
as $function$
  select public.create_pos_sale_v6(p_request_id,p_branch_id,p_sale)||jsonb_build_object('sale_version',7);
$function$;

alter function public.get_pos_sale_return_preview_v6(uuid) rename to get_pos_sale_return_preview_v6_core;

create or replace function public.get_pos_sale_return_preview_v7(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_sale public.sales%rowtype;
  v_paid_base numeric(14,2):=0;
  v_returned_customer_credit numeric(14,2):=0;
  v_returned_employee_credit numeric(14,2):=0;
  v_returned_paid numeric(14,2):=0;
begin
  v_base:=public.get_pos_sale_return_preview_v6_core(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  v_paid_base:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-coalesce(v_sale.customer_credit_amount,0)-coalesce(v_sale.employee_credit_amount,0),2),0);
  select coalesce(sum(customer_credit_refund_amount),0),coalesce(sum(employee_credit_refund_amount),0),coalesce(sum(refund_cash_amount+refund_card_amount),0)
    into v_returned_customer_credit,v_returned_employee_credit,v_returned_paid
  from public.returns where sale_id=v_sale.id and status='approved';
  return v_base||jsonb_build_object(
    'return_version',7,'paid_base_amount',v_paid_base,'amount_paid',v_paid_base,
    'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),'employee_credit_amount',coalesce(v_sale.employee_credit_amount,0),
    'returned_customer_credit',round(v_returned_customer_credit,2),'returned_employee_credit',round(v_returned_employee_credit,2),
    'remaining_customer_credit',greatest(round(coalesce(v_sale.customer_credit_amount,0)-v_returned_customer_credit,2),0),
    'remaining_employee_credit',greatest(round(coalesce(v_sale.employee_credit_amount,0)-v_returned_employee_credit,2),0),
    'returned_customer_money',round(v_returned_paid,2),'remaining_customer_paid',greatest(round(v_paid_base-v_returned_paid,2),0),
    'partial_credit_sale',((coalesce(v_sale.customer_credit_amount,0)+coalesce(v_sale.employee_credit_amount,0))>0 and v_paid_base>0),
    'credit_return_policy','credit_first_then_paid_methods'
  );
end;
$function$;

create or replace function public.get_pos_sale_return_preview_v6(p_sale_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $function$
  select public.get_pos_sale_return_preview_v7(p_sale_id);
$function$;

create or replace function public.create_pos_sale_return_v6(p_request_id uuid,p_sale_id uuid,p_device_id uuid,p_device_token text,p_items jsonb,p_reason text default null)
returns jsonb language sql security definer set search_path=''
as $function$
  select public.create_pos_sale_return_v7(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason);
$function$;

revoke all on function public.create_pos_sale_v6(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v6(uuid,uuid,jsonb) to authenticated;
revoke all on function public.create_pos_sale_v7(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v7(uuid,uuid,jsonb) to authenticated;
revoke all on function public.get_pos_sale_return_preview_v6(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v6(uuid) to authenticated;
revoke all on function public.get_pos_sale_return_preview_v7(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v7(uuid) to authenticated;
revoke all on function public.create_pos_sale_return_v6(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_pos_sale_return_v6(uuid,uuid,uuid,text,jsonb,text) to authenticated;