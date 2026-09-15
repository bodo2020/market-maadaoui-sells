-- Elmadawy AI Core - Milestone 1. Additive only: settings, audit logs and read-only tools.

create table if not exists public.ai_runtime_settings (
  scope text primary key check (scope = 'global'),
  enabled boolean not null default false,
  primary_provider text not null default 'gemini' check (primary_provider in ('gemini','groq')),
  primary_model text not null default 'gemini-2.5-flash',
  fallback_provider text check (fallback_provider in ('gemini','groq')),
  fallback_model text,
  timeout_ms integer not null default 20000 check (timeout_ms between 5000 and 60000),
  max_output_tokens integer not null default 800 check (max_output_tokens between 128 and 4096),
  auto_reply_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.ai_runtime_settings(scope,enabled,primary_provider,primary_model,fallback_provider,fallback_model,auto_reply_enabled)
values ('global',false,'gemini','gemini-2.5-flash','groq','openai/gpt-oss-120b',false)
on conflict (scope) do nothing;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  created_by uuid not null references auth.users(id),
  channel text not null default 'admin_sandbox',
  assistant text not null default 'admin_copilot',
  status text not null default 'active' check (status in ('active','closed','handed_off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text not null,
  provider text,
  model text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  branch_id uuid not null references public.branches(id),
  tool_name text not null,
  risk_level text not null check (risk_level in ('read','low_risk_action','approval_required','forbidden')),
  arguments jsonb not null default '{}'::jsonb,
  result_summary jsonb,
  status text not null check (status in ('success','error','denied')),
  duration_ms integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_logs (
  id bigint generated always as identity primary key,
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id uuid not null references auth.users(id),
  branch_id uuid not null references public.branches(id),
  provider text not null,
  model text not null,
  fallback_used boolean not null default false,
  status text not null check (status in ('success','error')),
  latency_ms integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_branch_updated_idx on public.ai_conversations(branch_id,updated_at desc);
create index if not exists ai_messages_conversation_created_idx on public.ai_messages(conversation_id,created_at);
create index if not exists ai_tool_calls_branch_created_idx on public.ai_tool_calls(branch_id,created_at desc);
create index if not exists ai_usage_logs_branch_created_idx on public.ai_usage_logs(branch_id,created_at desc);

alter table public.ai_runtime_settings enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_tool_calls enable row level security;
alter table public.ai_usage_logs enable row level security;

drop policy if exists ai_runtime_settings_super_admin_read on public.ai_runtime_settings;
create policy ai_runtime_settings_super_admin_read on public.ai_runtime_settings for select to authenticated using (private.staff_is_super_admin(auth.uid()));
drop policy if exists ai_runtime_settings_super_admin_write on public.ai_runtime_settings;
create policy ai_runtime_settings_super_admin_write on public.ai_runtime_settings for update to authenticated using (private.staff_is_super_admin(auth.uid())) with check (private.staff_is_super_admin(auth.uid()));

drop policy if exists ai_conversations_owner_read on public.ai_conversations;
create policy ai_conversations_owner_read on public.ai_conversations for select to authenticated using (created_by=auth.uid() and public.has_branch_access(auth.uid(),branch_id));
drop policy if exists ai_messages_owner_read on public.ai_messages;
create policy ai_messages_owner_read on public.ai_messages for select to authenticated using (exists(select 1 from public.ai_conversations c where c.id=conversation_id and c.created_by=auth.uid() and public.has_branch_access(auth.uid(),c.branch_id)));
drop policy if exists ai_tool_calls_owner_read on public.ai_tool_calls;
create policy ai_tool_calls_owner_read on public.ai_tool_calls for select to authenticated using (user_id=auth.uid() and public.has_branch_access(auth.uid(),branch_id));
drop policy if exists ai_usage_logs_owner_read on public.ai_usage_logs;
create policy ai_usage_logs_owner_read on public.ai_usage_logs for select to authenticated using (user_id=auth.uid() and public.has_branch_access(auth.uid(),branch_id));

create or replace function public.ai_assert_access_v1(p_branch_id uuid)
returns boolean language sql stable security invoker set search_path='' as $$
  select auth.uid() is not null and public.has_branch_access(auth.uid(),p_branch_id) and (
    public.staff_has_permission('reports.view',p_branch_id)
    or public.staff_has_permission('products.view',p_branch_id)
    or public.staff_has_permission('inventory.view',p_branch_id)
    or public.staff_has_permission('online_orders.view',p_branch_id)
  );
$$;

create or replace function private.ai_catalog_search_impl_v1(p_branch_id uuid,p_query text default null,p_only_offers boolean default false,p_limit integer default 8)
returns setof jsonb language plpgsql stable security definer set search_path='' as $$
declare v_inventory_branch uuid; v_pricing_branch uuid;
begin
  if not public.ai_assert_access_v1(p_branch_id) then raise exception using errcode='42501',message='AI_ACCESS_DENIED'; end if;
  select inventory_branch_id,pricing_branch_id into v_inventory_branch,v_pricing_branch from private.resolve_branch_sources(p_branch_id);
  return query
  select jsonb_build_object(
    'id',p.id,'name',p.name,'barcode',p.barcode,'unit',p.unit_of_measure,
    'price',coalesce(bp.sale_price,p.price),
    'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
    'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
    'quantity',coalesce(i.quantity,0),
    'stock_status',case when coalesce(i.quantity,0)<=0 then 'out' when coalesce(i.quantity,0)<=coalesce(i.min_stock_level,5) then 'low' else 'in' end
  )
  from public.products p
  join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
  left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
  where (p_query is null or btrim(p_query)='' or p.name ilike '%'||btrim(p_query)||'%' or p.barcode ilike '%'||btrim(p_query)||'%')
    and (not p_only_offers or (case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end))
  order by case when p_query is not null and lower(p.name)=lower(btrim(p_query)) then 0 else 1 end,p.name
  limit greatest(1,least(coalesce(p_limit,8),30));
end $$;

create or replace function private.ai_get_order_status_impl_v1(p_branch_id uuid,p_order_ref text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.online_orders%rowtype;
begin
  if not public.ai_assert_access_v1(p_branch_id) or not (public.staff_has_permission('online_orders.view',p_branch_id) or public.staff_has_permission('online_orders.manage',p_branch_id)) then raise exception using errcode='42501',message='ORDER_ACCESS_DENIED'; end if;
  select * into v_order from public.online_orders where branch_id=p_branch_id and (id::text=btrim(p_order_ref) or tracking_number=btrim(p_order_ref)) limit 1;
  if v_order.id is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'id',v_order.id,'tracking_number',v_order.tracking_number,'status',v_order.status,'payment_status',v_order.payment_status,'total',v_order.total,'created_at',v_order.created_at,'updated_at',v_order.updated_at);
end $$;

create or replace function private.ai_get_branch_info_impl_v1(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if not public.ai_assert_access_v1(p_branch_id) then raise exception using errcode='42501',message='AI_ACCESS_DENIED'; end if;
  select jsonb_build_object('id',id,'name',name,'code',code,'active',active) into v_result from public.branches where id=p_branch_id;
  return coalesce(v_result,jsonb_build_object('found',false));
end $$;

create or replace function public.ai_catalog_search_v1(p_branch_id uuid,p_query text default null,p_only_offers boolean default false,p_limit integer default 8)
returns setof jsonb language sql stable security definer set search_path='' as $$
  select * from private.ai_catalog_search_impl_v1(p_branch_id,p_query,p_only_offers,p_limit);
$$;

create or replace function public.ai_get_order_status_v1(p_branch_id uuid,p_order_ref text)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.ai_get_order_status_impl_v1(p_branch_id,p_order_ref);
$$;

create or replace function public.ai_get_branch_info_v1(p_branch_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select private.ai_get_branch_info_impl_v1(p_branch_id);
$$;

revoke all on function public.ai_assert_access_v1(uuid) from public,anon;
revoke all on function public.ai_catalog_search_v1(uuid,text,boolean,integer) from public,anon;
revoke all on function public.ai_get_order_status_v1(uuid,text) from public,anon;
revoke all on function public.ai_get_branch_info_v1(uuid) from public,anon;
grant execute on function public.ai_assert_access_v1(uuid) to authenticated;
grant execute on function public.ai_catalog_search_v1(uuid,text,boolean,integer) to authenticated;
grant execute on function public.ai_get_order_status_v1(uuid,text) to authenticated;
grant execute on function public.ai_get_branch_info_v1(uuid) to authenticated;

revoke all on function private.ai_catalog_search_impl_v1(uuid,text,boolean,integer) from public,anon,authenticated;
revoke all on function private.ai_get_order_status_impl_v1(uuid,text) from public,anon,authenticated;
revoke all on function private.ai_get_branch_info_impl_v1(uuid) from public,anon,authenticated;

revoke all on table public.ai_runtime_settings,public.ai_conversations,public.ai_messages,public.ai_tool_calls,public.ai_usage_logs from anon;
grant select,update on public.ai_runtime_settings to authenticated;
grant select on public.ai_conversations,public.ai_messages,public.ai_tool_calls,public.ai_usage_logs to authenticated;
