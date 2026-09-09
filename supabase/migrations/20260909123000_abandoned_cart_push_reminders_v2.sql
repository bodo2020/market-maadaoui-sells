create extension if not exists pg_cron;

create or replace function private.generate_abandoned_cart_reminders_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_created integer:=0;
begin
  with cart_state as (
    select
      coalesce(ci.user_id,c.user_id) as recipient_user_id,
      coalesce(ci.customer_id,c.id) as customer_id,
      count(*)::integer as item_count,
      coalesce(sum(ci.quantity),0)::integer as unit_count,
      max(coalesce(ci.updated_at,ci.created_at,now())) as last_changed_at
    from public.cart_items ci
    left join public.customers c
      on c.id=ci.customer_id
      or (ci.customer_id is null and ci.user_id is not null and c.user_id=ci.user_id)
    where coalesce(ci.user_id,c.user_id) is not null
    group by coalesce(ci.user_id,c.user_id),coalesce(ci.customer_id,c.id)
  ), eligible as (
    select cs.*
    from cart_state cs
    join public.customers c on c.id=cs.customer_id and c.management_status='active'
    join private.notification_preferences_v2 p
      on p.recipient_user_id=cs.recipient_user_id
      and p.push_enabled
      and p.marketing_enabled
    where cs.last_changed_at <= now()-interval '2 hours'
      and cs.last_changed_at >= now()-interval '7 days'
      and exists(
        select 1 from private.notification_devices_v2 d
        where d.recipient_user_id=cs.recipient_user_id
          and d.provider='fcm'
          and d.enabled
          and d.revoked_at is null
      )
  ), inserted as (
    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
      source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
      eligible_channels,status,metadata,created_at,updated_at
    )
    select
      'customer',e.recipient_user_id,null,'marketing.abandoned_cart','marketing','info',
      'لسه في حاجات مستنياك في السلة 🛒',
      case when e.item_count=1 then 'عندك منتج في السلة مستنيك. كمّل طلبك وقت ما تحب.'
           else 'عندك '||e.item_count::text||' منتجات في السلة مستنياك. كمّل طلبك وقت ما تحب.' end,
      'abandoned_cart',e.customer_id,'/cart','فتح السلة',false,
      'abandoned_cart:'||extract(epoch from e.last_changed_at)::bigint::text,
      array['in_app','push']::text[],'active',
      jsonb_build_object(
        'delivery_type','marketing','customer_id',e.customer_id,'item_count',e.item_count,
        'unit_count',e.unit_count,'cart_last_changed_at',e.last_changed_at
      ),now(),now()
    from eligible e
    on conflict(recipient_user_id,dedupe_key) do nothing
    returning 1
  )
  select count(*) into v_created from inserted;

  return jsonb_build_object('created',v_created,'checked_at',now(),'minimum_idle_minutes',120,'max_cart_age_days',7);
end;
$function$;

revoke all on function private.generate_abandoned_cart_reminders_v2() from public,anon,authenticated;
grant execute on function private.generate_abandoned_cart_reminders_v2() to service_role;

select cron.unschedule(jobid)
from cron.job
where jobname='notification-abandoned-cart-v2';

select cron.schedule(
  'notification-abandoned-cart-v2',
  '15 * * * *',
  $$select private.generate_abandoned_cart_reminders_v2();$$
);
