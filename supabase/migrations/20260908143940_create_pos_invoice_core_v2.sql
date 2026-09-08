create table if not exists public.pos_invoices (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null unique references public.sales(id) on delete restrict,
  branch_id uuid not null,
  invoice_number text not null,
  sale_date timestamptz not null,
  cashier_id uuid,
  cashier_name text,
  shift_id uuid,
  device_id uuid,
  customer_id uuid,
  customer_name text,
  customer_phone text,
  source_channel text not null default 'store',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  total numeric not null default 0,
  profit numeric not null default 0,
  cash_amount numeric not null default 0,
  card_amount numeric not null default 0,
  loyalty_points_earned bigint not null default 0,
  loyalty_voucher_id uuid,
  loyalty_voucher_amount numeric not null default 0,
  payment_method text not null default 'cash',
  payment_method_id uuid,
  payment_method_code text,
  payment_method_name text,
  payment_method_type text,
  payment_fee_amount numeric not null default 0,
  payment_fee_bearer text,
  customer_payment_fee_amount numeric not null default 0,
  merchant_payment_fee_amount numeric not null default 0,
  amount_charged numeric not null default 0,
  digital_wallet_amount numeric not null default 0,
  net_profit_after_payment_fee numeric,
  payment_reference text,
  item_count integer not null default 0,
  snapshot_created_at timestamptz not null default now(),
  constraint pos_invoices_branch_invoice_unique unique(branch_id, invoice_number),
  constraint pos_invoices_item_count_nonnegative check (item_count >= 0)
);

create table if not exists public.pos_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.pos_invoices(id) on delete restrict,
  line_no integer not null,
  product_id uuid,
  product_name text not null,
  barcode text,
  quantity numeric not null default 0,
  weight numeric,
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  line_total numeric not null default 0,
  sale_mode text not null default 'unit',
  unit_of_measure text,
  purchase_price numeric,
  created_at timestamptz not null default now(),
  constraint pos_invoice_items_invoice_line_unique unique(invoice_id, line_no),
  constraint pos_invoice_items_line_no_positive check (line_no > 0),
  constraint pos_invoice_items_sale_mode_valid check (sale_mode in ('unit','weight','bulk'))
);

create index if not exists pos_invoices_branch_date_idx on public.pos_invoices(branch_id, sale_date desc);
create index if not exists pos_invoices_cashier_date_idx on public.pos_invoices(cashier_id, sale_date desc);
create index if not exists pos_invoices_customer_date_idx on public.pos_invoices(customer_id, sale_date desc) where customer_id is not null;
create index if not exists pos_invoice_items_product_idx on public.pos_invoice_items(product_id) where product_id is not null;

alter table public.pos_invoices enable row level security;
alter table public.pos_invoice_items enable row level security;
revoke all on table public.pos_invoices from anon, authenticated;
revoke all on table public.pos_invoice_items from anon, authenticated;
grant select on table public.pos_invoices to authenticated;
grant select on table public.pos_invoice_items to authenticated;

drop policy if exists "POS invoice snapshots are readable by authorized staff" on public.pos_invoices;
create policy "POS invoice snapshots are readable by authorized staff"
on public.pos_invoices for select to authenticated
using (
  (select auth.uid()) is not null
  and public.has_branch_access((select auth.uid()), branch_id)
  and (cashier_id = (select auth.uid()) or public.staff_has_permission('sales.view', branch_id))
);

drop policy if exists "POS invoice item snapshots follow invoice access" on public.pos_invoice_items;
create policy "POS invoice item snapshots follow invoice access"
on public.pos_invoice_items for select to authenticated
using (exists (select 1 from public.pos_invoices i where i.id = invoice_id));

create or replace function private.capture_pos_invoice_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invoice_id uuid;
  v_payment_type text;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' or new.branch_id is null then return new; end if;

  if new.payment_method_id is not null then
    select pm.method_type into v_payment_type
    from public.pos_payment_methods pm
    where pm.id = new.payment_method_id;
  end if;

  insert into public.pos_invoices (
    sale_id, branch_id, invoice_number, sale_date, cashier_id, cashier_name, shift_id, device_id,
    customer_id, customer_name, customer_phone, source_channel, subtotal, discount, total, profit,
    cash_amount, card_amount, loyalty_points_earned, loyalty_voucher_id, loyalty_voucher_amount,
    payment_method, payment_method_id, payment_method_code, payment_method_name, payment_method_type,
    payment_fee_amount, payment_fee_bearer, customer_payment_fee_amount, merchant_payment_fee_amount,
    amount_charged, digital_wallet_amount, net_profit_after_payment_fee, payment_reference, item_count
  ) values (
    new.id, new.branch_id, new.invoice_number, new.date, new.cashier_id, new.cashier_name, new.shift_id, new.device_id,
    new.customer_id, new.customer_name, new.customer_phone, coalesce(new.source_channel,'store'),
    coalesce(new.subtotal,0), coalesce(new.discount,0), coalesce(new.total,0), coalesce(new.profit,0),
    coalesce(new.cash_amount,0), coalesce(new.card_amount,0), coalesce(new.loyalty_points_earned,0),
    new.loyalty_voucher_id, coalesce(new.loyalty_voucher_amount,0), coalesce(new.payment_method,'cash'),
    new.payment_method_id, new.payment_method_code, new.payment_method_name, v_payment_type,
    coalesce(new.payment_fee_amount,0), new.payment_fee_bearer, coalesce(new.customer_payment_fee_amount,0),
    coalesce(new.merchant_payment_fee_amount,0), coalesce(new.amount_charged,new.total,0),
    coalesce(new.digital_wallet_amount,0), new.net_profit_after_payment_fee, new.payment_reference,
    jsonb_array_length(coalesce(new.items,'[]'::jsonb))
  ) on conflict (sale_id) do nothing returning id into v_invoice_id;

  if v_invoice_id is null then select i.id into v_invoice_id from public.pos_invoices i where i.sale_id = new.id; end if;

  insert into public.pos_invoice_items (
    invoice_id, line_no, product_id, product_name, barcode, quantity, weight, unit_price, discount,
    line_total, sale_mode, unit_of_measure, purchase_price
  )
  select v_invoice_id, e.ord::integer, nullif(e.item #>> '{product,id}','')::uuid,
    coalesce(nullif(e.item #>> '{product,name}',''),'صنف'), nullif(e.item #>> '{product,barcode}',''),
    coalesce(nullif(e.item->>'quantity','')::numeric,0), nullif(e.item->>'weight','')::numeric,
    coalesce(nullif(e.item->>'price','')::numeric,0), coalesce(nullif(e.item->>'discount','')::numeric,0),
    coalesce(nullif(e.item->>'total','')::numeric,0),
    case when nullif(e.item->>'weight','') is not null then 'weight'
         when coalesce((e.item->>'isBulk')::boolean,false) then 'bulk' else 'unit' end,
    coalesce(nullif(e.item #>> '{product,unit_of_measure}',''), nullif(e.item #>> '{product,base_unit}','')),
    nullif(e.item #>> '{product,purchase_price}','')::numeric
  from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) with ordinality as e(item, ord)
  on conflict (invoice_id, line_no) do nothing;

  return new;
end;
$function$;
revoke execute on function private.capture_pos_invoice_snapshot() from public, anon, authenticated;

drop trigger if exists zz_capture_pos_invoice_snapshot on public.sales;
create trigger zz_capture_pos_invoice_snapshot after insert on public.sales
for each row execute function private.capture_pos_invoice_snapshot();

insert into public.pos_invoices (
  sale_id, branch_id, invoice_number, sale_date, cashier_id, cashier_name, shift_id, device_id,
  customer_id, customer_name, customer_phone, source_channel, subtotal, discount, total, profit,
  cash_amount, card_amount, loyalty_points_earned, loyalty_voucher_id, loyalty_voucher_amount,
  payment_method, payment_method_id, payment_method_code, payment_method_name, payment_method_type,
  payment_fee_amount, payment_fee_bearer, customer_payment_fee_amount, merchant_payment_fee_amount,
  amount_charged, digital_wallet_amount, net_profit_after_payment_fee, payment_reference, item_count
)
select s.id, s.branch_id, s.invoice_number, s.date, s.cashier_id, s.cashier_name, s.shift_id, s.device_id,
  s.customer_id, s.customer_name, s.customer_phone, coalesce(s.source_channel,'store'),
  coalesce(s.subtotal,0), coalesce(s.discount,0), coalesce(s.total,0), coalesce(s.profit,0),
  coalesce(s.cash_amount,0), coalesce(s.card_amount,0), coalesce(s.loyalty_points_earned,0),
  s.loyalty_voucher_id, coalesce(s.loyalty_voucher_amount,0), coalesce(s.payment_method,'cash'),
  s.payment_method_id, s.payment_method_code, s.payment_method_name, pm.method_type,
  coalesce(s.payment_fee_amount,0), s.payment_fee_bearer, coalesce(s.customer_payment_fee_amount,0),
  coalesce(s.merchant_payment_fee_amount,0), coalesce(s.amount_charged,s.total,0),
  coalesce(s.digital_wallet_amount,0), s.net_profit_after_payment_fee, s.payment_reference,
  jsonb_array_length(coalesce(s.items,'[]'::jsonb))
from public.sales s left join public.pos_payment_methods pm on pm.id = s.payment_method_id
where s.branch_id is not null and s.invoice_number is not null and btrim(s.invoice_number) <> ''
on conflict (sale_id) do nothing;

insert into public.pos_invoice_items (
  invoice_id, line_no, product_id, product_name, barcode, quantity, weight, unit_price, discount,
  line_total, sale_mode, unit_of_measure, purchase_price
)
select i.id, e.ord::integer, nullif(e.item #>> '{product,id}','')::uuid,
  coalesce(nullif(e.item #>> '{product,name}',''),'صنف'), nullif(e.item #>> '{product,barcode}',''),
  coalesce(nullif(e.item->>'quantity','')::numeric,0), nullif(e.item->>'weight','')::numeric,
  coalesce(nullif(e.item->>'price','')::numeric,0), coalesce(nullif(e.item->>'discount','')::numeric,0),
  coalesce(nullif(e.item->>'total','')::numeric,0),
  case when nullif(e.item->>'weight','') is not null then 'weight'
       when coalesce((e.item->>'isBulk')::boolean,false) then 'bulk' else 'unit' end,
  coalesce(nullif(e.item #>> '{product,unit_of_measure}',''), nullif(e.item #>> '{product,base_unit}','')),
  nullif(e.item #>> '{product,purchase_price}','')::numeric
from public.sales s join public.pos_invoices i on i.sale_id = s.id
cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) with ordinality as e(item, ord)
on conflict (invoice_id, line_no) do nothing;

create or replace function public.list_pos_invoices_v2(p_branch_id uuid, p_limit integer default 30, p_search text default null)
returns jsonb language sql stable security invoker set search_path = '' as $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_date desc), '[]'::jsonb)
  from (
    select i.id as invoice_id, i.sale_id, i.invoice_number, i.sale_date, i.cashier_id, i.cashier_name,
      i.customer_id, i.customer_name, i.customer_phone, i.subtotal, i.discount, i.total,
      i.loyalty_voucher_amount, i.amount_charged, i.payment_method, i.payment_method_id,
      i.payment_method_code, i.payment_method_name, i.payment_method_type, i.payment_fee_amount,
      i.customer_payment_fee_amount, i.merchant_payment_fee_amount, i.payment_reference, i.item_count,
      coalesce((select sum(r.total_amount) from public.returns r where r.sale_id=i.sale_id and r.status<>'rejected'),0) as returned_amount,
      coalesce((select count(*) from public.returns r where r.sale_id=i.sale_id and r.status<>'rejected'),0) as return_count,
      coalesce((select count(*) from public.returns r where r.sale_id=i.sale_id and r.status<>'rejected' and r.refund_status in ('pending','pending_card','pending_provider','pending_electronic')),0) as pending_refund_count
    from public.pos_invoices i
    where i.branch_id=p_branch_id and (
      nullif(btrim(coalesce(p_search,'')),'') is null
      or i.invoice_number ilike '%'||btrim(p_search)||'%'
      or coalesce(i.customer_name,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(i.customer_phone,'') ilike '%'||btrim(p_search)||'%'
      or coalesce(i.payment_reference,'') ilike '%'||btrim(p_search)||'%'
    )
    order by i.sale_date desc
    limit greatest(1,least(coalesce(p_limit,30),100))
  ) x;
$function$;
revoke execute on function public.list_pos_invoices_v2(uuid,integer,text) from public, anon;
grant execute on function public.list_pos_invoices_v2(uuid,integer,text) to authenticated;

create or replace function public.get_pos_invoice_snapshot(p_sale_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $function$
declare
  v_invoice public.pos_invoices%rowtype;
  v_items jsonb;
  v_returns jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  select * into v_invoice from public.pos_invoices i where i.sale_id=p_sale_id;
  if v_invoice.id is null then raise exception using errcode='42501', message='INVOICE_NOT_FOUND_OR_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(to_jsonb(ii) order by ii.line_no),'[]'::jsonb) into v_items
  from public.pos_invoice_items ii where ii.invoice_id=v_invoice.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'total_amount',r.total_amount,'status',r.status,'refund_status',r.refund_status,
    'refund_cash_amount',r.refund_cash_amount,'refund_card_amount',r.refund_card_amount,
    'refund_loyalty_amount',r.refund_loyalty_amount,'reason',r.reason,'created_at',r.created_at
  ) order by r.created_at desc),'[]'::jsonb) into v_returns
  from public.returns r where r.sale_id=p_sale_id and r.status<>'rejected';
  return jsonb_build_object('invoice',to_jsonb(v_invoice),'items',v_items,'returns',v_returns);
end;
$function$;
revoke execute on function public.get_pos_invoice_snapshot(uuid) from public, anon;
grant execute on function public.get_pos_invoice_snapshot(uuid) to authenticated;