-- M16b — periodic ETA refresh + branch profile learning schedules.
do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job
  where jobname='order-eta-watchdog-m16'
  order by jobid desc limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;

  perform cron.schedule(
    'order-eta-watchdog-m16',
    '*/2 * * * *',
    'select private.run_order_eta_watchdog_v2(300);'
  );
end $$;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job
  where jobname='order-eta-profile-refresh-m16'
  order by jobid desc limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;

  perform cron.schedule(
    'order-eta-profile-refresh-m16',
    '*/15 * * * *',
    'select private.refresh_order_eta_branch_profiles_v2(null);'
  );
end $$;
