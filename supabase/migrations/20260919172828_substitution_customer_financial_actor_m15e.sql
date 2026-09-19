-- M15e — keep customer attribution separate from the staff/system financial actor.
CREATE OR REPLACE FUNCTION private.on_order_substitution_resolution_finance_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fin jsonb;
  v_customer_uid uuid;
  v_state text;
  v_delta numeric;
  v_actor uuid;
begin
  if old.status is not distinct from new.status then return new; end if;
  v_actor:=case
    when new.resolution_source='customer' then new.proposed_by
    else coalesce(new.resolved_by,new.proposed_by)
  end;
  if new.status='rejected' then
    update private.order_fulfillment_substitutions_v1
      set financial_state='cancelled',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('financial_settlement_state','cancelled')
      where id=new.id;
    return new;
  end if;
  if new.status<>'approved' then return new; end if;

  v_fin:=private.apply_order_substitution_financial_v1(new.id,v_actor);
  v_state:=coalesce(v_fin->>'settlement_state','pending');
  v_delta:=coalesce((v_fin->>'signed_amount')::numeric,0);

  select c.user_id into v_customer_uid
  from public.online_orders o left join public.customers c on c.id=o.customer_id
  where o.id=new.order_id;

  if v_customer_uid is not null and abs(v_delta)>=0.005 then
    if v_state='applied_to_order_total' then
      insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key)
      values(v_customer_uid,new.order_id,'order_status','active','تم تحديث إجمالي طلبك بعد البديل',
        case when v_delta>0 then 'زاد إجمالي الطلب بمقدار ' else 'انخفض إجمالي الطلب بمقدار ' end||trim(to_char(abs(v_delta),'FM999999990.00'))||' ج.م · الإجمالي الجديد '||trim(to_char((v_fin->>'order_total_after')::numeric,'FM999999990.00'))||' ج.م',
        'order-substitution-total-updated:'||new.id::text)
      on conflict(dedupe_key) do nothing;
    elsif v_state in ('pending_collection','pending_refund') then
      insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key)
      values(v_customer_uid,new.order_id,'order_status','active',
        case when v_state='pending_refund' then 'فرق سعر البديل قيد الرد' else 'فرق سعر البديل يحتاج تسوية' end,
        trim(to_char(abs(v_delta),'FM999999990.00'))||' ج.م · سيتم تأكيد التسوية المالية لك فور تنفيذها.',
        'order-substitution-financial-pending:'||new.id::text)
      on conflict(dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$function$;
