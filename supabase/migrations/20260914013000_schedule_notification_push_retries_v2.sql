create or replace function private.run_push_worker_retry_v2()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_enabled text;
  v_secret text;
begin
  select s.value into v_enabled
  from private.notification_worker_settings_v2 s
  where s.key='push_worker_enabled';

  if coalesce(v_enabled,'false') <> 'true' then
    return;
  end if;

  if not exists (
    select 1
    from private.notification_delivery_queue_v2 q
    where q.channel='push'
      and q.state in ('pending','retrying')
      and coalesce(q.next_attempt_at,now()) <= now()
  ) then
    return;
  end if;

  select s.value into v_secret
  from private.notification_worker_settings_v2 s
  where s.key='push_worker_secret';

  if nullif(v_secret,'') is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://qzvpayjaadbmpayeglon.supabase.co/functions/v1/process-push-notifications',
    body := jsonb_build_object('reason','scheduled_retry','at',now()),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type','application/json',
      'x-notification-worker-secret',v_secret
    ),
    timeout_milliseconds := 5000
  );
end;
$function$;

revoke all on function private.run_push_worker_retry_v2() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='notification-push-retry-v2';

select cron.schedule(
  'notification-push-retry-v2',
  '* * * * *',
  'select private.run_push_worker_retry_v2();'
);
