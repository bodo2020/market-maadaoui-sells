create or replace function private.emit_notification_realtime_signal_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- Durable notification events may target a staff record before that staff
  -- account has migrated to Supabase Auth. Preserve the event, but only emit
  -- a realtime signal when an Auth identity exists for the same user id.
  if exists (select 1 from auth.users au where au.id=new.recipient_user_id) then
    insert into public.notification_realtime_signals_v2(
      recipient_user_id,notification_id,audience,branch_id
    ) values (
      new.recipient_user_id,new.id,new.audience,new.branch_id
    );
  end if;
  return new;
end;
$$;
