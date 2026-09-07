create table if not exists public.pos_invoice_counters (
  branch_id uuid not null references public.branches(id) on delete cascade,
  business_date date not null,
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, business_date)
);

alter table public.pos_invoice_counters enable row level security;
revoke all on public.pos_invoice_counters from anon, authenticated;

create unique index if not exists sales_branch_invoice_number_uidx
  on public.sales(branch_id, invoice_number)
  where invoice_number is not null;

create or replace function private.next_pos_invoice_number(p_branch_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_date date := timezone('Africa/Cairo', now())::date;
  v_number bigint;
  v_existing bigint;
  v_code text;
begin
  select b.code into v_code from public.branches b where b.id = p_branch_id;
  if v_code is null then raise exception using errcode='22023', message='BRANCH_NOT_FOUND'; end if;

  insert into public.pos_invoice_counters(branch_id, business_date, last_number)
  values (p_branch_id, v_date, 0)
  on conflict (branch_id, business_date) do nothing;

  select coalesce(max(case when s.invoice_number ~ '-[0-9]+$' then substring(s.invoice_number from '([0-9]+)$')::bigint else 0 end), 0)
  into v_existing
  from public.sales s
  where s.branch_id = p_branch_id and timezone('Africa/Cairo', s.date)::date = v_date;

  update public.pos_invoice_counters c
  set last_number = greatest(c.last_number, v_existing) + 1, updated_at = now()
  where c.branch_id = p_branch_id and c.business_date = v_date
  returning c.last_number into v_number;

  return v_code || '-' || to_char(v_date, 'YYMMDD') || '-' || case when v_number < 10000 then lpad(v_number::text, 4, '0') else v_number::text end;
end;
$function$;
