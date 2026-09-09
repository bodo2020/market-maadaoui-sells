create or replace function private.cleanup_notification_realtime_signals_v2()
returns void
language sql
security definer
set search_path=''
as $function$
  delete from public.notification_realtime_signals_v2
  where created_at < now() - interval '7 days';
$function$;

revoke all on function private.cleanup_notification_realtime_signals_v2() from public,anon,authenticated;
grant execute on function private.cleanup_notification_realtime_signals_v2() to service_role;

do $do$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='notification-realtime-signal-retention-v2' limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
  perform cron.schedule(
    'notification-realtime-signal-retention-v2',
    '17 3 * * *',
    'select private.cleanup_notification_realtime_signals_v2();'
  );
end
$do$;
