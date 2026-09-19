-- M15h — expire unanswered customer substitution approvals safely.
alter table private.order_fulfillment_substitutions_v1
  drop constraint if exists order_fulfillment_substitutions_v1_resolution_source_check;
alter table private.order_fulfillment_substitutions_v1
  add constraint order_fulfillment_substitutions_v1_resolution_source_check
  check (resolution_source is null or resolution_source in (
    'manager','customer','auto','picker_cancelled','customer_timeout'
  ));

CREATE OR REPLACE FUNCTION private.run_order_substitution_timeout_watchdog_v1(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r record;
  v_checked integer:=0;
  v_rejected integer:=0;
  v_failed_tasks integer:=0;
  v_notified integer:=0;
begin
  for r in
    select s.id,s.order_id,s.branch_id,s.approval_task_id,
           s.original_product_name,s.replacement_product_name,
           s.customer_decision_due_at,c.user_id as customer_user_id
    from private.order_fulfillment_substitutions_v1 s
    join public.online_orders o on o.id=s.order_id
    left join public.customers c on c.id=o.customer_id
    where s.status='pending'
      and s.approval_mode='customer'
      and s.customer_decision_due_at is not null
      and s.customer_decision_due_at<=now()
    order by s.customer_decision_due_at,s.id
    limit least(greatest(coalesce(p_limit,100),1),500)
  loop
    v_checked:=v_checked+1;

    perform 1
    from private.order_fulfillment_substitutions_v1 s
    where s.id=r.id and s.status='pending'
    for update;
    if not found then continue; end if;

    update private.order_fulfillment_substitutions_v1
    set status='rejected',
        resolved_by=null,
        customer_resolved_by=null,
        resolved_at=now(),
        resolution_source='customer_timeout',
        resolution_note='انتهت مهلة موافقة العميل على البديل',
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'customer_decision_timeout_at',now()
        )
    where id=r.id and status='pending';

    if not found then continue; end if;
    v_rejected:=v_rejected+1;

    if r.approval_task_id is not null then
      update public.operations_tasks
      set status='failed',
          completed_by=null,
          completed_at=now(),
          updated_at=now(),
          title='انتهت مهلة موافقة العميل على البديل',
          description=r.original_product_name||' ← '||r.replacement_product_name||
            ' · لم يرد العميل خلال المهلة؛ اختر بديلًا آخر أو سجّل الصنف كناقص.',
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'decision','customer_timeout',
            'resolution_source','customer_timeout',
            'resolution_note','انتهت مهلة موافقة العميل على البديل'
          )
      where id=r.approval_task_id
        and status in ('open','claimed','in_progress');

      if found then
        v_failed_tasks:=v_failed_tasks+1;
        insert into public.operations_task_events(
          task_id,event_type,actor_id,note,metadata
        ) values(
          r.approval_task_id,'failed',null,
          'انتهت مهلة موافقة العميل على البديل',
          jsonb_build_object('resolution_source','customer_timeout')
        );
      end if;
    end if;

    if r.customer_user_id is not null then
      insert into public.customer_notifications(
        user_id,order_id,kind,status,title,body,dedupe_key
      ) values(
        r.customer_user_id,r.order_id,'order_status','active',
        'انتهت مهلة الموافقة على البديل',
        r.original_product_name||' · تم إلغاء اقتراح '||r.replacement_product_name||
          ' تلقائيًا لأن المهلة انتهت، وفريق التجهيز هيكمل مراجعة الصنف.',
        'order-substitution-timeout:'||r.id::text
      )
      on conflict(dedupe_key) do nothing;

      if found then v_notified:=v_notified+1; end if;
    end if;

    insert into public.order_operations_realtime_signals_v1(
      branch_id,order_id,event_type
    ) values(r.branch_id,r.order_id,'substitution_customer_timeout');
  end loop;

  return jsonb_build_object(
    'ok',true,
    'checked',v_checked,
    'rejected',v_rejected,
    'tasks_failed',v_failed_tasks,
    'customers_notified',v_notified
  );
end;
$function$;

revoke execute on function private.run_order_substitution_timeout_watchdog_v1(integer)
from public,anon,authenticated;

do $$
declare v_jobid bigint;
begin
  select j.jobid into v_jobid
  from cron.job j
  where j.jobname='order-substitution-timeout-watchdog-m15'
  order by j.jobid desc
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'order-substitution-timeout-watchdog-m15',
    '* * * * *',
    'select private.run_order_substitution_timeout_watchdog_v1(100);'
  );
end $$;
