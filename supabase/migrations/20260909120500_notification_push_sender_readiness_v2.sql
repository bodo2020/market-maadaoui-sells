create or replace function public.preview_notification_audience_v2(p_audience_type text,p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_audience text:=lower(coalesce(trim(p_audience_type),''));
  v_total integer:=0;
  v_in_app integer:=0;
  v_whatsapp integer:=0;
  v_push integer:=0;
  v_push_ready boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_audience not in ('staff_branch','customers_all') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_AUDIENCE'; end if;
  if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;
  if v_audience='customers_all' and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_BROADCAST_SUPER_ADMIN_ONLY'; end if;

  select coalesce((select s.value='true' from private.notification_worker_settings_v2 s where s.key='push_worker_enabled'),false)
  into v_push_ready;

  if v_audience='staff_branch' then
    if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
    select count(distinct u.id) into v_total
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true);
    v_in_app:=v_total;
    select count(distinct u.id) into v_push
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    join private.notification_devices_v2 d on d.recipient_user_id=u.id and d.enabled and d.revoked_at is null and d.provider='fcm'
    left join private.notification_preferences_v2 p on p.recipient_user_id=u.id
    where coalesce(u.active,true) and coalesce(p.push_enabled,true);
  else
    select count(*) into v_total from public.customers c where c.management_status='active';
    select count(*) into v_in_app from public.customers c where c.management_status='active' and c.user_id is not null;
    select count(distinct c.id) into v_push
    from public.customers c
    join private.notification_devices_v2 d on d.recipient_user_id=c.user_id and d.enabled and d.revoked_at is null and d.provider='fcm'
    join private.notification_preferences_v2 p on p.recipient_user_id=c.user_id
    where c.management_status='active' and c.user_id is not null and p.push_enabled and p.marketing_enabled;
    select count(*) into v_whatsapp
    from public.customers c
    join private.customer_whatsapp_consent_v2 consent on consent.customer_id=c.id and consent.opted_in
    where c.management_status='active' and c.phone is not null and trim(c.phone)<>'';
  end if;

  return jsonb_build_object(
    'audience_type',v_audience,'branch_id',p_branch_id,'total',v_total,
    'in_app_eligible',v_in_app,'push_eligible',v_push,'push_sender_ready',v_push_ready,
    'whatsapp_marketing_eligible',v_whatsapp,'whatsapp_sender_ready',false
  );
end;
$function$;

revoke all on function public.preview_notification_audience_v2(text,uuid) from public,anon;
grant execute on function public.preview_notification_audience_v2(text,uuid) to authenticated,service_role;
