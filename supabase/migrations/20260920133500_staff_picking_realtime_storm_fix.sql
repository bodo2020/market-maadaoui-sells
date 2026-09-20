-- Reduce redundant fulfillment writes and realtime refresh storms during barcode picking.
-- This keeps operational state updates realtime, while ignoring ETA-only predicted_ready_at churn.

create or replace function private.refresh_order_fulfillment_item_totals_v1(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_total integer;
  v_picked integer;
  v_short integer;
  v_sub integer;
begin
  select count(*),
         count(*) filter(where status='picked'),
         count(*) filter(where status='shortage'),
         count(*) filter(where status='substituted')
  into v_total,v_picked,v_short,v_sub
  from private.order_fulfillment_items_v1
  where order_id=p_order_id;

  update private.order_fulfillment_state_v1
  set items_total=coalesce(v_total,0),
      items_picked=coalesce(v_picked,0),
      shortage_count=coalesce(v_short,0),
      substitution_count=coalesce(v_sub,0),
      updated_at=now()
  where order_id=p_order_id
    and (
      items_total is distinct from coalesce(v_total,0)
      or items_picked is distinct from coalesce(v_picked,0)
      or shortage_count is distinct from coalesce(v_short,0)
      or substitution_count is distinct from coalesce(v_sub,0)
    );
end;
$function$;

create or replace function private.emit_order_operations_signal_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_branch uuid;
  v_order uuid;
  v_event text;
begin
  if tg_table_name='online_orders' then
    v_branch:=coalesce(new.branch_id,old.branch_id);
    v_order:=coalesce(new.id,old.id);
    if tg_op='INSERT' then
      v_event:='order_created';
    elsif new.status is distinct from old.status then
      v_event:='order_status_changed';
    else
      v_event:='order_updated';
    end if;

  elsif tg_table_name='order_fulfillment_state_v1' then
    -- ETA recalculation updates predicted_ready_at frequently. That change is useful
    -- for reports but should not force every staff client to reload the whole order.
    if tg_op='UPDATE'
       and row(
         new.branch_id,
         new.fulfillment_state,
         new.picker_user_id,
         new.pick_task_id,
         new.items_total,
         new.items_picked,
         new.shortage_count,
         new.substitution_count,
         new.bags_count,
         new.picking_started_at,
         new.picking_completed_at,
         new.packing_started_at,
         new.ready_at,
         new.handed_over_at,
         new.completed_at,
         new.issue_code,
         new.issue_note
       ) is not distinct from row(
         old.branch_id,
         old.fulfillment_state,
         old.picker_user_id,
         old.pick_task_id,
         old.items_total,
         old.items_picked,
         old.shortage_count,
         old.substitution_count,
         old.bags_count,
         old.picking_started_at,
         old.picking_completed_at,
         old.packing_started_at,
         old.ready_at,
         old.handed_over_at,
         old.completed_at,
         old.issue_code,
         old.issue_note
       ) then
      return new;
    end if;

    v_branch:=coalesce(new.branch_id,old.branch_id);
    v_order:=coalesce(new.order_id,old.order_id);
    v_event:='fulfillment_updated';

  else
    v_branch:=coalesce(new.branch_id,old.branch_id);
    v_order:=coalesce(new.order_id,old.order_id);
    v_event:='delivery_updated';
  end if;

  if v_branch is not null and v_order is not null then
    insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
    values(v_branch,v_order,v_event);
  end if;
  return coalesce(new,old);
end;
$function$;
