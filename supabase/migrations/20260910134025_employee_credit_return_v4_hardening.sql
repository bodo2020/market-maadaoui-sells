create or replace function public.create_pos_sale_return_v4(
  p_request_id uuid,
  p_sale_id uuid,
  p_device_id uuid,
  p_device_token text,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_return public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_account private.hr_employee_wallet_accounts%rowtype;
  v_credit_refund numeric(12,2):=0;
  v_prev_reversed bigint:=0;
  v_target_reversed bigint:=0;
  v_points_delta bigint:=0;
  v_total_returned numeric(12,2):=0;
  v_credit_key text;
begin
  v_result:=public.create_pos_sale_return_v3(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason);
  select * into v_sale from public.sales where id=p_sale_id for update;
  select * into v_return from public.returns where id=nullif(v_result->>'id','')::uuid for update;
  if v_sale.id is null or v_return.id is null then raise exception using errcode='55000',message='RETURN_NOT_CONFIRMED'; end if;

  if coalesce(v_sale.employee_credit_amount,0)>0 then
    v_credit_refund:=round(v_return.total_amount,2);
    v_credit_key:='employee-credit-return:'||v_return.id::text;

    if not exists(select 1 from private.hr_employee_wallet_ledger where idempotency_key=v_credit_key) then
      select * into v_account from private.hr_employee_wallet_accounts where employee_id=v_sale.employee_id for update;
      if v_account.employee_id is null then raise exception using errcode='55000',message='EMPLOYEE_WALLET_NOT_FOUND'; end if;
      if v_account.receivable_balance+0.009<v_credit_refund then raise exception using errcode='23514',message='EMPLOYEE_CREDIT_ALREADY_SETTLED'; end if;

      update private.hr_employee_wallet_accounts
      set receivable_balance=greatest(0,round(receivable_balance-v_credit_refund,2)),updated_at=now()
      where employee_id=v_sale.employee_id;

      insert into private.hr_employee_wallet_ledger(
        employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,
        reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id
      ) values(
        v_sale.employee_id,v_sale.branch_id,'refund',0,-v_credit_refund,0,v_credit_refund,
        'return',v_return.id,v_credit_key,'مرتجع من فاتورة آجل '||v_sale.invoice_number,
        jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number),auth.uid()
      );
    end if;

    delete from public.pos_card_refunds where return_id=v_return.id and status='pending';
    delete from private.pos_return_payment_parts_v3 where return_id=v_return.id;

    update public.returns
    set refund_card_amount=0,
        refund_cash_amount=0,
        employee_credit_refund_amount=v_credit_refund,
        refund_method='none',
        refund_status='completed',
        updated_at=now()
    where id=v_return.id
    returning * into v_return;

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata
    ) values(
      'staff',v_sale.employee_id,v_sale.branch_id,'employee_credit_return','finance','info',
      'تم تخفيض رصيد الآجل',
      'تم تسجيل مرتجع بقيمة '||to_char(v_credit_refund,'FM999999990.00')||' ج.م من فاتورة '||v_sale.invoice_number||' وتخفيض المبلغ المستحق عليك.',
      'pos_return',v_return.id,'/my-hr','عرض حسابي',false,v_credit_key,array['in_app'],
      jsonb_build_object('sale_id',v_sale.id,'return_id',v_return.id,'amount',v_credit_refund)
    ) on conflict(recipient_user_id,dedupe_key) do nothing;

  elsif v_sale.employee_id is not null and coalesce(v_sale.employee_points_earned,0)>0 then
    select coalesce(sum(r.total_amount),0) into v_total_returned
    from public.returns r where r.sale_id=v_sale.id and r.status='approved';

    v_target_reversed:=least(v_sale.employee_points_earned,floor(v_total_returned*5)::bigint);
    select coalesce(-sum(l.points_delta),0)::bigint into v_prev_reversed
    from private.hr_employee_wallet_ledger l
    where l.employee_id=v_sale.employee_id
      and l.entry_type='points_reversal'
      and l.metadata->>'sale_id'=v_sale.id::text;

    v_points_delta:=greatest(v_target_reversed-v_prev_reversed,0);
    if v_points_delta>0 and not exists(
      select 1 from private.hr_employee_wallet_ledger where idempotency_key='employee-points-return:'||v_return.id::text
    ) then
      update private.hr_employee_wallet_accounts
      set points_balance=greatest(points_balance-v_points_delta,0),
          lifetime_points_reversed=lifetime_points_reversed+v_points_delta,
          updated_at=now()
      where employee_id=v_sale.employee_id;

      insert into private.hr_employee_wallet_ledger(
        employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,
        reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id
      ) values(
        v_sale.employee_id,v_sale.branch_id,'points_reversal',0,0,-v_points_delta,v_return.total_amount,
        'return',v_return.id,'employee-points-return:'||v_return.id::text,
        'عكس نقاط مرتجع - فاتورة '||v_sale.invoice_number,
        jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number),auth.uid()
      );
    end if;
  end if;

  return to_jsonb(v_return)||jsonb_build_object(
    'return_version',4,
    'employee_credit_refund_amount',v_credit_refund,
    'employee_points_reversed',v_points_delta,
    'refund_breakdown',case when v_credit_refund>0 then jsonb_build_array(jsonb_build_object(
      'code','employee_credit','name','آجل موظف','method_type','employee_credit',
      'base_refund_amount',v_credit_refund,'status','completed'
    )) else coalesce(v_result->'refund_breakdown','[]'::jsonb) end
  );
end;$function$;

create or replace function public.get_pos_sale_return_preview_v4(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_sale public.sales%rowtype;
  v_returned_credit numeric(12,2):=0;
begin
  v_base:=public.get_pos_sale_return_preview_v3(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;

  select coalesce(sum(r.employee_credit_refund_amount),0)
  into v_returned_credit
  from public.returns r
  where r.sale_id=p_sale_id and r.status='approved';

  v_base:=v_base||jsonb_build_object(
    'return_version',4,
    'employee_id',v_sale.employee_id,
    'employee_credit_amount',coalesce(v_sale.employee_credit_amount,0),
    'employee_paid_amount',coalesce(v_sale.employee_paid_amount,0),
    'employee_points_earned',coalesce(v_sale.employee_points_earned,0),
    'returned_employee_credit',round(v_returned_credit,2),
    'remaining_employee_credit',greatest(0,round(coalesce(v_sale.employee_credit_amount,0)-v_returned_credit,2))
  );

  if coalesce(v_sale.employee_credit_amount,0)>0 then
    v_base:=v_base||jsonb_build_object(
      'payment_method_code','employee_credit',
      'payment_method_name','آجل موظف',
      'payment_method_type','employee_credit',
      'amount_paid',0,
      'amount_charged',0,
      'cash_amount',0,
      'card_amount',0,
      'returned_cash',0,
      'returned_card',0,
      'returned_customer_money',0,
      'remaining_customer_paid',0
    );
  end if;
  return v_base;
end;$function$;

revoke all on function public.create_pos_sale_return_v4(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_pos_sale_return_v4(uuid,uuid,uuid,text,jsonb,text) to authenticated,service_role;
revoke all on function public.get_pos_sale_return_preview_v4(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v4(uuid) to authenticated,service_role;
