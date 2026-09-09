-- Harden legacy internal/reporting RPCs while preserving guest customer RPCs.

create or replace function public.calculate_branch_needs()
returns table(branch_id uuid, branch_name text, product_id uuid, product_name text, current_quantity integer, min_stock_level integer, needed_quantity integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  return query
  select
    b.id,
    b.name,
    i.product_id,
    p.name,
    i.quantity,
    i.min_stock_level,
    greatest(0, i.min_stock_level - i.quantity)
  from public.inventory i
  join public.branches b on b.id=i.branch_id
  join public.products p on p.id=i.product_id
  where b.category != 'main_hub'
    and i.quantity < i.min_stock_level
    and b.active=true
    and public.staff_has_permission('inventory.reports', i.branch_id)
  order by b.name, greatest(0, i.min_stock_level - i.quantity) desc;
end;
$function$;

create or replace function public.get_branch_performance(p_branch_id uuid, p_start_date date default (current_date - 30), p_end_date date default current_date)
returns table(total_orders bigint, total_revenue numeric, avg_order_value numeric, pending_orders bigint, completed_orders bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not public.staff_has_permission('reports.view', p_branch_id) then
    raise exception using errcode='42501', message='REPORTS_VIEW_DENIED';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using errcode='22023', message='INVALID_DATE_RANGE';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(o.total),0),
    coalesce(avg(o.total),0),
    count(*) filter (where o.status='pending')::bigint,
    count(*) filter (where o.status='delivered')::bigint
  from public.online_orders o
  where o.branch_id=p_branch_id
    and o.created_at::date >= p_start_date
    and o.created_at::date <= p_end_date;
end;
$function$;

create or replace function public.sales_summary_by_branch(p_start timestamptz default null, p_end timestamptz default null)
returns table(branch_id uuid, branch_name text, sales_count bigint, total_sales numeric, total_profit numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    s.branch_id,
    b.name as branch_name,
    count(*) as sales_count,
    coalesce(sum(s.total),0) as total_sales,
    case when public.staff_has_permission('reports.profit', s.branch_id)
         then coalesce(sum(s.profit),0)
         else null::numeric
    end as total_profit
  from public.sales s
  left join public.branches b on b.id=s.branch_id
  where auth.uid() is not null
    and public.staff_has_permission('reports.view', s.branch_id)
    and (p_start is null or s.date >= p_start)
    and (p_end is null or s.date <= p_end)
  group by s.branch_id,b.name
  order by coalesce(sum(s.total),0) desc nulls last;
$function$;

create or replace function public.top_products_by_branch(p_branch uuid default null, p_start timestamptz default null, p_end timestamptz default null, p_limit integer default 10)
returns table(branch_id uuid, branch_name text, product_id uuid, product_name text, qty_sold numeric, total_sales numeric)
language sql
stable
security definer
set search_path to ''
as $function$
  with exploded as (
    select
      s.branch_id,
      (item->'product'->>'id')::uuid as product_id,
      coalesce((item->>'weight')::numeric,(item->>'quantity')::numeric,0) as qty,
      (item->>'total')::numeric as item_total
    from public.sales s
    cross join lateral jsonb_array_elements(s.items::jsonb) as item
    where auth.uid() is not null
      and public.staff_has_permission('reports.view', s.branch_id)
      and (p_branch is null or s.branch_id=p_branch)
      and (p_start is null or s.date >= p_start)
      and (p_end is null or s.date <= p_end)
  )
  select
    e.branch_id,
    b.name as branch_name,
    e.product_id,
    p.name as product_name,
    coalesce(sum(e.qty),0) as qty_sold,
    coalesce(sum(e.item_total),0) as total_sales
  from exploded e
  left join public.products p on p.id=e.product_id
  left join public.branches b on b.id=e.branch_id
  group by e.branch_id,b.name,e.product_id,p.name
  order by coalesce(sum(e.qty),0) desc, coalesce(sum(e.item_total),0) desc
  limit greatest(1,least(coalesce(p_limit,10),100));
$function$;

create or replace function public.initialize_external_branch(p_branch_id uuid, p_branch_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_schema_name text;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not private.staff_is_super_admin(auth.uid()) then
    raise exception using errcode='42501', message='SUPER_ADMIN_REQUIRED';
  end if;
  if p_branch_id is null or nullif(btrim(p_branch_code),'') is null then
    raise exception using errcode='22023', message='INVALID_BRANCH_INPUT';
  end if;
  v_schema_name := public.create_branch_schema(p_branch_id,p_branch_code);
  perform public.setup_branch_tables(v_schema_name);
  return v_schema_name;
end;
$function$;

create or replace function public.get_next_invoice_number(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_branch_code text;
  v_date_prefix text;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not public.staff_has_permission('pos.use',p_branch_id) then
    raise exception using errcode='42501', message='POS_USE_DENIED';
  end if;
  select code into v_branch_code from public.branches where id=p_branch_id and active=true;
  if v_branch_code is null then
    raise exception using errcode='22023', message='BRANCH_NOT_FOUND';
  end if;
  v_date_prefix := to_char(current_date,'YYMMDD');
  select count(*) into v_count from public.sales where branch_id=p_branch_id and date(created_at)=current_date;
  return v_branch_code || '-' || v_date_prefix || '-' || lpad((v_count+1)::text,4,'0');
end;
$function$;

revoke execute on function public.assign_order_to_branch() from public, anon, authenticated;
grant execute on function public.assign_order_to_branch() to service_role;

revoke execute on function public.get_admin_role() from public, anon, authenticated;
grant execute on function public.get_admin_role() to service_role;

revoke execute on function public.get_customer_id_from_user() from public, anon;
grant execute on function public.get_customer_id_from_user() to authenticated, service_role;

revoke execute on function public.is_external_branch(uuid) from public, anon;
grant execute on function public.is_external_branch(uuid) to authenticated, service_role;

revoke execute on function public.calculate_branch_needs() from public, anon;
grant execute on function public.calculate_branch_needs() to authenticated, service_role;
revoke execute on function public.get_branch_performance(uuid,date,date) from public, anon;
grant execute on function public.get_branch_performance(uuid,date,date) to authenticated, service_role;
revoke execute on function public.sales_summary_by_branch(timestamptz,timestamptz) from public, anon;
grant execute on function public.sales_summary_by_branch(timestamptz,timestamptz) to authenticated, service_role;
revoke execute on function public.top_products_by_branch(uuid,timestamptz,timestamptz,integer) from public, anon;
grant execute on function public.top_products_by_branch(uuid,timestamptz,timestamptz,integer) to authenticated, service_role;
revoke execute on function public.initialize_external_branch(uuid,text) from public, anon;
grant execute on function public.initialize_external_branch(uuid,text) to authenticated, service_role;
revoke execute on function public.get_next_invoice_number(uuid) from public, anon;
grant execute on function public.get_next_invoice_number(uuid) to authenticated, service_role;
