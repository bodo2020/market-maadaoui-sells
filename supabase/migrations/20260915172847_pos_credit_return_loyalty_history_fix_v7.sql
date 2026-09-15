do $migration$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_pos_sale_return_v7'
  limit 1;

  if v_def is null then raise exception 'create_pos_sale_return_v7 not found'; end if;

  v_new:=replace(
    v_def,
    'where customer_id=v_sale.customer_id and entry_type=''reversal'' and metadata->>''sale_id''=v_sale.id::text;',
    'where customer_id=v_sale.customer_id and entry_type=''reversal'' and source_type=''pos_return'' and metadata->>''sale_id''=v_sale.id::text;'
  );

  if v_new=v_def then raise exception 'expected loyalty reversal clause not found'; end if;
  execute v_new;
end;
$migration$;

comment on function public.create_pos_sale_return_v7(uuid,uuid,uuid,text,jsonb,text) is 'POS return V7: partial-credit returns reduce credit first, then refund paid methods. Customer return point reversals count only prior pos_return reversals; historical credit-policy reversals are excluded.';