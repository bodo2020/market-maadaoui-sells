create or replace function private.sync_staged_bags_on_delivery_pickup_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_total integer:=0;
  v_staged integer:=0;
  v_branch uuid;
begin
  if new.delivery_state is distinct from old.delivery_state and new.delivery_state='picked_up' then
    select count(*) filter(where status<>'cancelled')::integer,
           count(*) filter(where status='staged')::integer
      into v_total,v_staged
    from private.order_fulfillment_bags_v1
    where order_id=new.order_id;

    if v_total>0 and v_staged<>v_total then
      raise exception using errcode='55000',message='ORDER_BAGS_NOT_STAGED';
    end if;

    if v_total>0 then
      update private.order_fulfillment_bags_v1
         set status='handed_over',
             handed_over_to=new.delivery_user_id,
             handed_over_at=coalesce(handed_over_at,now()),
             updated_at=now()
       where order_id=new.order_id and status='staged';

      update private.order_fulfillment_state_v1
         set fulfillment_state='handed_over',
             handed_over_at=coalesce(handed_over_at,now()),
             updated_at=now(),
             metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('handover_driver_id',new.delivery_user_id,'handover_assignment_id',new.id)
       where order_id=new.order_id and fulfillment_state='ready';

      update private.delivery_order_assignments_v1
         set handover_at=coalesce(handover_at,now()),updated_at=now()
       where id=new.id;

      select branch_id into v_branch from private.order_fulfillment_state_v1 where order_id=new.order_id;
      if v_branch is not null then
        insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
        values(v_branch,new.order_id,'bags_handed_over');
      end if;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_delivery_staged_bag_handover_v1 on private.delivery_order_assignments_v1;
create trigger trg_delivery_staged_bag_handover_v1
after update of delivery_state on private.delivery_order_assignments_v1
for each row execute function private.sync_staged_bags_on_delivery_pickup_v1();

revoke all on function private.sync_staged_bags_on_delivery_pickup_v1() from public,anon,authenticated;

comment on function private.sync_staged_bags_on_delivery_pickup_v1() is 'For staged orders, prevents pickup before every bag is staged and atomically marks staged bags handed over to the assigned driver. Orders without bag rows are treated as legacy compatibility orders.';
