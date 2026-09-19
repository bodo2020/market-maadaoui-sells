-- M15f — narrow checkout-total guard for shortage financial adjustments.
CREATE OR REPLACE FUNCTION private.apply_order_shortage_financial_v1(p_item_id uuid, p_shortage_quantity numeric, p_actor uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_i private.order_fulfillment_items_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_a private.order_shortage_financial_adjustments_v1%rowtype;
  v_unit numeric(14,2);
  v_amount numeric(14,2);
  v_before numeric(14,2);
  v_target numeric(14,2);
  v_auto_apply boolean:=false;
  v_state text;
  v_task_id uuid;
  v_financial_recorded boolean:=false;
  v_cash_recorded boolean:=false;
begin
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id for update;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_order from public.online_orders where id=v_i.order_id for update;
  if v_order.id is null then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if p_shortage_quantity is null or p_shortage_quantity<=0 then raise exception using errcode='22023',message='INVALID_SHORTAGE_QUANTITY'; end if;

  begin
    v_unit:=round(coalesce(nullif(v_i.metadata#>>'{snapshot,price}','')::numeric,0),2);
  exception when others then
    v_unit:=0;
  end;
  if v_unit<=0 then
    begin
      v_unit:=round(coalesce(nullif(v_i.metadata#>>'{snapshot,total}','')::numeric / nullif(nullif(v_i.metadata#>>'{snapshot,quantity}','')::numeric,0),0),2);
    exception when others then
      v_unit:=0;
    end;
  end if;
  if v_unit<0 then v_unit:=0; end if;
  v_amount:=round(v_unit*p_shortage_quantity,2);
  v_before:=round(coalesce(v_order.total,0),2);
  v_target:=greatest(0,round(v_before-v_amount,2));

  select coalesce(r.financial_recorded,false),coalesce(r.cash_recorded,false)
    into v_financial_recorded,v_cash_recorded
  from private.online_order_receipts r where r.order_id=v_order.id;
  v_financial_recorded:=coalesce(v_financial_recorded,false);
  v_cash_recorded:=coalesce(v_cash_recorded,false);

  if v_amount<0.005 then
    v_state:='not_required';
    insert into private.order_shortage_financial_adjustments_v1(
      item_id,order_id,branch_id,shortage_quantity,original_unit_price,signed_amount,payment_method_snapshot,payment_status_snapshot,
      order_total_before,target_order_total,order_total_after,settlement_state,created_by,note,metadata
    ) values(v_i.id,v_order.id,v_order.branch_id,p_shortage_quantity,v_unit,0,v_order.payment_method,v_order.payment_status::text,
      v_before,v_before,v_before,v_state,p_actor,coalesce(nullif(trim(coalesce(p_note,'')),''),'لا يوجد سعر صالح للكمية الناقصة'),
      jsonb_build_object('line_no',v_i.line_no,'product_name',v_i.product_name)) returning * into v_a;
  else
    v_auto_apply:=v_order.status::text not in ('delivered','cancelled')
      and not v_financial_recorded and not v_cash_recorded
      and (v_order.payment_method='cash' or v_order.payment_status::text not in ('paid','refunded'));
    if v_auto_apply then
      perform set_config('app.shortage_financial_write',v_order.id::text,true);
      update public.online_orders set total=v_target,updated_at=now() where id=v_order.id;
      perform set_config('app.shortage_financial_write','',true);
      v_state:='applied_to_order_total';
      insert into private.order_shortage_financial_adjustments_v1(
        item_id,order_id,branch_id,shortage_quantity,original_unit_price,signed_amount,payment_method_snapshot,payment_status_snapshot,
        order_total_before,target_order_total,order_total_after,settlement_state,created_by,settled_by,settled_at,note,metadata
      ) values(v_i.id,v_order.id,v_order.branch_id,p_shortage_quantity,v_unit,-v_amount,v_order.payment_method,v_order.payment_status::text,
        v_before,v_target,v_target,v_state,p_actor,p_actor,now(),coalesce(nullif(trim(coalesce(p_note,'')),''),'تم خصم قيمة النقص قبل التحصيل'),
        jsonb_build_object('line_no',v_i.line_no,'product_name',v_i.product_name)) returning * into v_a;
    else
      v_state:='pending_refund';
      insert into private.order_shortage_financial_adjustments_v1(
        item_id,order_id,branch_id,shortage_quantity,original_unit_price,signed_amount,payment_method_snapshot,payment_status_snapshot,
        order_total_before,target_order_total,order_total_after,settlement_state,created_by,note,metadata
      ) values(v_i.id,v_order.id,v_order.branch_id,p_shortage_quantity,v_unit,-v_amount,v_order.payment_method,v_order.payment_status::text,
        v_before,v_target,v_before,v_state,p_actor,coalesce(nullif(trim(coalesce(p_note,'')),''),'مطلوب رد قيمة الصنف الناقص بعد تسجيل الدفعة الأصلية'),
        jsonb_build_object('line_no',v_i.line_no,'product_name',v_i.product_name)) returning * into v_a;

      insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,order_id,payment_method_code,amount,priority,status,title,description,due_at,metadata,created_by)
      values(v_order.branch_id,'financial_review','order_shortage_financial_adjustment',v_a.id,v_order.id,v_order.payment_method,v_amount,'high','open',
        'رد قيمة نقص في طلب','الصنف: '||v_i.product_name||' · الكمية الناقصة '||trim(to_char(p_shortage_quantity,'FM999999990.###'))||' · المبلغ '||trim(to_char(v_amount,'FM999999990.00'))||' ج.م',
        now()+interval '30 minutes',jsonb_build_object('item_id',v_i.id,'product_name',v_i.product_name,'shortage_quantity',p_shortage_quantity,'unit_price',v_unit,'signed_amount',-v_amount,'payment_method',v_order.payment_method,'payment_status',v_order.payment_status::text,'order_total_before',v_before,'target_order_total',v_target),p_actor)
      on conflict(task_type,source_kind,source_id) do update set updated_at=now()
      returning id into v_task_id;

      update private.order_shortage_financial_adjustments_v1 set operations_task_id=v_task_id,updated_at=now() where id=v_a.id returning * into v_a;
      insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task_id,'created',p_actor,'تم إنشاء مهمة رد قيمة الصنف الناقص');
    end if;
  end if;

  return jsonb_build_object('id',v_a.id,'item_id',v_a.item_id,'signed_amount',v_a.signed_amount,'settlement_state',v_a.settlement_state,'order_total_before',v_a.order_total_before,'target_order_total',v_a.target_order_total,'order_total_after',v_a.order_total_after,'operations_task_id',v_a.operations_task_id,'shortage_quantity',v_a.shortage_quantity,'original_unit_price',v_a.original_unit_price);
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_checkout_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  inventory_branch uuid;
  v_customer_user uuid;
  v_combined_context text:=nullif(current_setting('app.combined_checkout_write',true),'');
  v_delivery_assignment_context text:=nullif(current_setting('app.delivery_assignment_write',true),'');
  v_delivery_assignment_actor text:=nullif(current_setting('app.delivery_assignment_actor',true),'');
  v_auto_confirm_context text:=nullif(current_setting('app.checkout_auto_confirm_write',true),'');
  v_substitution_finance_context text:=nullif(current_setting('app.substitution_financial_write',true),'');
  v_shortage_finance_context text:=nullif(current_setting('app.shortage_financial_write',true),'');
begin
  if old.checkout_version is distinct from 1 then return coalesce(new,old); end if;

  if tg_op='DELETE' then
    if auth.uid() is null or not (public.staff_has_permission('online_orders.manage',old.branch_id) or private.staff_is_super_admin(auth.uid())) then
      raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
    end if;
    raise exception using errcode='22023',message='CANCEL_ORDER_INSTEAD';
  end if;

  if tg_op='UPDATE'
     and v_auto_confirm_context=new.id::text
     and old.status::text='pending'
     and new.status::text='confirmed'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from
         (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if tg_op='UPDATE' and v_combined_context is not null then
    if old.status::text='pending'
       and new.status::text='confirmed'
       and (to_jsonb(new)-array['status','updated_at']) is not distinct from
           (to_jsonb(old)-array['status','updated_at']) then
      return new;
    end if;

    if new.order_group_id::text=v_combined_context
       and (old.order_group_id is null or old.order_group_id is not distinct from new.order_group_id)
       and (to_jsonb(new)-array['order_group_id','shipping_cost','total','shipping_snapshot','updated_at']) is not distinct from
           (to_jsonb(old)-array['order_group_id','shipping_cost','total','shipping_snapshot','updated_at']) then
      return new;
    end if;
  end if;

  if tg_op='UPDATE'
     and v_delivery_assignment_context is not null
     and (to_jsonb(new)-array['delivery_person','updated_at']) is not distinct from
         (to_jsonb(old)-array['delivery_person','updated_at'])
     and (
       (
         auth.uid() is not null
         and (
           private.staff_is_super_admin(auth.uid())
           or public.staff_has_permission('delivery.manage',v_delivery_assignment_context::uuid)
           or public.staff_has_permission('online_orders.manage',v_delivery_assignment_context::uuid)
         )
       )
       or (
         v_delivery_assignment_actor is not null
         and private.delivery_assignment_actor_allowed_v2(
           v_delivery_assignment_actor::uuid,
           v_delivery_assignment_context::uuid
         )
       )
     )
  then
    return new;
  end if;

  if tg_op='UPDATE'
     and (to_jsonb(new)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at']) is not distinct from (to_jsonb(old)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at'])
     and new.loyalty_voucher_id is not null and coalesce(new.loyalty_voucher_amount,0)>0 then
    select c.user_id into v_customer_user from public.customers c where c.id=new.customer_id;
    if v_customer_user=auth.uid() and exists(
      select 1 from public.loyalty_voucher_usages u
      where u.source_type='online_order' and u.source_id=new.id and u.customer_id=new.customer_id
        and u.voucher_id=new.loyalty_voucher_id and abs(u.amount_egp-coalesce(new.loyalty_voucher_amount,0))<0.009 and u.reversed_at is null
    ) then return new; end if;
  end if;

  if tg_op='UPDATE' and new.delivery_person is null and old.delivery_person is not null
     and (to_jsonb(new)-array['delivery_person','updated_at']) is not distinct from (to_jsonb(old)-array['delivery_person','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='assigned') then
    return new;
  end if;

  if tg_op='UPDATE' and new.status::text='shipped' and old.status::text<>'delivered'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='on_the_way' and a.departed_at is not null) then
    return new;
  end if;

  if tg_op='UPDATE' and new.status::text='delivered'
     and (to_jsonb(new)-array['status','payment_status','updated_at']) is not distinct from (to_jsonb(old)-array['status','payment_status','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='delivered' and a.delivered_at is not null) then
    return new;
  end if;

  if tg_op='UPDATE'
     and (
       v_substitution_finance_context=new.id::text
       or v_shortage_finance_context=new.id::text
     )
     and (to_jsonb(new)-array['total','updated_at']) is not distinct from
         (to_jsonb(old)-array['total','updated_at']) then
    return new;
  end if;

  if tg_op='UPDATE' and old.branch_id is not null
     and public.staff_has_permission('online_orders.intake',old.branch_id)
     and old.status::text='pending' and new.status::text='confirmed'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if tg_op='UPDATE' and old.branch_id is not null
     and public.staff_has_permission('online_orders.prepare',old.branch_id)
     and ((old.status::text='confirmed' and new.status::text='preparing') or (old.status::text='preparing' and new.status::text='ready'))
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if auth.uid() is null or not (public.staff_has_permission('online_orders.manage',old.branch_id) or private.staff_is_super_admin(auth.uid())) then
    raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
  end if;

  if (to_jsonb(new)-array['status','payment_status','notes','delivery_person','updated_at','return_status']) is distinct from (to_jsonb(old)-array['status','payment_status','notes','delivery_person','updated_at','return_status']) then
    raise exception using errcode='22023',message='CHECKOUT_ORDER_IMMUTABLE';
  end if;

  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception using errcode='22023',message='CANCELLED_ORDER_FINAL';
  end if;

  if new.status='cancelled' and old.status<>'cancelled' then
    if old.status in ('shipped','delivered') then
      raise exception using errcode='22023',message='USE_RETURN_PROCESS';
    end if;
    if coalesce(old.inventory_reservation_version,0)=1 then
      new.stock_released_at:=coalesce(old.stock_released_at,now());
    else
      for x in select value from jsonb_array_elements(old.stock_deductions) order by value->>'branch_id',value->>'product_id' loop
        inventory_branch:=coalesce((x->>'branch_id')::uuid,old.branch_id);
        update public.inventory set quantity=quantity+(x->>'quantity')::numeric
        where branch_id=inventory_branch and product_id=(x->>'product_id')::uuid;
        if not found then raise exception using errcode='22023',message='STOCK_ROW_MISSING'; end if;
      end loop;
      new.stock_released_at:=now();
    end if;
  end if;

  return new;
end
$function$;
