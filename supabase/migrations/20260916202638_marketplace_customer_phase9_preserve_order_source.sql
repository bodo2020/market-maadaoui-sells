create or replace function private.prepare_online_order_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_settings public.loyalty_settings%rowtype;
  v_eligible numeric;
  v_marketplace boolean := false;
begin
  -- Marketplace orders are deliberately outside the Elmadawy loyalty program in
  -- Phase 9. Preserve their commerce source across automatic status updates.
  if new.merchant_id is not null then
    select exists(
      select 1
      from public.merchants m
      where m.id=new.merchant_id
        and m.merchant_type in ('partner','franchise')
    ) into v_marketplace;
  end if;

  if coalesce(new.source_channel,'online')='marketplace' or v_marketplace then
    new.source_channel := 'marketplace';
    new.loyalty_points_earned := 0;
    return new;
  end if;

  new.source_channel := 'online';
  if new.customer_id is null then
    new.loyalty_points_earned:=0;
    return new;
  end if;

  if old.status is distinct from new.status and new.status::text='delivered' then
    select * into v_settings from public.loyalty_settings where singleton=true;
    v_eligible := greatest(
      coalesce(new.total,0)
      - case when coalesce(v_settings.earn_on_shipping,false) then 0 else coalesce(new.shipping_cost,0) end
      - coalesce(new.loyalty_voucher_amount,0),0
    );
    new.loyalty_points_earned := case when coalesce(v_settings.enabled,false)
      then floor(v_eligible*coalesce(v_settings.points_per_egp,0))::bigint else 0 end;
  end if;
  return new;
end;
$function$;
