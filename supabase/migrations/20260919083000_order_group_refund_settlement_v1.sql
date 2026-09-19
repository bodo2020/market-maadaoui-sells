create or replace function public.get_order_group_financial_adjustment_v1(p_adjustment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_a private.order_group_financial_adjustments_v1%rowtype;
  v_group private.order_groups_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;

  select * into v_a
  from private.order_group_financial_adjustments_v1
  where id=p_adjustment_id;

  if v_a.id is null then
    raise exception using errcode='22023',message='ORDER_GROUP_FINANCIAL_ADJUSTMENT_NOT_FOUND';
  end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('online_money.settle_digital',v_a.branch_id)
    or public.staff_has_permission('finance.manage',v_a.branch_id)
  ) then
    raise exception using errcode='42501',message='ORDER_GROUP_FINANCE_ACCESS_DENIED';
  end if;

  select * into v_group from private.order_groups_v1 where id=v_a.group_id;

  return jsonb_build_object(
    'id',v_a.id,
    'group_id',v_a.group_id,
    'branch_id',v_a.branch_id,
    'direction',v_a.direction,
    'signed_amount',v_a.signed_amount,
    'amount',abs(v_a.signed_amount),
    'payment_method',v_a.payment_method_snapshot,
    'payment_status',v_a.payment_status_snapshot,
    'group_total_before',v_a.group_total_before,
    'group_total_after',v_a.group_total_after,
    'settlement_state',v_a.settlement_state,
    'operations_task_id',v_a.operations_task_id,
    'payment_ledger_id',v_a.payment_ledger_id,
    'provider_reference',v_a.provider_reference,
    'note',v_a.note,
    'created_at',v_a.created_at,
    'settled_at',v_a.settled_at,
    'group_status',v_group.status
  );
end;
$function$;

revoke all on function public.get_order_group_financial_adjustment_v1(uuid) from public, anon;
grant execute on function public.get_order_group_financial_adjustment_v1(uuid) to authenticated;

create or replace function public.settle_order_group_financial_adjustment_v1(
  p_adjustment_id uuid,
  p_provider_reference text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ref text:=trim(coalesce(p_provider_reference,''));
  v_note text:=trim(coalesce(p_note,''));
  v_a private.order_group_financial_adjustments_v1%rowtype;
  v_group private.order_groups_v1%rowtype;
  v_account uuid;
  v_ledger_id uuid;
  v_order_id uuid;
  v_customer_uid uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if length(v_ref)<3 or length(v_ref)>160 then
    raise exception using errcode='22023',message='ORDER_GROUP_REFUND_REFERENCE_REQUIRED';
  end if;
  if length(v_note)<3 then
    raise exception using errcode='22023',message='ORDER_GROUP_REFUND_NOTE_REQUIRED';
  end if;

  select * into v_a
  from private.order_group_financial_adjustments_v1
  where id=p_adjustment_id
  for update;

  if v_a.id is null then
    raise exception using errcode='22023',message='ORDER_GROUP_FINANCIAL_ADJUSTMENT_NOT_FOUND';
  end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('online_money.settle_digital',v_a.branch_id)
    or public.staff_has_permission('finance.manage',v_a.branch_id)
  ) then
    raise exception using errcode='42501',message='ORDER_GROUP_FINANCE_ACCESS_DENIED';
  end if;

  if v_a.settlement_state='settled' then
    return jsonb_build_object(
      'ok',true,'idempotent',true,'id',v_a.id,'group_id',v_a.group_id,
      'settlement_state','settled','payment_ledger_id',v_a.payment_ledger_id,
      'provider_reference',v_a.provider_reference
    );
  end if;

  if v_a.settlement_state<>'pending_refund' or v_a.signed_amount>=0 then
    raise exception using errcode='55000',message='ORDER_GROUP_REFUND_NOT_PENDING';
  end if;

  select * into v_group
  from private.order_groups_v1
  where id=v_a.group_id
  for update;

  if v_group.id is null then
    raise exception using errcode='22023',message='ORDER_GROUP_NOT_FOUND';
  end if;

  select go.order_id into v_order_id
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  where go.group_id=v_group.id
  order by
    case when o.status::text<>'cancelled' then 0 else 1 end,
    coalesce(go.pickup_sequence,999),
    go.created_at
  limit 1;

  v_account:=private.ensure_payment_account(
    v_a.branch_id,
    'gateway_clearing',
    coalesce(v_a.payment_method_snapshot,'wallet')
  );

  insert into public.payment_ledger(
    account_id,branch_id,order_id,entry_type,signed_amount,payment_method,
    external_reference,description,created_by,metadata
  ) values(
    v_account,v_a.branch_id,v_order_id,'online_payment_adjustment',
    v_a.signed_amount,v_a.payment_method_snapshot,v_ref,
    'رد فرق إلغاء متجر من الطلب المجمّع #'||v_group.id::text,
    v_uid,
    jsonb_build_object(
      'order_group_financial_adjustment_id',v_a.id,
      'order_group_id',v_group.id,
      'reprice_request_id',v_a.reprice_request_id,
      'provider_reference',v_ref,
      'direction','refund'
    )
  )
  returning id into v_ledger_id;

  update private.order_group_financial_adjustments_v1
  set settlement_state='settled',
      payment_ledger_id=v_ledger_id,
      provider_reference=v_ref,
      note=v_note,
      settled_by=v_uid,
      settled_at=now(),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'settled_provider_reference',v_ref,
        'settled_note',v_note
      )
  where id=v_a.id
  returning * into v_a;

  if v_a.operations_task_id is not null then
    update public.operations_tasks
    set status='completed',
        claimed_by=coalesce(claimed_by,v_uid),
        claimed_at=coalesce(claimed_at,now()),
        started_at=coalesce(started_at,now()),
        completed_by=v_uid,
        completed_at=now(),
        provider_reference=v_ref,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'decision','settled',
          'provider_reference',v_ref,
          'resolution_note',v_note,
          'payment_ledger_id',v_ledger_id
        ),
        updated_at=now()
    where id=v_a.operations_task_id;

    insert into public.operations_task_events(task_id,event_type,actor_id,note)
    values(v_a.operations_task_id,'completed',v_uid,'تم رد فرق الطلب المجمّع: '||v_note);
  end if;

  update private.order_groups_v1
  set payment_status=case
        when total<=0.005 and payment_status='paid' then 'refunded'
        else payment_status
      end,
      metadata=jsonb_set(
        coalesce(metadata,'{}'::jsonb),
        '{refund}',
        jsonb_build_object(
          'status','settled',
          'adjustment_id',v_a.id,
          'amount',abs(v_a.signed_amount),
          'provider_reference',v_ref,
          'settled_at',now()
        ),
        true
      ),
      updated_at=now()
  where id=v_group.id;

  select c.user_id into v_customer_uid
  from public.customers c
  where c.id=v_group.customer_id;

  if v_customer_uid is not null then
    insert into public.customer_notifications(
      user_id,order_id,kind,status,title,body,dedupe_key
    ) values(
      v_customer_uid,v_order_id,'order_status','active',
      'تم رد فرق الطلب',
      trim(to_char(abs(v_a.signed_amount),'FM999999990.00'))||
        ' ج.م تم ردها بعد تعديل طلبك المجمّع. مرجع العملية: '||v_ref,
      'order-group-refund-settled:'||v_a.id::text
    )
    on conflict(dedupe_key) do nothing;
  end if;

  insert into public.delivery_realtime_signals_v1(
    branch_id,recipient_user_id,event_type,entity_id
  ) values(v_group.hub_branch_id,null,'group_refund_settled',v_group.id);

  return jsonb_build_object(
    'ok',true,
    'id',v_a.id,
    'group_id',v_group.id,
    'settlement_state','settled',
    'signed_amount',v_a.signed_amount,
    'amount',abs(v_a.signed_amount),
    'payment_ledger_id',v_ledger_id,
    'provider_reference',v_ref
  );
end;
$function$;

revoke all on function public.settle_order_group_financial_adjustment_v1(uuid,text,text)
  from public, anon;
grant execute on function public.settle_order_group_financial_adjustment_v1(uuid,text,text)
  to authenticated;
