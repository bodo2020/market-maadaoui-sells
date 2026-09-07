-- Linked sale units are stored in product_variants. Each unit can have its own
-- display name, image, barcode and package price while inventory remains on the
-- base product referenced by parent_product_id.

drop policy if exists "Allow all operations for product_variants" on public.product_variants;
drop policy if exists "Anyone can view product variants" on public.product_variants;
create policy "Anyone can view product variants"
on public.product_variants for select
to anon, authenticated
using (true);

revoke insert, update, delete on public.product_variants from anon, authenticated;
grant select on public.product_variants to anon, authenticated;

create or replace function public.save_product_variant(
  p_branch_id uuid,
  p_parent_product_id uuid,
  p_variant jsonb,
  p_variant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_parent public.products%rowtype;
  v_saved public.product_variants%rowtype;
  v_name text := nullif(btrim(p_variant->>'name'),'');
  v_type text := coalesce(nullif(btrim(p_variant->>'variant_type'),''),'جملة');
  v_barcode text := nullif(btrim(p_variant->>'barcode'),'');
  v_bulk_barcode text := nullif(btrim(p_variant->>'bulk_barcode'),'');
  v_image_url text := nullif(btrim(p_variant->>'image_url'),'');
  v_price numeric := coalesce((p_variant->>'price')::numeric,0);
  v_purchase numeric := coalesce((p_variant->>'purchase_price')::numeric,0);
  v_factor numeric := coalesce((p_variant->>'conversion_factor')::numeric,0);
  v_active boolean := coalesce((p_variant->>'active')::boolean,true);
  v_position integer := coalesce((p_variant->>'position')::integer,0);
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select * into v_parent from public.products where id=p_parent_product_id;
  if v_parent.id is null then
    raise exception using errcode='22023',message='PARENT_PRODUCT_NOT_FOUND';
  end if;

  if v_name is null or v_price<=0 or v_purchase<0 or v_factor<=1 or round(v_factor,3)<>v_factor then
    raise exception using errcode='22023',message='INVALID_VARIANT';
  end if;

  if v_barcode is null and v_bulk_barcode is null then
    raise exception using errcode='22023',message='VARIANT_BARCODE_REQUIRED';
  end if;

  if exists (
    select 1 from public.products p
    where (v_barcode is not null and (p.barcode=v_barcode or p.bulk_barcode=v_barcode))
       or (v_bulk_barcode is not null and (p.barcode=v_bulk_barcode or p.bulk_barcode=v_bulk_barcode))
  ) or exists (
    select 1 from public.product_variants pv
    where (p_variant_id is null or pv.id<>p_variant_id)
      and (
        (v_barcode is not null and (pv.barcode=v_barcode or pv.bulk_barcode=v_barcode))
        or (v_bulk_barcode is not null and (pv.barcode=v_bulk_barcode or pv.bulk_barcode=v_bulk_barcode))
      )
  ) then
    raise exception using errcode='23505',message='BARCODE_ALREADY_EXISTS';
  end if;

  if p_variant_id is null then
    insert into public.product_variants(
      parent_product_id,name,variant_type,price,purchase_price,conversion_factor,
      barcode,bulk_barcode,image_url,active,position
    ) values (
      p_parent_product_id,v_name,v_type,v_price,v_purchase,v_factor,
      v_barcode,v_bulk_barcode,v_image_url,v_active,v_position
    ) returning * into v_saved;
  else
    update public.product_variants
       set name=v_name,
           variant_type=v_type,
           price=v_price,
           purchase_price=v_purchase,
           conversion_factor=v_factor,
           barcode=v_barcode,
           bulk_barcode=v_bulk_barcode,
           image_url=v_image_url,
           active=v_active,
           position=v_position,
           updated_at=now()
     where id=p_variant_id and parent_product_id=p_parent_product_id
     returning * into v_saved;
    if v_saved.id is null then
      raise exception using errcode='22023',message='VARIANT_NOT_FOUND';
    end if;
  end if;

  update public.products set has_variants=true,updated_at=now() where id=p_parent_product_id;
  return to_jsonb(v_saved);
end;
$function$;

revoke all on function public.save_product_variant(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_product_variant(uuid,uuid,jsonb,uuid) to authenticated;
