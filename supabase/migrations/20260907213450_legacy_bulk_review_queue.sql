create or replace function public.get_legacy_bulk_review_queue(p_branch_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inventory_branch uuid;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select s.inventory_branch_id
    into v_inventory_branch
  from private.resolve_branch_sources(p_branch_id) s;

  return query
  select jsonb_build_object(
    'id',p.id,
    'name',p.name,
    'barcode',p.barcode,
    'bulk_barcode',p.bulk_barcode,
    'bulk_quantity',p.bulk_quantity,
    'bulk_price',p.bulk_price,
    'quantity',coalesce(i.quantity,0),
    'image_url',p.image_urls[1],
    'issue',case
      when nullif(btrim(p.bulk_barcode),'') is null then 'missing_barcode'
      when exists (
        select 1 from public.products p2
        where p2.id<>p.id and (p2.barcode=p.bulk_barcode or p2.bulk_barcode=p.bulk_barcode)
      ) then 'barcode_conflict'
      when exists (
        select 1 from public.product_variants pv2
        where pv2.parent_product_id<>p.id and (pv2.barcode=p.bulk_barcode or pv2.bulk_barcode=p.bulk_barcode)
      ) then 'barcode_conflict'
      else 'needs_review'
    end
  )
  from public.products p
  join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
  where coalesce(p.bulk_enabled,false)
    and coalesce(p.bulk_quantity,0)>0
    and coalesce(p.bulk_price,0)>0
    and not exists (
      select 1 from public.product_variants pv
      where pv.parent_product_id=p.id and pv.active
    )
  order by
    case when nullif(btrim(p.bulk_barcode),'') is null then 0 else 1 end,
    p.name,p.id;
end;
$function$;

revoke all on function public.get_legacy_bulk_review_queue(uuid) from public,anon;
grant execute on function public.get_legacy_bulk_review_queue(uuid) to authenticated;
