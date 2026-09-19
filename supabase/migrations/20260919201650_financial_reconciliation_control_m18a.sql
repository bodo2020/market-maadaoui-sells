-- M18a — financial reconciliation control and reliable online-money posting.

create unique index if not exists payment_ledger_online_order_global_once_v2_idx
on public.payment_ledger(order_id)
where order_id is not null and entry_type='online_payment';

create unique index if not exists cash_ledger_online_order_global_once_v2_idx
on public.cash_ledger(reference_id)
where reference_id is not null
  and reference_type='online_order'
  and entry_type='online_cod_collection';

CREATE OR REPLACE FUNCTION private.post_online_order_money_v2(p_order_id uuid, p_actor uuid, p_source text DEFAULT 'system'::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.online_orders%rowtype;
  v_method text;
  v_payable numeric;
  v_account uuid;
  v_ledger_id uuid;
  v_posted boolean:=false;
  v_kind text;
begin
  select * into v_order
  from public.online_orders
  where id=p_order_id
  for update;

  if v_order.id is null then
    raise exception using errcode='22023',message='ORDER_NOT_FOUND';
  end if;

  if v_order.branch_id is null then
    return jsonb_build_object('ok',false,'reason','BRANCH_MISSING','order_id',p_order_id);
  end if;

  v_method:=lower(trim(coalesce(v_order.payment_method,'')));
  v_payable:=round(greatest(coalesce(v_order.total,0)-coalesce(v_order.loyalty_voucher_amount,0),0),2);

  if v_payable<=0 then
    return jsonb_build_object('ok',true,'posted',false,'reason','ZERO_PAYABLE','order_id',p_order_id,'payable',v_payable);
  end if;

  if v_method in ('cash','كاش','cod') then
    if v_order.payment_status::text<>'paid' or v_order.status::text<>'delivered' then
      return jsonb_build_object('ok',true,'posted',false,'reason','CASH_NOT_COLLECTED_YET','order_id',p_order_id,'payable',v_payable);
    end if;

    v_kind:='cash';
    v_account:=private.ensure_online_collection_account(v_order.branch_id);

    select l.id into v_ledger_id
    from public.cash_ledger l
    where l.reference_type='online_order'
      and l.reference_id=v_order.id
      and l.entry_type='online_cod_collection'
    order by l.created_at
    limit 1;

    if v_ledger_id is null then
      insert into public.cash_ledger(
        account_id,branch_id,user_id,entry_type,signed_amount,
        reference_type,reference_id,description,metadata,created_by
      ) values(
        v_account,v_order.branch_id,p_actor,'online_cod_collection',v_payable,
        'online_order',v_order.id,'تحصيل نقدي طلب أونلاين #'||v_order.id::text,
        jsonb_build_object(
          'source',coalesce(nullif(trim(p_source),''),'system'),
          'note',nullif(trim(coalesce(p_note,'')),''),
          'payment_method',v_method,
          'reconciliation_version',1
        ),
        p_actor
      )
      on conflict do nothing
      returning id into v_ledger_id;

      if v_ledger_id is null then
        select l.id into v_ledger_id
        from public.cash_ledger l
        where l.reference_type='online_order'
          and l.reference_id=v_order.id
          and l.entry_type='online_cod_collection'
        order by l.created_at
        limit 1;
      else
        v_posted:=true;
      end if;
    end if;

    if p_actor is not null then
      insert into private.online_order_receipts(
        order_id,confirmed_by,cash_recorded,financial_recorded,financial_recorded_at
      ) values(
        v_order.id,p_actor,true,true,now()
      )
      on conflict(order_id) do update
      set cash_recorded=true,
          financial_recorded=true,
          financial_recorded_at=coalesce(private.online_order_receipts.financial_recorded_at,now());
    else
      update private.online_order_receipts
      set cash_recorded=true,
          financial_recorded=true,
          financial_recorded_at=coalesce(financial_recorded_at,now())
      where order_id=v_order.id;
    end if;

  elsif v_method in ('wallet','card','bank_transfer') then
    if v_order.payment_status::text<>'paid' then
      return jsonb_build_object('ok',true,'posted',false,'reason','ELECTRONIC_NOT_PAID','order_id',p_order_id,'payable',v_payable);
    end if;

    v_kind:='payment';
    v_account:=private.ensure_payment_account(v_order.branch_id,'gateway_clearing',v_method);

    select l.id into v_ledger_id
    from public.payment_ledger l
    where l.order_id=v_order.id
      and l.entry_type='online_payment'
    order by l.created_at
    limit 1;

    if v_ledger_id is null then
      insert into public.payment_ledger(
        account_id,branch_id,order_id,entry_type,signed_amount,
        payment_method,description,metadata,created_by
      ) values(
        v_account,v_order.branch_id,v_order.id,'online_payment',v_payable,
        v_method,'تحصيل إلكتروني طلب #'||v_order.id::text,
        jsonb_build_object(
          'source',coalesce(nullif(trim(p_source),''),'system'),
          'note',nullif(trim(coalesce(p_note,'')),''),
          'payment_status',v_order.payment_status::text,
          'order_status',v_order.status::text,
          'reconciliation_version',1
        ),
        p_actor
      )
      on conflict do nothing
      returning id into v_ledger_id;

      if v_ledger_id is null then
        select l.id into v_ledger_id
        from public.payment_ledger l
        where l.order_id=v_order.id
          and l.entry_type='online_payment'
        order by l.created_at
        limit 1;
      else
        v_posted:=true;
      end if;
    end if;

    if p_actor is not null then
      insert into private.online_order_receipts(
        order_id,confirmed_by,financial_recorded,financial_recorded_at
      ) values(
        v_order.id,p_actor,true,now()
      )
      on conflict(order_id) do update
      set financial_recorded=true,
          financial_recorded_at=coalesce(private.online_order_receipts.financial_recorded_at,now());
    else
      update private.online_order_receipts
      set financial_recorded=true,
          financial_recorded_at=coalesce(financial_recorded_at,now())
      where order_id=v_order.id;
    end if;
  else
    return jsonb_build_object(
      'ok',true,'posted',false,'reason','UNSUPPORTED_PAYMENT_METHOD',
      'order_id',p_order_id,'payment_method',v_method,'payable',v_payable
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'posted',v_posted,
    'idempotent',not v_posted,
    'order_id',v_order.id,
    'branch_id',v_order.branch_id,
    'ledger_kind',v_kind,
    'ledger_id',v_ledger_id,
    'account_id',v_account,
    'payment_method',v_method,
    'payable',v_payable
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_online_order_money()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_method text:=lower(trim(coalesce(new.payment_method,'')));
  v_should_post boolean:=false;
begin
  if tg_op='INSERT' then
    v_should_post :=
      (
        v_method in ('wallet','card','bank_transfer')
        and new.payment_status::text='paid'
      )
      or
      (
        v_method in ('cash','كاش','cod')
        and new.payment_status::text='paid'
        and new.status::text='delivered'
      );
  else
    if v_method in ('wallet','card','bank_transfer') and new.payment_status::text='paid' then
      v_should_post :=
        old.payment_status is distinct from new.payment_status
        or old.payment_method is distinct from new.payment_method;
    elsif v_method in ('cash','كاش','cod')
       and new.payment_status::text='paid'
       and new.status::text='delivered' then
      v_should_post :=
        old.payment_status is distinct from new.payment_status
        or old.status is distinct from new.status
        or old.payment_method is distinct from new.payment_method;
    end if;
  end if;

  if v_should_post then
    perform private.post_online_order_money_v2(new.id,auth.uid(),'online_order_trigger_v2',null);
  end if;

  return new;
end;
$function$;

drop trigger if exists record_online_order_money on public.online_orders;
create trigger record_online_order_money
after insert or update of status,payment_status,payment_method
on public.online_orders
for each row execute function private.record_online_order_money();

CREATE OR REPLACE FUNCTION public.repair_online_order_financial_ledger_v1(p_order_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;

  select * into v_order
  from public.online_orders
  where id=p_order_id;

  if v_order.id is null then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if v_order.branch_id is null then raise exception using errcode='22023',message='ORDER_BRANCH_MISSING'; end if;

  if v_order.created_at < '2026-09-01 00:00:00+00'::timestamptz
     and not exists(select 1 from private.online_order_receipts rr where rr.order_id=v_order.id) then
    raise exception using errcode='22023',message='FINANCE_RECONCILIATION_LEGACY_ORDER_REVIEW_REQUIRED';
  end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('finance.manage',v_order.branch_id)
  ) then
    raise exception using errcode='42501',message='FINANCE_RECONCILIATION_REPAIR_DENIED';
  end if;

  v_result:=private.post_online_order_money_v2(
    v_order.id,v_uid,'manual_reconciliation_repair',p_note
  );

  return coalesce(v_result,'{}'::jsonb)
    ||jsonb_build_object('repair_requested',true,'repaired_by',v_uid,'repaired_at',now());
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_finance_reconciliation_control_v1(p_branch_id uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_can_manage boolean:=false;
  v_limit integer:=least(greatest(coalesce(p_limit,100),10),250);
  v_all jsonb:='[]'::jsonb;
  v_issues jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
  v_delivery_outstanding numeric:=0;
  v_gateway_balance numeric:=0;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';
  end if;

  v_can_manage:=private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('finance.manage',p_branch_id);

  if not (
    v_can_manage
    or public.staff_has_permission('finance.view',p_branch_id)
  ) then
    raise exception using errcode='42501',message='FINANCE_RECONCILIATION_VIEW_DENIED';
  end if;

  with issues as (
    select
      case when o.status::text='cancelled' then 0 else 1 end severity_rank,
      case when o.status::text='cancelled' then 'critical' else 'high' end severity,
      'online_payment_missing'::text issue_type,
      'online_order'::text source_kind,
      o.id source_id,
      round(greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0),2) amount,
      'دفع أونلاين غير مسجل في الـLedger'::text title,
      case
        when o.status::text='cancelled'
          then 'الطلب مدفوع وملغي ولا يوجد قيد التحصيل الأساسي؛ يلزم إثبات التحصيل ثم مراجعة رد المبلغ.'
        else 'الطلب مدفوع إلكترونيًا لكن لا يوجد له online_payment في Payment Ledger.'
      end description,
      'repair_online_ledger'::text action,
      v_can_manage can_repair,
      coalesce(o.updated_at,o.created_at) occurred_at,
      jsonb_build_object(
        'payment_method',o.payment_method,
        'payment_status',o.payment_status::text,
        'order_status',o.status::text
      ) metadata
    from public.online_orders o
    where o.branch_id=p_branch_id
      and o.payment_status::text='paid'
      and lower(coalesce(o.payment_method,'')) in ('wallet','card','bank_transfer')
      and greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0)>0.005
      and (
        o.created_at >= '2026-09-01 00:00:00+00'::timestamptz
        or exists(select 1 from private.online_order_receipts rr where rr.order_id=o.id)
      )
      and not exists(
        select 1 from public.payment_ledger l
        where l.order_id=o.id and l.entry_type='online_payment'
      )

    union all

    select
      1,'high','online_cash_missing','online_order',o.id,
      round(greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0),2),
      'تحصيل أونلاين نقدي غير مسجل في الـLedger',
      'الطلب مسلم ومدفوع نقدًا لكن لا يوجد online_cod_collection في Cash Ledger.',
      'repair_online_ledger',v_can_manage,coalesce(o.updated_at,o.created_at),
      jsonb_build_object(
        'payment_method',o.payment_method,
        'payment_status',o.payment_status::text,
        'order_status',o.status::text
      )
    from public.online_orders o
    where o.branch_id=p_branch_id
      and o.payment_status::text='paid'
      and o.status::text='delivered'
      and lower(coalesce(o.payment_method,'')) in ('cash','كاش','cod')
      and greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0)>0.005
      and (
        o.created_at >= '2026-09-01 00:00:00+00'::timestamptz
        or exists(select 1 from private.online_order_receipts rr where rr.order_id=o.id)
      )
      and not exists(
        select 1 from public.cash_ledger l
        where l.reference_type='online_order'
          and l.reference_id=o.id
          and l.entry_type='online_cod_collection'
      )

    union all

    select
      0,'critical','paid_cancelled_unrefunded','online_order',o.id,
      round(greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0),2),
      'طلب مدفوع وملغي بدون Refund مسجل',
      'حالة الطلب Cancelled وما زال Paid ولا توجد عملية Refund مرتبطة به.',
      'review_refund',false,coalesce(o.updated_at,o.created_at),
      jsonb_build_object('payment_method',o.payment_method)
    from public.online_orders o
    where o.branch_id=p_branch_id
      and o.status::text='cancelled'
      and o.payment_status::text='paid'
      and greatest(coalesce(o.total,0)-coalesce(o.loyalty_voucher_amount,0),0)>0.005
      and (
        o.created_at >= '2026-09-01 00:00:00+00'::timestamptz
        or exists(select 1 from private.online_order_receipts rr where rr.order_id=o.id)
      )
      and not exists(
        select 1 from public.payment_refunds r
        where r.order_id=o.id
          and r.status in ('pending','confirmed','completed')
      )

    union all

    select
      1,'high','shift_reconciliation_variance','pos_shift',r.shift_id,
      abs(r.variance_amount),
      'فرق في تسوية وردية POS',
      'المبلغ المعدود لا يساوي المتوقع لوسيلة الدفع.',
      'review_shift',false,r.confirmed_at,
      jsonb_build_object(
        'method_code',r.method_code,
        'method_name',r.method_name_snapshot,
        'expected_amount',r.expected_amount,
        'counted_amount',r.counted_amount,
        'variance_reason',r.variance_reason
      )
    from public.pos_shift_payment_reconciliations r
    where r.branch_id=p_branch_id and abs(r.variance_amount)>0.005

    union all

    select
      2,'medium','pos_cash_handoff_pending','pos_shift_handoff',h.id,
      h.expected_handoff_amount,
      'توريد كاشير لم يُستلم بعد',
      'وردية POS أغلقت والمبلغ ما زال بانتظار استلام الخزنة.',
      'review_cash_handoff',false,h.created_at,
      jsonb_build_object(
        'shift_id',h.shift_id,
        'cashier_name',h.cashier_name_snapshot,
        'device_name',h.device_name_snapshot
      )
    from public.pos_shift_cash_handoffs h
    where h.branch_id=p_branch_id and h.status='pending'

    union all

    select
      2,'medium','delivery_cash_handoff_pending','delivery_handoff',h.id,
      h.amount,
      'تحصيل مندوب بانتظار الاستلام',
      'المندوب طلب توريد التحصيل النقدي ولم يُستلم بعد.',
      'review_delivery_handoff',false,h.requested_at,
      jsonb_build_object(
        'driver_user_id',h.driver_user_id,
        'target_shift_id',h.target_shift_id
      )
    from private.delivery_cash_handovers_v1 h
    where h.branch_id=p_branch_id and h.status='pending'

    union all

    select
      case when r.status='failed' then 1 else 2 end,
      case when r.status='failed' then 'high' else 'medium' end,
      'payment_refund_pending','payment_refund',r.id,
      r.amount,
      case when r.status='failed' then 'Refund إلكتروني متعذر' else 'Refund إلكتروني معلق' end,
      'عملية رد مبلغ إلكتروني لم تكتمل.',
      'review_refund',false,r.created_at,
      jsonb_build_object(
        'payment_method',r.payment_method,
        'status',r.status,
        'order_id',r.order_id
      )
    from public.payment_refunds r
    where r.branch_id=p_branch_id
      and r.status not in ('confirmed','completed','cancelled')

    union all

    select
      case when s.status='failed' then 1 else 2 end,
      case when s.status='failed' then 'high' else 'medium' end,
      'payment_settlement_pending','payment_settlement',s.id,
      s.net_amount,
      case when s.status='failed' then 'تسوية دفع متعذرة' else 'تسوية دفع لم تكتمل' end,
      'التسوية خرجت من مسارها الطبيعي أو ما زالت بانتظار الاستلام.',
      'review_settlement',false,coalesce(s.requested_at,s.settled_at,s.created_at),
      jsonb_build_object(
        'payment_method',s.payment_method,
        'status',s.status,
        'gross_amount',s.gross_amount,
        'fee_amount',s.fee_amount
      )
    from public.payment_settlements s
    where s.branch_id=p_branch_id
      and s.status not in ('completed','cancelled')

    union all

    select
      1,'high','negative_payment_account','payment_account',a.id,
      abs(private.payment_account_balance(a.id)),
      'رصيد حساب دفع سالب',
      'رصيد الـPayment Ledger لهذا الحساب أقل من صفر ويحتاج مراجعة.',
      'review_account',false,coalesce(a.updated_at,a.created_at),
      jsonb_build_object(
        'account_name',a.name,
        'account_type',a.account_type,
        'provider_code',a.provider_code
      )
    from public.payment_accounts a
    where a.branch_id=p_branch_id
      and private.payment_account_balance(a.id)<-0.005

    union all

    select
      1,'high','negative_cash_account','cash_account',a.id,
      abs(private.cash_account_balance(a.id)),
      'رصيد حساب نقدي سالب',
      'رصيد Cash Ledger لهذا الحساب أقل من صفر ويحتاج مراجعة.',
      'review_account',false,coalesce(a.updated_at,a.created_at),
      jsonb_build_object(
        'account_name',a.name,
        'account_type',a.account_type
      )
    from public.cash_accounts a
    where a.branch_id=p_branch_id
      and private.cash_account_balance(a.id)<-0.005
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'severity',severity,
    'issue_type',issue_type,
    'source_kind',source_kind,
    'source_id',source_id,
    'amount',round(coalesce(amount,0),2),
    'title',title,
    'description',description,
    'action',action,
    'can_repair',can_repair,
    'occurred_at',occurred_at,
    'metadata',metadata
  ) order by severity_rank,occurred_at desc),'[]'::jsonb)
  into v_all
  from issues;

  select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb)
  into v_issues
  from jsonb_array_elements(v_all) with ordinality
  where ordinality<=v_limit;

  select jsonb_build_object(
    'attention_count',count(*)::int,
    'critical_count',count(*) filter(where severity='critical')::int,
    'high_count',count(*) filter(where severity='high')::int,
    'medium_count',count(*) filter(where severity='medium')::int,
    'online_missing_count',count(*) filter(where issue_type in ('online_payment_missing','online_cash_missing'))::int,
    'online_missing_amount',round(coalesce(sum(amount) filter(where issue_type in ('online_payment_missing','online_cash_missing')),0),2),
    'paid_cancelled_unrefunded_count',count(*) filter(where issue_type='paid_cancelled_unrefunded')::int,
    'paid_cancelled_unrefunded_amount',round(coalesce(sum(amount) filter(where issue_type='paid_cancelled_unrefunded'),0),2),
    'shift_variance_count',count(*) filter(where issue_type='shift_reconciliation_variance')::int,
    'shift_variance_amount',round(coalesce(sum(amount) filter(where issue_type='shift_reconciliation_variance'),0),2),
    'pending_handoff_count',count(*) filter(where issue_type in ('pos_cash_handoff_pending','delivery_cash_handoff_pending'))::int,
    'pending_handoff_amount',round(coalesce(sum(amount) filter(where issue_type in ('pos_cash_handoff_pending','delivery_cash_handoff_pending')),0),2),
    'pending_refund_count',count(*) filter(where issue_type='payment_refund_pending')::int,
    'pending_refund_amount',round(coalesce(sum(amount) filter(where issue_type='payment_refund_pending'),0),2),
    'pending_settlement_count',count(*) filter(where issue_type='payment_settlement_pending')::int,
    'pending_settlement_amount',round(coalesce(sum(amount) filter(where issue_type='payment_settlement_pending'),0),2)
  )
  into v_summary
  from jsonb_to_recordset(v_all) as x(
    severity text,
    issue_type text,
    source_kind text,
    source_id uuid,
    amount numeric,
    title text,
    description text,
    action text,
    can_repair boolean,
    occurred_at timestamptz,
    metadata jsonb
  );

  select round(coalesce(sum(case when l.entry_type='collection' then l.amount else -l.amount end),0),2)
  into v_delivery_outstanding
  from private.delivery_cash_ledger_v1 l
  where l.branch_id=p_branch_id;

  select round(coalesce(sum(private.payment_account_balance(a.id)),0),2)
  into v_gateway_balance
  from public.payment_accounts a
  where a.branch_id=p_branch_id and a.account_type='gateway_clearing';

  return jsonb_build_object(
    'version',1,
    'branch_id',p_branch_id,
    'permissions',jsonb_build_object('can_manage',v_can_manage),
    'summary',coalesce(v_summary,'{}'::jsonb)
      ||jsonb_build_object(
        'delivery_cash_outstanding',coalesce(v_delivery_outstanding,0),
        'gateway_clearing_balance',coalesce(v_gateway_balance,0)
      ),
    'issues',v_issues,
    'data_quality',jsonb_build_object(
      'trusted_financial_start','2026-09-01T00:00:00Z',
      'legacy_without_receipt_excluded',true
    ),
    'generated_at',now()
  );
end;
$function$;

revoke execute on function private.post_online_order_money_v2(uuid,uuid,text,text) from public,anon,authenticated;
revoke execute on function private.record_online_order_money() from public,anon,authenticated;

revoke all on function public.repair_online_order_financial_ledger_v1(uuid,text) from public,anon;
revoke all on function public.get_finance_reconciliation_control_v1(uuid,integer) from public,anon;

grant execute on function public.repair_online_order_financial_ledger_v1(uuid,text) to authenticated,service_role;
grant execute on function public.get_finance_reconciliation_control_v1(uuid,integer) to authenticated,service_role;
