-- Elmadawy AI Core - Milestone 1. Additive only: settings, audit logs and read-only tools.

create table if not exists public.ai_runtime_settings (
  scope text primary key check (scope = 'global'),
  enabled boolean not null default false,
  primary_provider text not null default 'gemini' check (primary_provider in ('gemini','groq','openrouter')),
  primary_model text not null default 'gemini-2.5-flash',
  fallback_provider text check (fallback_provider in ('gemini','groq','openrouter')),
  fallback_model text,
  tertiary_provider text check (tertiary_provider in ('gemini','groq','openrouter')),
  tertiary_model text,
  timeout_ms integer not null default 20000 check (timeout_ms between 5000 and 60000),
  max_output_tokens integer not null default 800 check (max_output_tokens between 128 and 4096),
  auto_reply_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.ai_runtime_settings(
  scope,enabled,primary_provider,primary_model,fallback_provider,fallback_model,tertiary_provider,tertiary_model,auto_reply_enabled
)
values (
  'global',false,'gemini','gemini-2.5-flash','groq','openai/gpt-oss-120b','openrouter','openrouter/auto',false
)
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

revoke all on table public.ai_runtime_settings,public.ai_conversations,public.ai_messages,public.ai_tool_calls,public.ai_usage_logs from anon;
grant select,update on public.ai_runtime_settings to authenticated;
grant select on public.ai_conversations,public.ai_messages,public.ai_tool_calls,public.ai_usage_logs to authenticated;
