create or replace function public.create_pos_sale_v6(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_result jsonb;
  v_sale public.sales%rowtype;
  v_replayed boolean:=false;
  v_employee_id uuid;
  v_customer_credit numeric(14,2):=0;
  v_employee_credit numeric(14,2):=0;
  v_credit_total numeric(14,2):=0;
  v_customer_parts integer:=0;
  v_employee_parts integer:=0;
  v_total_parts integer:=0;
  v_base_due numeric(14,2):=0;
  v_paid_base numeric(14,2):=0;
  v_customer public.customers%rowtype;
  v_customer_account private.customer_receivable_accounts_v1%rowtype;
  v_employee_account private.hr_employee_wallet_accounts%rowtype;
  v_customer_charge jsonb;
  v_employee_charge jsonb;
  v_breakdown jsonb:='[]'::jsonb;
  v_cash_charged numeric(14,2):=0;
  v_card_charged numeric(14,2):=0;
  v_wallet_charged numeric(14,2):=0;
  v_total_charged numeric(14,2):=0;
  v_total_fee numeric(14,2):=0;
  v_customer_fee numeric(14,2):=0;
  v_merchant_fee numeric(14,2):=0;
  v_paid_parts integer:=0;
  v_primary_id uuid;
  v_primary_code text;
  v_primary_name text;
  v_primary_type text;
  v_primary_reference text;
  v_payment_method text;
  v_payment_code text;
  v_payment_name text;
  v_payment_type text;
  v_employee_name text;
  v_employee_code text;
  v_employee_points bigint:=0;
  v_old_customer_points bigint:=0;
  v_desired_customer_points bigint:=0;
  v_points_to_reverse bigint:=0;
  v_loyalty_enabled boolean:=false;
  v_points_per_egp numeric:=0;
  v_customer_balance numeric(14,2):=0;
  v_customer_available numeric(14,2):=0;
  v_employee_balance numeric(14,2):=0;
  v_employee_available numeric(14,2):=0;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_employee_id:=nullif(p_sale->>'employee_id','')::uuid; exception when others then raise exception using errcode='22023',message='INVALID_EMPLOYEE'; end;

  v_result:=public.create_pos_sale_v3(p_request_id,p_branch_id,p_sale);
  v_replayed:=coalesce((v_result->>'request_replayed')::boolean,false);
  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.id is null then raise exception using errcode='55000',message='SALE_NOT_CONFIRMED'; end if;
  if v_replayed then
    return to_jsonb(v_sale)||jsonb_build_object(
      'sale_version',6,'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),
      'employee_credit_amount',coalesce(v_sale.employee_credit_amount,0),'employee_paid_amount',coalesce(v_sale.employee_paid_amount,0),
      'employee_points_earned',coalesce(v_sale.employee_points_earned,0),'payment_breakdown',coalesce(v_sale.payment_breakdown,'[]'::jsonb),
      'request_replayed',true
    );
  end if;

  select count(*)::int,
         count(*) filter(where p.method_code_snapshot='customer_credit')::int,
         count(*) filter(where p.method_code_snapshot='employee_credit')::int,
         coalesce(sum(p.base_amount) filter(where p.method_code_snapshot='customer_credit'),0),
         coalesce(sum(p.base_amount) filter(where p.method_code_snapshot='employee_credit'),0)
  into v_total_parts,v_customer_parts,v_employee_parts,v_customer_credit,v_employee_credit
  from private.pos_sale_payment_parts_v3 p where p.sale_id=v_sale.id;

  if v_customer_parts>1 or v_employee_parts>1 then raise exception using errcode='22023',message='DUPLICATE_CREDIT_METHOD'; end if;
  if v_customer_credit>0 and v_employee_credit>0 then raise exception using errcode='22023',message='BUYER_IDENTITY_CONFLICT'; end if;

  v_base_due:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0);
  v_credit_total:=round(v_customer_credit+v_employee_credit,2);
  if v_credit_total>v_base_due+0.009 then raise exception using errcode='23514',message='CREDIT_LIMIT_EXCEEDED'; end if;
  v_paid_base:=greatest(round(v_base_due-v_credit_total,2),0);

  if v_customer_credit>0 then
    if v_sale.customer_id is null then raise exception using errcode='22023',message='CUSTOMER_REQUIRED_FOR_CREDIT'; end if;
    if v_employee_id is not null or v_sale.employee_id is not null then raise exception using errcode='22023',message='BUYER_IDENTITY_CONFLICT'; end if;
    select * into v_customer from public.customers where id=v_sale.customer_id;
    if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
    if v_customer.user_id is null or not exists(select 1 from auth.users au where au.id=v_customer.user_id) then
      raise exception using errcode='22023',message='CUSTOMER_ONLINE_ACCOUNT_REQUIRED';
    end if;
    select * into v_customer_account from private.customer_receivable_accounts_v1
    where branch_id=p_branch_id and customer_id=v_customer.id for update;
    if v_customer_account.customer_id is null or not v_customer_account.active or not v_customer_account.credit_enabled or coalesce(v_customer_account.credit_limit,0)<=0 then
      raise exception using errcode='23514',message='CUSTOMER_CREDIT_INACTIVE';
    end if;
    if v_customer_credit>greatest(v_customer_account.credit_limit-v_customer_account.balance,0)+0.009 then
      raise exception using errcode='23514',message='CUSTOMER_CREDIT_LIMIT_EXCEEDED';
    end if;
  end if;

  if v_employee_id is not null then
    if v_sale.customer_id is not null then raise exception using errcode='22023',message='BUYER_IDENTITY_CONFLICT'; end if;
    select u.name,ep.employee_code into v_employee_name,v_employee_code
    from public.users u left join private.hr_employee_profiles ep on ep.user_id=u.id
    where u.id=v_employee_id and coalesce(u.active,true);
    if v_employee_name is null then raise exception using errcode='22023',message='EMPLOYEE_NOT_FOUND'; end if;
    if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_employee_id and ubr.branch_id=p_branch_id and ubr.active)
       and not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_employee_id and ep.primary_branch_id=p_branch_id) then
      raise exception using errcode='22023',message='EMPLOYEE_BRANCH_MISMATCH';
    end if;
    insert into private.hr_employee_wallet_accounts(employee_id,branch_id) values(v_employee_id,p_branch_id)
    on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);
    select * into v_employee_account from private.hr_employee_wallet_accounts where employee_id=v_employee_id for update;
    if not v_employee_account.active then raise exception using errcode='23514',message='EMPLOYEE_CREDIT_INACTIVE'; end if;
    if v_employee_credit>greatest(v_employee_account.credit_limit-v_employee_account.receivable_balance,0)+0.009 then
      raise exception using errcode='23514',message='CREDIT_LIMIT_EXCEEDED';
    end if;
  elsif v_employee_credit>0 then
    raise exception using errcode='22023',message='EMPLOYEE_REQUIRED_FOR_CREDIT';
  end if;

  select coalesce(jsonb_agg(
    case when x.elem->>'code' in ('customer_credit','employee_credit') then
      x.elem||jsonb_build_object(
        'method_type',case when x.elem->>'code'='customer_credit' then 'customer_credit' else 'employee_credit' end,
        'charged_amount',0,'estimated_net_settlement',0,'fee_amount',0,'customer_fee_amount',0,'merchant_fee_amount',0
      ) else x.elem end order by x.ord
  ),'[]'::jsonb) into v_breakdown
  from jsonb_array_elements(coalesce(v_sale.payment_breakdown,'[]'::jsonb)) with ordinality x(elem,ord);

  select
    coalesce(sum((e->>'charged_amount')::numeric) filter(where e->>'method_type'='cash'),0),
    coalesce(sum((e->>'charged_amount')::numeric) filter(where e->>'method_type'<>'cash' and e->>'code' not in ('customer_credit','employee_credit')),0),
    coalesce(sum((e->>'charged_amount')::numeric) filter(where e->>'method_type'='digital_wallet'),0),
    coalesce(sum((e->>'charged_amount')::numeric),0),
    coalesce(sum((e->>'fee_amount')::numeric),0),
    coalesce(sum((e->>'customer_fee_amount')::numeric),0),
    coalesce(sum((e->>'merchant_fee_amount')::numeric),0),
    count(*) filter(where e->>'code' not in ('customer_credit','employee_credit') and (e->>'base_amount')::numeric>0)::int
  into v_cash_charged,v_card_charged,v_wallet_charged,v_total_charged,v_total_fee,v_customer_fee,v_merchant_fee,v_paid_parts
  from jsonb_array_elements(v_breakdown) e;

  if v_total_parts=1 then
    select nullif(e->>'payment_method_id','')::uuid,e->>'code',e->>'name',e->>'method_type',nullif(e->>'reference','')
    into v_primary_id,v_primary_code,v_primary_name,v_primary_type,v_primary_reference
    from jsonb_array_elements(v_breakdown) e limit 1;
  end if;

  if v_base_due<=0 then
    v_payment_method:='cash'; v_payment_code:='voucher'; v_payment_name:='مغطاة بالكامل بالكوبون'; v_payment_type:='voucher';
  elsif v_total_parts=1 and v_customer_credit>0 then
    v_payment_method:='mixed'; v_payment_code:='customer_credit'; v_payment_name:='آجل عميل'; v_payment_type:='customer_credit';
  elsif v_total_parts=1 and v_employee_credit>0 then
    v_payment_method:='mixed'; v_payment_code:='employee_credit'; v_payment_name:='آجل موظف'; v_payment_type:='employee_credit';
  elsif v_total_parts=1 then
    v_payment_method:=case when v_primary_type='cash' then 'cash' else 'card' end;
    v_payment_code:=v_primary_code; v_payment_name:=v_primary_name; v_payment_type:=v_primary_type;
  else
    v_payment_method:='mixed'; v_payment_code:='mixed'; v_payment_name:='دفع مختلط'; v_payment_type:='mixed';
  end if;

  if v_credit_total>0 then
    delete from public.pos_sale_payments where sale_id=v_sale.id;
    delete from private.pos_sale_payment_parts_v3 where sale_id=v_sale.id and method_code_snapshot in ('customer_credit','employee_credit');
  end if;

  if v_customer_credit>0 then
    v_customer_charge:=private.charge_customer_credit_sale_v1(p_branch_id,v_sale.customer_id,v_sale.id,v_customer_credit,v_sale.invoice_number);
    v_customer_balance:=coalesce((v_customer_charge->>'balance')::numeric,0);
    v_customer_available:=coalesce((v_customer_charge->>'credit_available')::numeric,0);
  elsif v_sale.customer_id is not null then
    select coalesce(a.balance,0),greatest(coalesce(a.credit_limit,0)-coalesce(a.balance,0),0)
    into v_customer_balance,v_customer_available from private.customer_receivable_accounts_v1 a
    where a.branch_id=p_branch_id and a.customer_id=v_sale.customer_id;
  end if;

  if v_employee_id is not null then
    if v_employee_credit>0 then
      v_employee_charge:=public.charge_employee_wallet_purchase_v1(v_employee_id,p_branch_id,v_employee_credit,'credit','sale',v_sale.id,
        'employee-credit-sale:'||v_sale.id::text,'شراء آجل - فاتورة '||v_sale.invoice_number);
      v_employee_balance:=coalesce((v_employee_charge->>'receivable_balance')::numeric,0);
      v_employee_available:=coalesce((v_employee_charge->>'credit_available')::numeric,0);
    else
      v_employee_balance:=coalesce(v_employee_account.receivable_balance,0);
      v_employee_available:=greatest(coalesce(v_employee_account.credit_limit,0)-coalesce(v_employee_account.receivable_balance,0),0);
    end if;
    v_employee_points:=floor(v_paid_base*5)::bigint;
    if v_employee_points>0 and not exists(select 1 from private.hr_employee_wallet_ledger where idempotency_key='employee-points-sale:'||v_sale.id::text) then
      update private.hr_employee_wallet_accounts
      set points_balance=points_balance+v_employee_points,lifetime_points_earned=lifetime_points_earned+v_employee_points,updated_at=now()
      where employee_id=v_employee_id;
      insert into private.hr_employee_wallet_ledger(employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,
        reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id)
      values(v_employee_id,p_branch_id,'points_earn',0,0,v_employee_points,v_paid_base,'sale',v_sale.id,'employee-points-sale:'||v_sale.id::text,
        'نقاط مشتريات مدفوعة - فاتورة '||v_sale.invoice_number,jsonb_build_object('points_per_egp',5,'paid_amount',v_paid_base,'credit_amount',v_employee_credit),v_uid);
    end if;
  end if;

  v_old_customer_points:=coalesce(v_sale.loyalty_points_earned,0);
  if v_sale.customer_id is not null and v_credit_total>0 then
    select coalesce(enabled,false),coalesce(points_per_egp,0) into v_loyalty_enabled,v_points_per_egp
    from public.loyalty_settings where singleton=true;
    v_desired_customer_points:=case when v_loyalty_enabled then floor(v_paid_base*v_points_per_egp)::bigint else 0 end;
    v_points_to_reverse:=greatest(v_old_customer_points-v_desired_customer_points,0);
    if v_points_to_reverse>0 then
      perform private.post_loyalty_entry(v_sale.customer_id,'reversal',-v_points_to_reverse,v_credit_total,'pos_credit_adjustment',v_sale.id,p_branch_id,
        v_sale.invoice_number,jsonb_build_object('reason','credit_not_paid','credit_amount',v_credit_total,'paid_amount',v_paid_base),v_uid);
    end if;
  else
    v_desired_customer_points:=v_old_customer_points;
  end if;

  update public.sales set
    employee_id=v_employee_id,
    employee_credit_amount=v_employee_credit,
    employee_paid_amount=case when v_employee_id is null then 0 else v_paid_base end,
    employee_points_earned=v_employee_points,
    customer_credit_amount=v_customer_credit,
    loyalty_points_earned=v_desired_customer_points,
    cash_amount=round(v_cash_charged,2),card_amount=round(v_card_charged,2),digital_wallet_amount=round(v_wallet_charged,2),
    payment_method=v_payment_method,
    payment_method_id=case when v_total_parts=1 then v_primary_id else null end,
    payment_method_code=v_payment_code,payment_method_name=v_payment_name,
    payment_reference=case when v_total_parts=1 and v_credit_total=0 then v_primary_reference else null end,
    amount_charged=round(v_total_charged,2),payment_fee_amount=round(v_total_fee,2),
    customer_payment_fee_amount=round(v_customer_fee,2),merchant_payment_fee_amount=round(v_merchant_fee,2),
    payment_fee_bearer=case when v_customer_fee>0 and v_merchant_fee>0 then 'mixed' when v_customer_fee>0 then 'customer' when v_merchant_fee>0 then 'business' else null end,
    net_profit_after_payment_fee=round(coalesce(profit,0)-v_merchant_fee,2),payment_breakdown=v_breakdown
  where id=v_sale.id returning * into v_sale;

  update public.pos_invoices set
    customer_id=v_sale.customer_id,customer_name=v_sale.customer_name,customer_phone=v_sale.customer_phone,
    loyalty_points_earned=v_desired_customer_points,
    employee_id=v_employee_id,employee_name=v_employee_name,employee_code=v_employee_code,
    employee_credit_amount=v_employee_credit,employee_paid_amount=case when v_employee_id is null then 0 else v_paid_base end,employee_points_earned=v_employee_points,
    customer_credit_amount=v_customer_credit,
    cash_amount=v_sale.cash_amount,card_amount=v_sale.card_amount,digital_wallet_amount=v_sale.digital_wallet_amount,
    payment_method=v_sale.payment_method,payment_method_id=v_sale.payment_method_id,payment_method_code=v_sale.payment_method_code,
    payment_method_name=v_sale.payment_method_name,payment_method_type=v_payment_type,
    payment_fee_amount=v_sale.payment_fee_amount,payment_fee_bearer=v_sale.payment_fee_bearer,
    customer_payment_fee_amount=v_sale.customer_payment_fee_amount,merchant_payment_fee_amount=v_sale.merchant_payment_fee_amount,
    amount_charged=v_sale.amount_charged,net_profit_after_payment_fee=v_sale.net_profit_after_payment_fee,
    payment_reference=v_sale.payment_reference,payment_breakdown=v_breakdown
  where sale_id=v_sale.id;

  if v_customer_credit>0 and v_customer.user_id is not null then
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
    values('customer',v_customer.user_id,p_branch_id,'customer.credit_sale','customers','normal','تم تسجيل فاتورة آجل',
      'تم تسجيل فاتورة '||v_sale.invoice_number||' بقيمة آجل '||to_char(v_customer_credit,'FM999999990.00')||' ج.م. إجمالي المديونية الحالية '||to_char(v_customer_balance,'FM999999990.00')||' ج.م.',
      'pos_sale',v_sale.id,'/account/debts','عرض المديونية',false,'customer-credit-sale:'||v_sale.id::text,array['in_app','push'],
      jsonb_build_object('delivery_type','transactional','sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'credit_amount',v_customer_credit,
        'paid_amount',v_paid_base,'balance_after',v_customer_balance,'credit_available',v_customer_available))
    on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;

  if v_employee_credit>0 and v_employee_id is not null then
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
    values('staff',v_employee_id,p_branch_id,'employee.credit_sale','finance','normal','تم تسجيل فاتورة آجل',
      'تم تسجيل فاتورة '||v_sale.invoice_number||' بقيمة آجل '||to_char(v_employee_credit,'FM999999990.00')||' ج.م. إجمالي الرصيد المستحق '||to_char(v_employee_balance,'FM999999990.00')||' ج.م.',
      'pos_sale',v_sale.id,'/my-hr','عرض حسابي',false,'employee-credit-sale-v6:'||v_sale.id::text,array['in_app','push'],
      jsonb_build_object('delivery_type','transactional','sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'credit_amount',v_employee_credit,
        'paid_amount',v_paid_base,'balance_after',v_employee_balance,'credit_available',v_employee_available))
    on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;

  return to_jsonb(v_sale)||jsonb_build_object(
    'sale_version',6,'customer_credit_amount',v_customer_credit,'customer_credit_balance',v_customer_balance,'customer_credit_available',v_customer_available,
    'employee_credit_amount',v_employee_credit,'employee_paid_amount',case when v_employee_id is null then 0 else v_paid_base end,
    'employee_credit_balance',v_employee_balance,'employee_credit_available',v_employee_available,'employee_points_earned',v_employee_points,
    'paid_base_amount',v_paid_base,'amount_collected',v_total_charged,'payment_breakdown',v_breakdown,'request_replayed',false
  );
end;
$function$;

revoke all on function public.create_pos_sale_v6(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v6(uuid,uuid,jsonb) to authenticated,service_role;

create or replace function public.get_my_customer_receivables_v2(p_limit integer default 100)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_customer_id uuid; v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select c.id into v_customer_id from public.customers c where c.user_id=v_uid limit 1;
  if v_customer_id is null then return jsonb_build_object('customer_id',null,'total_balance',0,'accounts','[]'::jsonb,'ledger','[]'::jsonb); end if;
  select jsonb_build_object(
    'customer_id',v_customer_id,
    'total_balance',coalesce((select round(sum(a.balance),2) from private.customer_receivable_accounts_v1 a where a.customer_id=v_customer_id and a.active),0),
    'total_credit_limit',coalesce((select round(sum(coalesce(a.credit_limit,0)),2) from private.customer_receivable_accounts_v1 a where a.customer_id=v_customer_id and a.active and a.credit_enabled),0),
    'total_credit_available',coalesce((select round(sum(greatest(coalesce(a.credit_limit,0)-a.balance,0)),2) from private.customer_receivable_accounts_v1 a where a.customer_id=v_customer_id and a.active and a.credit_enabled),0),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('branch_id',a.branch_id,'branch_name',b.name,'balance',a.balance,'credit_enabled',a.credit_enabled,'credit_limit',coalesce(a.credit_limit,0),'credit_available',greatest(coalesce(a.credit_limit,0)-a.balance,0),'updated_at',a.updated_at) order by b.name) from private.customer_receivable_accounts_v1 a join public.branches b on b.id=a.branch_id where a.customer_id=v_customer_id and a.active),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc) from (
      select l.id,l.branch_id,b.name branch_name,l.entry_type,l.signed_amount,l.description,l.reference_kind,l.reference_id,l.created_at,
        sum(l.signed_amount) over(partition by l.branch_id order by l.created_at,l.id rows between unbounded preceding and current row) balance_after,
        case when l.reference_kind='sale' then (select s.invoice_number from public.sales s where s.id=l.reference_id) else null end invoice_number,
        case when l.reference_kind='sale' then (select s.total from public.sales s where s.id=l.reference_id) else null end invoice_total,
        case when l.reference_kind='sale' then (select s.customer_credit_amount from public.sales s where s.id=l.reference_id) else null end credit_amount,
        case when l.reference_kind='sale' then (select greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0)-coalesce(s.customer_credit_amount,0),0) from public.sales s where s.id=l.reference_id) else null end paid_on_sale,
        case when l.reference_kind='pos_receivable_collection' then (select c.payment_breakdown from private.pos_receivable_collections_v2 c where c.id=l.reference_id) else null end payment_breakdown
      from private.customer_receivable_ledger_v1 l join public.branches b on b.id=l.branch_id
      where l.customer_id=v_customer_id order by l.created_at desc,l.id desc limit greatest(1,least(coalesce(p_limit,100),300))
    ) x),'[]'::jsonb),'generated_at',now()) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_my_customer_receivables_v2(integer) from public,anon;
grant execute on function public.get_my_customer_receivables_v2(integer) to authenticated,service_role;

create or replace function public.get_pos_sale_return_preview_v6(p_sale_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_base jsonb; v_sale public.sales%rowtype; v_paid_base numeric;
begin
  v_base:=public.get_pos_sale_return_preview_v5(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  v_paid_base:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-coalesce(v_sale.customer_credit_amount,0)-coalesce(v_sale.employee_credit_amount,0),2),0);
  return v_base||jsonb_build_object('return_version',6,'paid_base_amount',v_paid_base,'partial_credit_sale',(coalesce(v_sale.customer_credit_amount,0)+coalesce(v_sale.employee_credit_amount,0)>0 and v_paid_base>0));
end;
$function$;

create or replace function public.create_pos_sale_return_v6(p_request_id uuid,p_sale_id uuid,p_device_id uuid,p_device_token text,p_items jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_sale public.sales%rowtype; v_paid_base numeric;
begin
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  v_paid_base:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-coalesce(v_sale.customer_credit_amount,0)-coalesce(v_sale.employee_credit_amount,0),2),0);
  if coalesce(v_sale.customer_credit_amount,0)+coalesce(v_sale.employee_credit_amount,0)>0 and v_paid_base>0 then raise exception using errcode='55000',message='PARTIAL_CREDIT_RETURN_REQUIRES_FINANCE'; end if;
  return public.create_pos_sale_return_v5(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason)||jsonb_build_object('return_version',6);
end;
$function$;

revoke all on function public.get_pos_sale_return_preview_v6(uuid) from public,anon;
revoke all on function public.create_pos_sale_return_v6(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v6(uuid) to authenticated,service_role;
grant execute on function public.create_pos_sale_return_v6(uuid,uuid,uuid,text,jsonb,text) to authenticated,service_role;
