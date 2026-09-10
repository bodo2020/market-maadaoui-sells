create or replace function public.create_pos_sale_v4(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_result jsonb; v_sale public.sales%rowtype; v_employee_id uuid;
  v_credit numeric(12,2):=0; v_base_due numeric(12,2):=0; v_paid numeric(12,2):=0; v_points bigint:=0;
  v_credit_parts integer:=0; v_total_parts integer:=0; v_wallet private.hr_employee_wallet_accounts%rowtype;
  v_breakdown jsonb:='[]'::jsonb; v_employee_name text; v_employee_code text; v_replayed boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_employee_id:=nullif(p_sale->>'employee_id','')::uuid; exception when others then raise exception using errcode='22023',message='INVALID_EMPLOYEE'; end;
  v_result:=public.create_pos_sale_v3(p_request_id,p_branch_id,p_sale);
  v_replayed:=coalesce((v_result->>'request_replayed')::boolean,false);
  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.id is null then raise exception using errcode='55000',message='SALE_NOT_CONFIRMED'; end if;
  if v_replayed then
    return to_jsonb(v_sale)||jsonb_build_object('sale_version',4,'employee_credit_amount',coalesce(v_sale.employee_credit_amount,0),'employee_paid_amount',coalesce(v_sale.employee_paid_amount,0),'employee_points_earned',coalesce(v_sale.employee_points_earned,0),'payment_breakdown',coalesce(v_sale.payment_breakdown,'[]'::jsonb),'request_replayed',true);
  end if;

  select count(*)::int,count(*) filter(where p.method_code_snapshot='employee_credit')::int,
         coalesce(sum(p.base_amount) filter(where p.method_code_snapshot='employee_credit'),0)
  into v_total_parts,v_credit_parts,v_credit from private.pos_sale_payment_parts_v3 p where p.sale_id=v_sale.id;
  v_base_due:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0);
  if v_credit>0 and v_employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_REQUIRED_FOR_CREDIT'; end if;
  if v_credit>0 and (v_credit_parts<>1 or v_total_parts<>1 or abs(v_credit-v_base_due)>0.009) then raise exception using errcode='22023',message='EMPLOYEE_CREDIT_MUST_BE_FULL_PAYMENT'; end if;

  if v_employee_id is not null then
    select u.name,ep.employee_code into v_employee_name,v_employee_code from public.users u left join private.hr_employee_profiles ep on ep.user_id=u.id where u.id=v_employee_id and coalesce(u.active,true);
    if v_employee_name is null then raise exception using errcode='22023',message='EMPLOYEE_NOT_FOUND'; end if;
    if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_employee_id and ubr.branch_id=p_branch_id and ubr.active)
       and not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_employee_id and ep.primary_branch_id=p_branch_id) then raise exception using errcode='22023',message='EMPLOYEE_BRANCH_MISMATCH'; end if;
    insert into private.hr_employee_wallet_accounts(employee_id,branch_id) values(v_employee_id,p_branch_id)
    on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);
    select * into v_wallet from private.hr_employee_wallet_accounts where employee_id=v_employee_id for update;
    if not v_wallet.active then raise exception using errcode='23514',message='EMPLOYEE_CREDIT_INACTIVE'; end if;
    if v_credit>greatest(v_wallet.credit_limit-v_wallet.receivable_balance,0)+0.009 then raise exception using errcode='23514',message='CREDIT_LIMIT_EXCEEDED'; end if;
  end if;

  select coalesce(jsonb_agg(
    case when x.elem->>'code'='employee_credit' then
      jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(x.elem,'{method_type}','"employee_credit"'::jsonb,true),'{charged_amount}','0'::jsonb,true),'{estimated_net_settlement}','0'::jsonb,true),'{fee_amount}','0'::jsonb,true),'{customer_fee_amount}','0'::jsonb,true),'{merchant_fee_amount}','0'::jsonb,true)
    else x.elem end order by x.ord),'[]'::jsonb) into v_breakdown
  from jsonb_array_elements(coalesce(v_sale.payment_breakdown,'[]'::jsonb)) with ordinality x(elem,ord);

  if v_credit>0 then
    delete from public.pos_sale_payments where sale_id=v_sale.id and payment_method_id in (select id from public.pos_payment_methods where branch_id=p_branch_id and code='employee_credit');
    delete from private.pos_sale_payment_parts_v3 where sale_id=v_sale.id and method_code_snapshot='employee_credit';
  end if;

  v_paid:=greatest(round(v_base_due-v_credit,2),0);
  if v_employee_id is not null then v_points:=floor(v_paid*5)::bigint; end if;
  update public.sales set employee_id=v_employee_id,employee_credit_amount=v_credit,employee_paid_amount=v_paid,employee_points_earned=v_points,
    cash_amount=case when v_credit>0 then 0 else cash_amount end,card_amount=case when v_credit>0 then 0 else card_amount end,digital_wallet_amount=case when v_credit>0 then 0 else digital_wallet_amount end,
    payment_method=case when v_credit>0 then 'mixed' else payment_method end,payment_method_code=case when v_credit>0 then 'employee_credit' else payment_method_code end,
    payment_method_name=case when v_credit>0 then 'آجل موظف' else payment_method_name end,payment_reference=case when v_credit>0 then null else payment_reference end,
    amount_charged=case when v_credit>0 then 0 else amount_charged end,payment_fee_amount=case when v_credit>0 then 0 else payment_fee_amount end,
    customer_payment_fee_amount=case when v_credit>0 then 0 else customer_payment_fee_amount end,merchant_payment_fee_amount=case when v_credit>0 then 0 else merchant_payment_fee_amount end,
    payment_fee_bearer=case when v_credit>0 then null else payment_fee_bearer end,net_profit_after_payment_fee=case when v_credit>0 then profit else net_profit_after_payment_fee end,
    payment_breakdown=v_breakdown
  where id=v_sale.id returning * into v_sale;

  if v_employee_id is not null and v_credit>0 then
    perform public.charge_employee_wallet_purchase_v1(v_employee_id,p_branch_id,v_credit,'credit','sale',v_sale.id,'employee-credit-sale:'||v_sale.id::text,'شراء آجل - فاتورة '||v_sale.invoice_number);
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
    values('staff',v_employee_id,p_branch_id,'employee_credit_sale','finance','normal','تم تسجيل عملية شراء آجل','تم تسجيل فاتورة '||v_sale.invoice_number||' بقيمة '||to_char(v_credit,'FM999999990.00')||' ج.م على حسابك الآجل.','pos_sale',v_sale.id,'/my-hr','عرض حسابي',false,'employee-credit-sale:'||v_sale.id::text,array['in_app'],jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'credit_amount',v_credit))
    on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;
  if v_employee_id is not null and v_points>0 and not exists(select 1 from private.hr_employee_wallet_ledger where idempotency_key='employee-points-sale:'||v_sale.id::text) then
    update private.hr_employee_wallet_accounts set points_balance=points_balance+v_points,lifetime_points_earned=lifetime_points_earned+v_points,updated_at=now() where employee_id=v_employee_id;
    insert into private.hr_employee_wallet_ledger(employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id)
    values(v_employee_id,p_branch_id,'points_earn',0,0,v_points,v_paid,'sale',v_sale.id,'employee-points-sale:'||v_sale.id::text,'نقاط مشتريات مدفوعة - فاتورة '||v_sale.invoice_number,jsonb_build_object('points_per_egp',5,'paid_amount',v_paid),v_uid);
  end if;

  update public.pos_invoices set employee_id=v_employee_id,employee_name=v_employee_name,employee_code=v_employee_code,employee_credit_amount=v_credit,employee_paid_amount=v_paid,employee_points_earned=v_points,
    cash_amount=v_sale.cash_amount,card_amount=v_sale.card_amount,digital_wallet_amount=v_sale.digital_wallet_amount,payment_method=v_sale.payment_method,payment_method_code=v_sale.payment_method_code,
    payment_method_name=v_sale.payment_method_name,payment_fee_amount=v_sale.payment_fee_amount,payment_fee_bearer=v_sale.payment_fee_bearer,
    customer_payment_fee_amount=v_sale.customer_payment_fee_amount,merchant_payment_fee_amount=v_sale.merchant_payment_fee_amount,amount_charged=v_sale.amount_charged,
    net_profit_after_payment_fee=v_sale.net_profit_after_payment_fee,payment_reference=v_sale.payment_reference,payment_breakdown=v_breakdown
  where sale_id=v_sale.id;
  return to_jsonb(v_sale)||jsonb_build_object('sale_version',4,'employee_name',v_employee_name,'employee_code',v_employee_code,'employee_credit_amount',v_credit,'employee_paid_amount',v_paid,'employee_points_earned',v_points,'payment_breakdown',v_breakdown,'request_replayed',false);
end;$$;
