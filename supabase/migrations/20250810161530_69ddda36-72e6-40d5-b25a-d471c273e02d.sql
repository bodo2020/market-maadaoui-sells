
-- 1) جدول ربط الفروع بمناطق/أحياء التوصيل
create table if not exists public.branch_neighborhoods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods(id) on delete cascade,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(branch_id, neighborhood_id)
);

alter table public.branch_neighborhoods enable row level security;

-- مُحدّث تلقائي لحقل updated_at (يعيد استخدام الدالة الآمنة الموجودة)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_branch_neighborhoods_updated_at on public.branch_neighborhoods;
create trigger trg_branch_neighborhoods_updated_at
before update on public.branch_neighborhoods
for each row execute function public.update_updated_at_column();

-- سياسات RLS: القراءة للجميع (لاستخدامها في تطبيق العملاء لاحقًا),
-- والإدارة للسوبر أدمن أو من لديه صلاحية على الفرع عبر user_branch_roles
drop policy if exists "Anyone can view branch_neighborhoods" on public.branch_neighborhoods;
create policy "Anyone can view branch_neighborhoods"
on public.branch_neighborhoods
for select
using (true);

drop policy if exists "Admins manage branch_neighborhoods" on public.branch_neighborhoods;
create policy "Admins manage branch_neighborhoods"
on public.branch_neighborhoods
for all
using (public.is_super_admin() or public.has_branch_access(auth.uid(), branch_id))
with check (public.is_super_admin() or public.has_branch_access(auth.uid(), branch_id));

-- فهارس
create index if not exists idx_branch_neighborhoods_branch on public.branch_neighborhoods(branch_id);
create index if not exists idx_branch_neighborhoods_neighborhood on public.branch_neighborhoods(neighborhood_id);

-- 2) دالة ملخّص المبيعات والأرباح لكل فرع (للوحة السوبر أدمن)
create or replace function public.sales_summary_by_branch(
  p_start timestamptz default null,
  p_end   timestamptz default null
)
returns table(
  branch_id uuid,
  branch_name text,
  sales_count bigint,
  total_sales numeric,
  total_profit numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.branch_id,
    b.name as branch_name,
    count(*) as sales_count,
    coalesce(sum(s.total), 0) as total_sales,
    coalesce(sum(s.profit), 0) as total_profit
  from public.sales s
  left join public.branches b on b.id = s.branch_id
  where (p_start is null or s.date >= p_start)
    and (p_end   is null or s.date <= p_end)
  group by s.branch_id, b.name
  order by total_sales desc nulls last;
$$;

-- 3) دالة أكثر المنتجات مبيعًا لكل فرع (تفكيك عناصر الفواتير JSONB)
-- ملاحظة: كمية البيع = الوزن إن وُجد، وإلا العدد. وإجمالي المبيعات من حقل total لكل عنصر.
create or replace function public.top_products_by_branch(
  p_branch uuid default null,
  p_start  timestamptz default null,
  p_end    timestamptz default null,
  p_limit  int default 10
)
returns table(
  branch_id uuid,
  branch_name text,
  product_id uuid,
  product_name text,
  qty_sold numeric,
  total_sales numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with exploded as (
    select
      s.branch_id,
      (item->'product'->>'id')::uuid as product_id,
      coalesce((item->>'weight')::numeric, (item->>'quantity')::numeric, 0) as qty,
      (item->>'total')::numeric as item_total
    from public.sales s
    cross join lateral jsonb_array_elements(s.items::jsonb) as item
    where (p_branch is null or s.branch_id = p_branch)
      and (p_start is null or s.date >= p_start)
      and (p_end   is null or s.date <= p_end)
  )
  select
    e.branch_id,
    b.name as branch_name,
    e.product_id,
    p.name as product_name,
    coalesce(sum(e.qty), 0) as qty_sold,
    coalesce(sum(e.item_total), 0) as total_sales
  from exploded e
  left join public.products p on p.id = e.product_id
  left join public.branches b on b.id = e.branch_id
  group by e.branch_id, b.name, e.product_id, p.name
  order by qty_sold desc, total_sales desc
  limit p_limit;
$$;

-- فهرس مُساعد لاستعلامات لوحة السوبر أدمن
create index if not exists idx_sales_branch_date on public.sales(branch_id, date);
