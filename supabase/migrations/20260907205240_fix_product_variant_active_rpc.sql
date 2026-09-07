create or replace function public.set_product_variant_active(
  p_branch_id uuid,
  p_variant_id uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_saved public.product_variants%rowtype;
  v_parent_id uuid;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  update public.product_variants
     set active=coalesce(p_active,false),updated_at=now()
   where id=p_variant_id
   returning * into v_saved;

  if v_saved.id is null then
    raise exception using errcode='22023',message='VARIANT_NOT_FOUND';
  end if;

  v_parent_id := v_saved.parent_product_id;
  update public.products p
     set has_variants=exists(
       select 1 from public.product_variants pv
       where pv.parent_product_id=v_parent_id and pv.active
     ),
     updated_at=now()
   where p.id=v_parent_id;

  return to_jsonb(v_saved);
end;
$function$;

revoke all on function public.set_product_variant_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_product_variant_active(uuid,uuid,boolean) to authenticated;
