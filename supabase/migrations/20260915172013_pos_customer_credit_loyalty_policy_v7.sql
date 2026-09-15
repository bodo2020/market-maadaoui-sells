create or replace function private.prepare_pos_sale_loyalty()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_settings public.loyalty_settings%rowtype;
  v_customer public.customers%rowtype;
  v_eligible numeric;
  v_defer boolean:=coalesce(current_setting('app.defer_pos_loyalty',true),'0')='1';
begin
  new.source_channel := 'store';
  if new.customer_id is null then
    new.loyalty_points_earned := 0;
    return new;
  end if;
  select * into v_customer from public.customers where id=new.customer_id;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  new.customer_name := v_customer.name;
  new.customer_phone := v_customer.phone;
  perform private.ensure_customer_loyalty_account(new.customer_id);
  if v_defer then
    new.loyalty_points_earned := 0;
    return new;
  end if;
  select * into v_settings from public.loyalty_settings where singleton=true;
  v_eligible:=greatest(coalesce(new.total,0)-coalesce(new.loyalty_voucher_amount,0),0);
  new.loyalty_points_earned := case when coalesce(v_settings.enabled,false)
    then floor(v_eligible*coalesce(v_settings.points_per_egp,0))::bigint else 0 end;
  return new;
end;
$function$;

create or replace function private.post_pos_sale_loyalty()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_value numeric;
  v_defer boolean:=coalesce(current_setting('app.defer_pos_loyalty',true),'0')='1';
begin
  if v_defer then return new; end if;
  if new.customer_id is not null and new.loyalty_points_earned>0
     and (tg_op='INSERT' or old.customer_id is distinct from new.customer_id) then
    v_value:=greatest(coalesce(new.total,0)-coalesce(new.loyalty_voucher_amount,0),0);
    perform private.post_loyalty_entry(new.customer_id,'earn',new.loyalty_points_earned,v_value,'pos_sale',new.id,new.branch_id,new.invoice_number,
      jsonb_build_object('channel','store','sale_total',new.total,'voucher_amount',coalesce(new.loyalty_voucher_amount,0),'eligible_amount',v_value),new.cashier_id);
  end if;
  return new;
end;
$function$;

create or replace function public.create_pos_sale_v7(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
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
      select 1
      from jsonb_array_elements(coalesce(p_sale->'payment_splits','[]'::jsonb)) s
      join public.pos_payment_methods pm
        on pm.id=nullif(s->>'payment_method_id','')::uuid
       and pm.branch_id=p_branch_id
      where pm.code='customer_credit'
        and coalesce((s->>'base_amount')::numeric,0)>0
    ) into v_has_customer_credit;
  end if;
  if v_has_customer_credit then perform set_config('app.defer_pos_loyalty','1',true); end if;
  v_result:=public.create_pos_sale_v6(p_request_id,p_branch_id,p_sale);
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

revoke all on function public.create_pos_sale_v7(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v7(uuid,uuid,jsonb) to authenticated;
comment on function public.create_pos_sale_v7(uuid,uuid,jsonb) is 'POS sale V7: customer-credit principal never earns loyalty points; only amount paid at sale is eligible, and later receivable collections never earn points.';