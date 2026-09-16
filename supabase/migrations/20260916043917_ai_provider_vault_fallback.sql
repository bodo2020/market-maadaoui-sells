create or replace function public.get_ai_provider_secret(p_name text)
returns text
language sql
security invoker
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_name
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_ai_provider_secret(text) from public;
revoke all on function public.get_ai_provider_secret(text) from anon;
revoke all on function public.get_ai_provider_secret(text) from authenticated;
grant execute on function public.get_ai_provider_secret(text) to service_role;
