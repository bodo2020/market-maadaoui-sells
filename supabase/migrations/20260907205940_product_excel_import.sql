create or replace function public.import_product_rows(
  p_branch_id uuid,
  p_rows jsonb,
  p_mode text default 'upsert'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  x jsonb;
  v_total integer := 0;
  v_success integer := 0;
  v_failed integer := 0;
  v_results jsonb := '[]'::jsonb;
  v_row_number integer;
  v_barcode text;
  v_parent_barcode text;
  v_existing_id uuid;
  v_variant_id uuid;
  v_parent_id uuid;
  v_company_id uuid;
  v_category_id uuid;
  v_subcategory_id uuid;
  v_company_name text;
  v_category_name text;
  v_subcategory_name text;
  v_payload jsonb;
  v_saved jsonb;
  v_message text;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;
  if p_mode not in ('add','update','upsert') then
    raise exception using errcode='22023',message='INVALID_IMPORT_MODE';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then
    raise exception using errcode='22023',message='INVALID_IMPORT_BATCH';
  end if;

  for x in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1;
    v_row_number := coalesce((x->>'row_number')::integer,v_total+1);
    v_barcode := nullif(btrim(x->>'barcode'),'');
    v_parent_barcode := nullif(btrim(x->>'parent_barcode'),'');
    v_existing_id := null;
    v_variant_id := null;
    v_parent_id := null;
    v_company_id := null;
    v_category_id := null;
    v_subcategory_id := null;
    v_message := null;

    begin
      if v_parent_barcode is not null then
        select id into v_parent_id from public.products where barcode=v_parent_barcode limit 1;
        if v_parent_id is null then
          raise exception using errcode='22023',message='PARENT_BARCODE_NOT_FOUND';
        end if;
        if v_barcode is null then
          raise exception using errcode='22023',message='VARIANT_BARCODE_REQUIRED';
        end if;

        select id into v_variant_id
        from public.product_variants
        where barcode=v_barcode or bulk_barcode=v_barcode
        limit 1;

        if p_mode='add' and v_variant_id is not null then
          raise exception using errcode='23505',message='VARIANT_ALREADY_EXISTS';
        end if;
        if p_mode='update' and v_variant_id is null then
          raise exception using errcode='22023',message='VARIANT_NOT_FOUND';
        end if;

        v_payload := jsonb_build_object(
          'name',nullif(btrim(x->>'name'),''),
          'variant_type',coalesce(nullif(btrim(x->>'variant_type'),''),'كرتونة'),
          'price',coalesce((x->>'price')::numeric,0),
          'purchase_price',coalesce((x->>'purchase_price')::numeric,0),
          'conversion_factor',coalesce((x->>'conversion_factor')::numeric,0),
          'barcode',v_barcode,
          'image_url',nullif(btrim(x->>'image_url'),''),
          'active',coalesce((x->>'active')::boolean,true),
          'position',coalesce((x->>'position')::integer,0)
        );

        v_saved := public.save_product_variant(p_branch_id,v_parent_id,v_payload,v_variant_id);
      else
        if v_barcode is not null then
          select id into v_existing_id from public.products where barcode=v_barcode limit 1;
        end if;

        if p_mode='add' and v_existing_id is not null then
          raise exception using errcode='23505',message='PRODUCT_ALREADY_EXISTS';
        end if;
        if p_mode='update' and v_existing_id is null then
          raise exception using errcode='22023',message='PRODUCT_NOT_FOUND';
        end if;

        v_company_name := nullif(btrim(x->>'company'), '');
        v_category_name := nullif(btrim(x->>'category'), '');
        v_subcategory_name := nullif(btrim(x->>'subcategory'), '');

        if v_company_name is not null then
          select id into v_company_id from public.companies where lower(name)=lower(v_company_name) order by created_at limit 1;
          if v_company_id is null then raise exception using errcode='22023',message='COMPANY_NOT_FOUND'; end if;
        end if;
        if v_category_name is not null then
          select id into v_category_id from public.main_categories where lower(name)=lower(v_category_name) order by position,created_at limit 1;
          if v_category_id is null then raise exception using errcode='22023',message='CATEGORY_NOT_FOUND'; end if;
        end if;
        if v_subcategory_name is not null then
          select id into v_subcategory_id
          from public.subcategories
          where lower(name)=lower(v_subcategory_name)
            and (v_category_id is null or category_id=v_category_id)
          order by position,created_at limit 1;
          if v_subcategory_id is null then raise exception using errcode='22023',message='SUBCATEGORY_NOT_FOUND'; end if;
        end if;

        v_payload := jsonb_build_object(
          'name',nullif(btrim(x->>'name'),''),
          'barcode',v_barcode,
          'description',nullif(btrim(x->>'description'),''),
          'price',coalesce((x->>'price')::numeric,0),
          'purchase_price',coalesce((x->>'purchase_price')::numeric,0),
          'offer_price',case when nullif(x->>'offer_price','') is null then null else (x->>'offer_price')::numeric end,
          'is_offer',coalesce((x->>'is_offer')::boolean,false),
          'barcode_type',coalesce(nullif(btrim(x->>'barcode_type'),''),'normal'),
          'unit_of_measure',coalesce(nullif(btrim(x->>'unit_of_measure'),''),'قطعة'),
          'company_id',v_company_id,
          'main_category_id',v_category_id,
          'subcategory_id',v_subcategory_id,
          'shelf_location',nullif(btrim(x->>'shelf_location'),''),
          'expiry_date',nullif(btrim(x->>'expiry_date'),''),
          'track_expiry',coalesce((x->>'track_expiry')::boolean,false),
          'image_urls',case when nullif(btrim(x->>'image_url'),'') is null then '[]'::jsonb else jsonb_build_array(btrim(x->>'image_url')) end
        );

        v_saved := public.save_product_editor(
          p_branch_id,
          v_payload,
          jsonb_build_object(
            'quantity',coalesce((x->>'quantity')::numeric,0),
            'min_stock_level',coalesce((x->>'min_stock_level')::integer,5)
          ),
          jsonb_build_object('enabled',coalesce((x->>'alert_enabled')::boolean,false)),
          v_existing_id
        );
      end if;

      v_success := v_success + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row_number',v_row_number,'status','success','id',v_saved->>'id','name',x->>'name','barcode',v_barcode
      ));
    exception when others then
      v_failed := v_failed + 1;
      v_message := sqlerrm;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'row_number',v_row_number,'status','error','name',x->>'name','barcode',v_barcode,'message',v_message
      ));
    end;
  end loop;

  return jsonb_build_object('total',v_total,'success',v_success,'failed',v_failed,'results',v_results);
end;
$function$;

revoke all on function public.import_product_rows(uuid,jsonb,text) from public,anon;
grant execute on function public.import_product_rows(uuid,jsonb,text) to authenticated;
