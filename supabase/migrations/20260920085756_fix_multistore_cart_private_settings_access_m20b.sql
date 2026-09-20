create or replace function private.customer_cart_branch_is_multistore_eligible_v1(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.branches b
    join private.merchant_delivery_settings_v2 s on s.branch_id=b.id
    where b.id=p_branch_id
      and b.active
      and b.hub_branch_id is not null
      and s.multi_store_enabled
      and s.allow_combined_cart
      and s.delivery_mode in ('elmadawy_fleet','hybrid')
  );
$function$;

revoke all on function private.customer_cart_branch_is_multistore_eligible_v1(uuid) from public, anon;
grant execute on function private.customer_cart_branch_is_multistore_eligible_v1(uuid) to authenticated, service_role;

create or replace function public.replace_customer_cart(p_items jsonb,p_expected_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_customer uuid;
  v_marketplace_merchants integer;
  v_marketplace_branches integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_user_id is distinct from auth.uid() then raise exception 'Session changed' using errcode='42501'; end if;
  select id into strict v_customer from public.customers where user_id=auth.uid();
  perform pg_advisory_xact_lock(hashtextextended(v_customer::text,0));
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>300 then
    raise exception 'Invalid cart' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x)<>'object' or x->>'product_id' is null
      or coalesce(jsonb_typeof(x->'quantity'),'null')<>'number'
      or (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric<>trunc((x->>'quantity')::numeric)
      or coalesce(jsonb_typeof(x->'metadata'),'null')<>'object'
      or coalesce(x->'metadata'->>'source_kind','owned') not in ('owned','marketplace')
  ) then raise exception 'Invalid cart item' using errcode='22023'; end if;
  if exists(
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->'metadata'->>'source_kind','owned')='marketplace'
      and (nullif(x->'metadata'->>'merchant_id','') is null or nullif(x->'metadata'->>'branch_id','') is null or nullif(x->'metadata'->>'listing_id','') is null)
  ) then raise exception 'Marketplace cart source required' using errcode='22023'; end if;

  select count(distinct x->'metadata'->>'merchant_id'),count(distinct x->'metadata'->>'branch_id')
  into v_marketplace_merchants,v_marketplace_branches
  from jsonb_array_elements(p_items) x
  where coalesce(x->'metadata'->>'source_kind','owned')='marketplace';
  if v_marketplace_merchants>2 or v_marketplace_branches>2 then raise exception 'MULTISTORE_LIMIT_EXCEEDED' using errcode='22023'; end if;

  if exists(
    select 1
    from (
      select distinct (x->'metadata'->>'branch_id')::uuid branch_id
      from jsonb_array_elements(p_items) x
      where coalesce(x->'metadata'->>'source_kind','owned')='marketplace'
    ) z
    where not private.customer_cart_branch_is_multistore_eligible_v1(z.branch_id)
  ) then raise exception 'STORE_NOT_MULTISTORE_ELIGIBLE' using errcode='22023'; end if;

  if (
    select count(distinct b.hub_branch_id)
    from (
      select distinct (x->'metadata'->>'branch_id')::uuid branch_id
      from jsonb_array_elements(p_items) x
      where coalesce(x->'metadata'->>'source_kind','owned')='marketplace'
    ) z
    join public.branches b on b.id=z.branch_id
  )>1 then raise exception 'STORE_HUB_MISMATCH' using errcode='22023'; end if;

  delete from public.cart_items where customer_id=v_customer or user_id=auth.uid();
  insert into public.cart_items(customer_id,product_id,quantity,metadata)
  select v_customer,(x->>'product_id')::uuid,(x->>'quantity')::integer,
    jsonb_build_object(
      'is_bulk',coalesce((x->'metadata'->>'is_bulk')::boolean,false),
      'unit_of_measure',nullif(x->'metadata'->>'unit_of_measure',''),
      'source_kind',coalesce(x->'metadata'->>'source_kind','owned'),
      'merchant_id',nullif(x->'metadata'->>'merchant_id',''),
      'merchant_name',nullif(x->'metadata'->>'merchant_name',''),
      'branch_id',nullif(x->'metadata'->>'branch_id',''),
      'branch_name',nullif(x->'metadata'->>'branch_name',''),
      'listing_id',nullif(x->'metadata'->>'listing_id','')
    )
  from jsonb_array_elements(p_items) x;
end;
$function$;

revoke all on function public.replace_customer_cart(jsonb,uuid) from public, anon;
grant execute on function public.replace_customer_cart(jsonb,uuid) to authenticated, service_role;
