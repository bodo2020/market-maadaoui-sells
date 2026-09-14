create or replace function public.get_my_picker_assignment_offer_v1(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_mode text:='shadow';
  v_ttl integer:=90;
  v_expired record;
  v_offer record;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;

  select mode,offer_ttl_seconds into v_mode,v_ttl from private.order_picker_assignment_policy_v1 where branch_id=p_branch_id;
  v_mode:=coalesce(v_mode,'shadow'); v_ttl:=coalesce(v_ttl,90);

  for v_expired in
    update private.order_picker_assignment_offers_v1
       set status='expired',responded_at=coalesce(responded_at,now()),updated_at=now()
     where branch_id=p_branch_id and status='offered' and expires_at<=now()
     returning order_id
  loop
    perform private.sync_order_picker_assignment_offer_v1(v_expired.order_id);
  end loop;

  if v_mode='assisted' then
    for v_expired in
      select f.order_id from private.order_fulfillment_state_v1 f
      join public.online_orders o on o.id=f.order_id
      where f.branch_id=p_branch_id and f.fulfillment_state='queued' and f.picker_user_id is null
        and o.status::text in ('confirmed','preparing')
      order by f.predicted_ready_at nulls last
      limit 20
    loop
      perform private.sync_order_picker_assignment_offer_v1(v_expired.order_id);
    end loop;
  end if;

  select off.id as offer_id,off.order_id,off.expires_at,off.recommended_score,
         coalesce(o.tracking_number,left(o.id::text,8)) as display_id,o.customer_name,
         f.items_total,f.predicted_ready_at,
         greatest(0,ceil(extract(epoch from (off.expires_at-now()))))::integer as seconds_remaining
    into v_offer
  from private.order_picker_assignment_offers_v1 off
  join public.online_orders o on o.id=off.order_id
  join private.order_fulfillment_state_v1 f on f.order_id=off.order_id
  where off.branch_id=p_branch_id and off.offered_user_id=v_uid and off.status='offered' and off.expires_at>now()
  order by off.offered_at
  limit 1;

  return jsonb_build_object(
    'mode',v_mode,
    'offer_ttl_seconds',v_ttl,
    'offer',case when v_offer.offer_id is null then null else jsonb_build_object(
      'offer_id',v_offer.offer_id,'order_id',v_offer.order_id,'display_id',v_offer.display_id,
      'customer_name',v_offer.customer_name,'items_total',v_offer.items_total,
      'predicted_ready_at',v_offer.predicted_ready_at,'recommended_score',v_offer.recommended_score,
      'expires_at',v_offer.expires_at,'seconds_remaining',v_offer.seconds_remaining
    ) end
  );
end;
$function$;

create or replace function public.accept_my_picker_assignment_offer_v1(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_offer private.order_picker_assignment_offers_v1%rowtype;
  v_claim jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_offer from private.order_picker_assignment_offers_v1 where id=p_offer_id for update;
  if v_offer.id is null or v_offer.offered_user_id<>v_uid then raise exception using errcode='42501',message='OFFER_NOT_OWNED'; end if;
  if v_offer.status<>'offered' then raise exception using errcode='55000',message='OFFER_NOT_ACTIVE'; end if;
  if v_offer.expires_at<=now() then
    update private.order_picker_assignment_offers_v1 set status='expired',responded_at=now(),updated_at=now() where id=v_offer.id;
    perform private.sync_order_picker_assignment_offer_v1(v_offer.order_id);
    raise exception using errcode='55000',message='OFFER_EXPIRED';
  end if;

  v_claim:=public.claim_order_fulfillment_v1(v_offer.order_id);
  update private.order_picker_assignment_offers_v1 set status='accepted',responded_at=now(),updated_at=now() where id=v_offer.id;
  update private.notification_events_v2 set status='resolved',resolved_at=now(),actioned_at=now(),updated_at=now()
   where recipient_user_id=v_uid and dedupe_key='picker_offer:'||v_offer.id::text;
  return jsonb_build_object('ok',true,'offer_id',v_offer.id,'order_id',v_offer.order_id,'claim',v_claim);
end;
$function$;

create or replace function public.decline_my_picker_assignment_offer_v1(p_offer_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_offer private.order_picker_assignment_offers_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_offer from private.order_picker_assignment_offers_v1 where id=p_offer_id for update;
  if v_offer.id is null or v_offer.offered_user_id<>v_uid then raise exception using errcode='42501',message='OFFER_NOT_OWNED'; end if;
  if v_offer.status<>'offered' then raise exception using errcode='55000',message='OFFER_NOT_ACTIVE'; end if;
  update private.order_picker_assignment_offers_v1
     set status='declined',responded_at=now(),reason=nullif(trim(coalesce(p_reason,'')),''),updated_at=now()
   where id=v_offer.id;
  update private.notification_events_v2 set status='resolved',resolved_at=now(),actioned_at=now(),updated_at=now()
   where recipient_user_id=v_uid and dedupe_key='picker_offer:'||v_offer.id::text;
  perform private.sync_order_picker_assignment_offer_v1(v_offer.order_id);
  return jsonb_build_object('ok',true,'offer_id',v_offer.id,'order_id',v_offer.order_id,'status','declined');
end;
$function$;

revoke all on function public.get_my_picker_assignment_offer_v1(uuid) from public,anon;
revoke all on function public.accept_my_picker_assignment_offer_v1(uuid) from public,anon;
revoke all on function public.decline_my_picker_assignment_offer_v1(uuid,text) from public,anon;
grant execute on function public.get_my_picker_assignment_offer_v1(uuid) to authenticated;
grant execute on function public.accept_my_picker_assignment_offer_v1(uuid) to authenticated;
grant execute on function public.decline_my_picker_assignment_offer_v1(uuid,text) to authenticated;