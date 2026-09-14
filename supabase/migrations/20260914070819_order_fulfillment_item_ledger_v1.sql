create table if not exists private.order_fulfillment_items_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  line_no integer not null,
  product_id uuid,
  variant_id uuid,
  barcode text,
  product_name text not null,
  image_url text,
  required_quantity numeric(14,3) not null check(required_quantity>0),
  picked_quantity numeric(14,3) not null default 0 check(picked_quantity>=0),
  shortage_quantity numeric(14,3) not null default 0 check(shortage_quantity>=0),
  substitution_quantity numeric(14,3) not null default 0 check(substitution_quantity>=0),
  is_weight_based boolean not null default false,
  is_bulk boolean not null default false,
  bulk_quantity numeric(14,3),
  unit_of_measure text,
  status text not null default 'pending' check(status in ('pending','picking','picked','shortage','substituted')),
  last_scanned_at timestamptz,
  completed_at timestamptz,
  updated_by uuid references public.users(id),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,line_no),
  check(picked_quantity + shortage_quantity + substitution_quantity <= required_quantity + 0.0005)
);

create index if not exists order_fulfillment_items_order_status_idx on private.order_fulfillment_items_v1(order_id,status,line_no);
create index if not exists order_fulfillment_items_barcode_idx on private.order_fulfillment_items_v1(order_id,barcode) where barcode is not null and barcode<>'';
revoke all on private.order_fulfillment_items_v1 from public,anon,authenticated;

create or replace function private.refresh_order_fulfillment_item_totals_v1(p_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_total integer; v_picked integer; v_short integer; v_sub integer;
begin
  select count(*),count(*) filter(where status='picked'),count(*) filter(where status='shortage'),count(*) filter(where status='substituted')
  into v_total,v_picked,v_short,v_sub
  from private.order_fulfillment_items_v1 where order_id=p_order_id;
  update private.order_fulfillment_state_v1
  set items_total=coalesce(v_total,0),items_picked=coalesce(v_picked,0),shortage_count=coalesce(v_short,0),substitution_count=coalesce(v_sub,0),updated_at=now()
  where order_id=p_order_id;
end;
$function$;
revoke all on function private.refresh_order_fulfillment_item_totals_v1(uuid) from public,anon,authenticated;

create or replace function private.sync_order_fulfillment_items_v1(p_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_order public.online_orders%rowtype; r record; v_qty numeric;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null or jsonb_typeof(v_order.items)<>'array' then return; end if;
  for r in select (ord-1)::integer as line_no,item from jsonb_array_elements(v_order.items) with ordinality x(item,ord) loop
    v_qty:=greatest(0.001,coalesce(nullif(r.item->>'quantity','')::numeric,1));
    insert into private.order_fulfillment_items_v1(order_id,line_no,product_id,variant_id,barcode,product_name,image_url,required_quantity,is_weight_based,is_bulk,bulk_quantity,unit_of_measure,metadata)
    values(
      p_order_id,r.line_no,
      case when coalesce(r.item->>'product_id','') ~* '^[0-9a-f-]{36}$' then (r.item->>'product_id')::uuid else null end,
      case when coalesce(r.item->>'variant_id','') ~* '^[0-9a-f-]{36}$' then (r.item->>'variant_id')::uuid else null end,
      nullif(trim(coalesce(r.item->>'barcode','')),''),
      coalesce(nullif(trim(coalesce(r.item->>'product_name','')),''),nullif(trim(coalesce(r.item->>'name','')),''),'منتج'),
      nullif(r.item->>'image_url',''),v_qty,
      coalesce((r.item->>'is_weight_based')::boolean,false),coalesce((r.item->>'is_bulk')::boolean,false),
      nullif(r.item->>'bulk_quantity','')::numeric,nullif(r.item->>'unit_of_measure',''),jsonb_build_object('snapshot',r.item)
    ) on conflict(order_id,line_no) do update set
      product_id=excluded.product_id,variant_id=excluded.variant_id,barcode=excluded.barcode,product_name=excluded.product_name,image_url=excluded.image_url,
      required_quantity=case when private.order_fulfillment_items_v1.status='pending' then excluded.required_quantity else private.order_fulfillment_items_v1.required_quantity end,
      is_weight_based=excluded.is_weight_based,is_bulk=excluded.is_bulk,bulk_quantity=excluded.bulk_quantity,unit_of_measure=excluded.unit_of_measure,
      metadata=private.order_fulfillment_items_v1.metadata || jsonb_build_object('snapshot',r.item),updated_at=now();
  end loop;
  delete from private.order_fulfillment_items_v1 i where i.order_id=p_order_id and i.status='pending' and i.line_no >= jsonb_array_length(v_order.items);
  perform private.refresh_order_fulfillment_item_totals_v1(p_order_id);
end;
$function$;
revoke all on function private.sync_order_fulfillment_items_v1(uuid) from public,anon,authenticated;

create or replace function public.get_my_order_picking_session_v1(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_f private.order_fulfillment_state_v1%rowtype; v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform private.sync_order_fulfillment_items_v1(p_order_id);
  select * into v_f from private.order_fulfillment_state_v1 where order_id=p_order_id;
  if v_f.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,v_f.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_f.picker_user_id is not null and v_f.picker_user_id<>v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  select jsonb_build_object(
    'order_id',p_order_id,'fulfillment_state',v_f.fulfillment_state,'picker_user_id',v_f.picker_user_id,'items_total',v_f.items_total,
    'items_picked',v_f.items_picked,'shortage_count',v_f.shortage_count,'substitution_count',v_f.substitution_count,
    'resolved_count',v_f.items_picked+v_f.shortage_count+v_f.substitution_count,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,'line_no',i.line_no,'product_id',i.product_id,'variant_id',i.variant_id,'barcode',i.barcode,'product_name',i.product_name,'image_url',i.image_url,
      'required_quantity',i.required_quantity,'picked_quantity',i.picked_quantity,'shortage_quantity',i.shortage_quantity,'substitution_quantity',i.substitution_quantity,
      'is_weight_based',i.is_weight_based,'is_bulk',i.is_bulk,'bulk_quantity',i.bulk_quantity,'unit_of_measure',i.unit_of_measure,'status',i.status,
      'last_scanned_at',i.last_scanned_at,'note',i.note
    ) order by case i.status when 'pending' then 0 when 'picking' then 1 else 2 end,i.line_no),'[]'::jsonb)
  ) into v_result from private.order_fulfillment_items_v1 i where i.order_id=p_order_id;
  return v_result;
end;
$function$;
revoke all on function public.get_my_order_picking_session_v1(uuid) from public,anon;
grant execute on function public.get_my_order_picking_session_v1(uuid) to authenticated;

create or replace function public.scan_order_fulfillment_barcode_v1(p_order_id uuid,p_barcode text,p_quantity numeric default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_f private.order_fulfillment_state_v1%rowtype; v_i private.order_fulfillment_items_v1%rowtype; v_add numeric; v_remaining numeric;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if nullif(trim(coalesce(p_barcode,'')),'') is null then raise exception using errcode='22023',message='BARCODE_REQUIRED'; end if;
  perform private.sync_order_fulfillment_items_v1(p_order_id);
  select * into v_f from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_f.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;
  select * into v_i from private.order_fulfillment_items_v1
  where order_id=p_order_id and barcode=trim(p_barcode) and picked_quantity+shortage_quantity+substitution_quantity < required_quantity-0.0005
  order by line_no limit 1 for update;
  if v_i.id is null then
    if exists(select 1 from private.order_fulfillment_items_v1 where order_id=p_order_id and barcode=trim(p_barcode)) then raise exception using errcode='22023',message='ITEM_ALREADY_COMPLETE'; end if;
    raise exception using errcode='22023',message='BARCODE_NOT_IN_ORDER';
  end if;
  v_remaining:=v_i.required_quantity-v_i.picked_quantity-v_i.shortage_quantity-v_i.substitution_quantity;
  if v_i.is_weight_based then
    if p_quantity is null or p_quantity<=0 then raise exception using errcode='22023',message='WEIGHT_REQUIRED'; end if;
    v_add:=least(p_quantity,v_remaining);
    if p_quantity>v_remaining+0.0005 then raise exception using errcode='22023',message='QUANTITY_EXCEEDS_REQUIRED'; end if;
  else
    v_add:=coalesce(p_quantity,1);
    if v_add<=0 or v_add<>trunc(v_add) then raise exception using errcode='22023',message='INVALID_PIECE_QUANTITY'; end if;
    if v_add>v_remaining+0.0005 then raise exception using errcode='22023',message='QUANTITY_EXCEEDS_REQUIRED'; end if;
  end if;
  update private.order_fulfillment_items_v1
  set picked_quantity=picked_quantity+v_add,
      status=case when picked_quantity+v_add+shortage_quantity+substitution_quantity >= required_quantity-0.0005 then 'picked' else 'picking' end,
      last_scanned_at=now(),completed_at=case when picked_quantity+v_add+shortage_quantity+substitution_quantity >= required_quantity-0.0005 then now() else completed_at end,
      updated_by=v_uid,updated_at=now()
  where id=v_i.id returning * into v_i;
  perform private.refresh_order_fulfillment_item_totals_v1(p_order_id);
  return jsonb_build_object('ok',true,'line',jsonb_build_object('id',v_i.id,'product_name',v_i.product_name,'barcode',v_i.barcode,'required_quantity',v_i.required_quantity,'picked_quantity',v_i.picked_quantity,'status',v_i.status,'is_weight_based',v_i.is_weight_based));
end;
$function$;
revoke all on function public.scan_order_fulfillment_barcode_v1(uuid,text,numeric) from public,anon;
grant execute on function public.scan_order_fulfillment_barcode_v1(uuid,text,numeric) to authenticated;

create or replace function public.confirm_order_fulfillment_item_v1(p_item_id uuid,p_quantity numeric default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_i private.order_fulfillment_items_v1%rowtype; v_f private.order_fulfillment_state_v1%rowtype; v_remaining numeric; v_add numeric;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id for update;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id for update;
  if v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;
  v_remaining:=v_i.required_quantity-v_i.picked_quantity-v_i.shortage_quantity-v_i.substitution_quantity;
  if v_remaining<=0.0005 then raise exception using errcode='22023',message='ITEM_ALREADY_COMPLETE'; end if;
  if v_i.is_weight_based then
    if p_quantity is null or p_quantity<=0 then raise exception using errcode='22023',message='WEIGHT_REQUIRED'; end if;
    v_add:=p_quantity;
  else
    v_add:=coalesce(p_quantity,v_remaining);
    if v_add<=0 or v_add<>trunc(v_add) then raise exception using errcode='22023',message='INVALID_PIECE_QUANTITY'; end if;
  end if;
  if v_add>v_remaining+0.0005 then raise exception using errcode='22023',message='QUANTITY_EXCEEDS_REQUIRED'; end if;
  update private.order_fulfillment_items_v1
  set picked_quantity=picked_quantity+v_add,status=case when picked_quantity+v_add+shortage_quantity+substitution_quantity>=required_quantity-0.0005 then 'picked' else 'picking' end,
      completed_at=case when picked_quantity+v_add+shortage_quantity+substitution_quantity>=required_quantity-0.0005 then now() else completed_at end,
      updated_by=v_uid,updated_at=now()
  where id=v_i.id returning * into v_i;
  perform private.refresh_order_fulfillment_item_totals_v1(v_i.order_id);
  return jsonb_build_object('ok',true,'line',to_jsonb(v_i)-'metadata');
end;
$function$;
revoke all on function public.confirm_order_fulfillment_item_v1(uuid,numeric) from public,anon;
grant execute on function public.confirm_order_fulfillment_item_v1(uuid,numeric) to authenticated;

create or replace function public.mark_order_fulfillment_shortage_v1(p_item_id uuid,p_shortage_quantity numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_i private.order_fulfillment_items_v1%rowtype; v_f private.order_fulfillment_state_v1%rowtype; v_remaining numeric;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id for update;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id for update;
  if v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;
  v_remaining:=v_i.required_quantity-v_i.picked_quantity-v_i.shortage_quantity-v_i.substitution_quantity;
  if p_shortage_quantity is null or p_shortage_quantity<=0 or p_shortage_quantity>v_remaining+0.0005 then raise exception using errcode='22023',message='INVALID_SHORTAGE_QUANTITY'; end if;
  update private.order_fulfillment_items_v1
  set shortage_quantity=shortage_quantity+p_shortage_quantity,
      status=case when picked_quantity+shortage_quantity+p_shortage_quantity+substitution_quantity>=required_quantity-0.0005 then 'shortage' else 'picking' end,
      note=coalesce(nullif(trim(coalesce(p_note,'')),''),note),
      completed_at=case when picked_quantity+shortage_quantity+p_shortage_quantity+substitution_quantity>=required_quantity-0.0005 then now() else completed_at end,
      updated_by=v_uid,updated_at=now()
  where id=v_i.id returning * into v_i;
  perform private.refresh_order_fulfillment_item_totals_v1(v_i.order_id);
  return jsonb_build_object('ok',true,'line',to_jsonb(v_i)-'metadata');
end;
$function$;
revoke all on function public.mark_order_fulfillment_shortage_v1(uuid,numeric,text) from public,anon;
grant execute on function public.mark_order_fulfillment_shortage_v1(uuid,numeric,text) to authenticated;

do $backfill$
declare r record;
begin
  for r in select order_id from private.order_fulfillment_state_v1 where fulfillment_state not in ('completed','cancelled') loop
    perform private.sync_order_fulfillment_items_v1(r.order_id);
  end loop;
end
$backfill$;
