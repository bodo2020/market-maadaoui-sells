-- M14f — Inventory Reservation Watchdog
-- This repository copy contains the corrected UUID-safe implementation so a fresh
-- environment never experiences the transient production hotfix failure.
CREATE OR REPLACE FUNCTION private.run_inventory_reservation_watchdog_v1(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order record;
  v_limit integer := greatest(1, least(coalesce(p_limit,100),500));
  v_soft_minutes integer;
  v_hard_minutes integer;
  v_age_minutes integer;
  v_checked integer := 0;
  v_tasks integer := 0;
  v_auto_cancelled integer := 0;
  v_repaired_release integer := 0;
  v_repaired_commit integer := 0;
  v_failures integer := 0;
  v_err text;
begin
  for v_order in
    select
      o.id as order_id,
      coalesce(o.branch_id, min(r.branch_id::text)::uuid) as branch_id,
      o.status::text as order_status,
      o.payment_status::text as payment_status,
      min(r.reserved_at) as first_reserved_at,
      coalesce(
        case when coalesce(s.enabled,false) then s.first_response_target_minutes end,
        30
      ) as first_response_minutes
    from public.online_orders o
    join private.inventory_reservations_v1 r
      on r.order_id=o.id
     and r.state='reserved'
    left join private.online_order_sla_policies_v1 s
      on s.branch_id=o.branch_id
    where coalesce(o.inventory_reservation_version,0)=1
    group by
      o.id,o.branch_id,o.status,o.payment_status,
      s.enabled,s.first_response_target_minutes
    order by min(r.reserved_at)
    limit v_limit
  loop
    v_checked := v_checked + 1;
    v_age_minutes := greatest(
      0,
      floor(extract(epoch from (now()-v_order.first_reserved_at))/60)::integer
    );
    v_soft_minutes := greatest(15,coalesce(v_order.first_response_minutes,30));
    v_hard_minutes := greatest(60,v_soft_minutes*2);

    begin
      if v_order.order_status='cancelled' then
        perform private.release_order_inventory_reservation_v1(
          v_order.order_id,
          'watchdog_repair_cancelled_order'
        );
        v_repaired_release := v_repaired_release + 1;
        continue;
      end if;

      if v_order.order_status in ('ready','shipped','delivered') then
        perform private.commit_order_inventory_reservation_v1(
          v_order.order_id,
          'watchdog_repair_'||v_order.order_status
        );
        v_repaired_commit := v_repaired_commit + 1;
        continue;
      end if;

      if v_order.order_status <> 'pending' or v_age_minutes < v_soft_minutes then
        continue;
      end if;

      if v_order.payment_status <> 'paid' and v_age_minutes >= v_hard_minutes then
        perform set_config(
          'app.order_cancel_reason',
          'inventory_reservation_watchdog_timeout',
          true
        );

        update public.online_orders
           set status='cancelled'::public.order_status,
               updated_at=now()
         where id=v_order.order_id
           and status::text='pending'
           and coalesce(inventory_reservation_version,0)=1;

        if found then
          v_auto_cancelled := v_auto_cancelled + 1;

          update public.operations_tasks t
             set status='completed',
                 completed_at=coalesce(t.completed_at,now()),
                 completed_by=null,
                 description='تم إلغاء الطلب المعلق تلقائيًا بعد انتهاء مهلة حجز المخزون.',
                 metadata=coalesce(t.metadata,'{}'::jsonb)||jsonb_build_object(
                   'watchdog_version',1,
                   'auto_cancelled',true,
                   'auto_cancelled_at',now(),
                   'age_minutes',v_age_minutes,
                   'hard_timeout_minutes',v_hard_minutes
                 ),
                 updated_at=now()
           where t.task_type='inventory_reservation_watchdog'
             and t.source_kind='online_order_inventory_reservation'
             and t.source_id=v_order.order_id
             and t.status not in ('completed','cancelled');
          continue;
        end if;
      end if;

      insert into public.operations_tasks(
        branch_id,task_type,source_kind,source_id,order_id,
        amount,priority,status,title,description,due_at,metadata,created_by
      )
      values(
        v_order.branch_id,
        'inventory_reservation_watchdog',
        'online_order_inventory_reservation',
        v_order.order_id,
        v_order.order_id,
        0,
        case when v_order.payment_status='paid' then 'high' else 'normal' end,
        'open',
        case
          when v_order.payment_status='paid'
            then 'طلب مدفوع مع حجز مخزون معلق'
          else 'مراجعة حجز مخزون معلق'
        end,
        case
          when v_order.payment_status='paid'
            then 'الطلب ما زال Pending رغم أنه مدفوع. لا يتم إلغاؤه تلقائيًا؛ راجع الدفع والفرع قبل تحرير المخزون.'
          else 'الطلب ما زال Pending بعد مهلة الاستجابة. راجعه قبل الوصول إلى مهلة الإلغاء التلقائي.'
        end,
        now()+interval '15 minutes',
        jsonb_build_object(
          'watchdog_version',1,
          'order_status',v_order.order_status,
          'payment_status',v_order.payment_status,
          'age_minutes',v_age_minutes,
          'soft_timeout_minutes',v_soft_minutes,
          'hard_timeout_minutes',v_hard_minutes,
          'auto_cancel_eligible',(v_order.payment_status<>'paid')
        ),
        null
      )
      on conflict(task_type,source_kind,source_id) do update set
        branch_id=excluded.branch_id,
        order_id=excluded.order_id,
        priority=excluded.priority,
        title=excluded.title,
        description=excluded.description,
        due_at=excluded.due_at,
        metadata=coalesce(public.operations_tasks.metadata,'{}'::jsonb)||excluded.metadata,
        status=case
          when public.operations_tasks.status in ('completed','cancelled') then 'open'
          else public.operations_tasks.status
        end,
        claimed_by=case
          when public.operations_tasks.status in ('completed','cancelled') then null
          else public.operations_tasks.claimed_by
        end,
        claimed_at=case
          when public.operations_tasks.status in ('completed','cancelled') then null
          else public.operations_tasks.claimed_at
        end,
        started_at=case
          when public.operations_tasks.status in ('completed','cancelled') then null
          else public.operations_tasks.started_at
        end,
        completed_by=case
          when public.operations_tasks.status in ('completed','cancelled') then null
          else public.operations_tasks.completed_by
        end,
        completed_at=case
          when public.operations_tasks.status in ('completed','cancelled') then null
          else public.operations_tasks.completed_at
        end,
        failure_reason=null,
        updated_at=now();

      v_tasks := v_tasks + 1;
    exception when others then
      v_failures := v_failures + 1;
      v_err := sqlerrm;

      if v_order.branch_id is not null then
        insert into public.operations_tasks(
          branch_id,task_type,source_kind,source_id,order_id,
          amount,priority,status,title,description,due_at,metadata,created_by
        )
        values(
          v_order.branch_id,
          'inventory_reservation_watchdog',
          'online_order_inventory_reservation',
          v_order.order_id,
          v_order.order_id,
          0,'high','open',
          'فشل معالجة حجز مخزون معلق',
          'تعذر على Reservation Watchdog معالجة الطلب تلقائيًا. يلزم تدخل تشغيلي.',
          now()+interval '10 minutes',
          jsonb_build_object(
            'watchdog_version',1,
            'order_status',v_order.order_status,
            'payment_status',v_order.payment_status,
            'age_minutes',v_age_minutes,
            'error',left(v_err,500)
          ),
          null
        )
        on conflict(task_type,source_kind,source_id) do update set
          priority='high',
          status=case
            when public.operations_tasks.status in ('completed','cancelled') then 'open'
            else public.operations_tasks.status
          end,
          title=excluded.title,
          description=excluded.description,
          due_at=excluded.due_at,
          metadata=coalesce(public.operations_tasks.metadata,'{}'::jsonb)||excluded.metadata,
          failure_reason=left(v_err,500),
          updated_at=now();
        v_tasks := v_tasks + 1;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'checked_orders',v_checked,
    'tasks_upserted',v_tasks,
    'auto_cancelled',v_auto_cancelled,
    'repaired_releases',v_repaired_release,
    'repaired_commits',v_repaired_commit,
    'failures',v_failures,
    'ran_at',now()
  );
end;
$function$;


revoke execute on function private.run_inventory_reservation_watchdog_v1(integer)
from public, anon, authenticated;

do $$
declare v_jobid bigint;
begin
  select j.jobid into v_jobid
  from cron.job j
  where j.jobname='inventory-reservation-watchdog-m14'
  order by j.jobid desc
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'inventory-reservation-watchdog-m14',
    '*/5 * * * *',
    'select private.run_inventory_reservation_watchdog_v1(100);'
  );
end $$;
