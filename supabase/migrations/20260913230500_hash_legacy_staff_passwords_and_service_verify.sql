-- Legacy staff credentials must never remain as plaintext in public.users.
-- Existing legacy values are upgraded to bcrypt; future writes are hashed by a
-- trigger. Only the service-role migration Edge Function may verify them.

create or replace function private.hash_staff_legacy_password_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.password is null or new.password = '' then
    return new;
  end if;

  if new.password like '__migrated__:%' or new.password like '$2%' then
    return new;
  end if;

  new.password := extensions.crypt(new.password, extensions.gen_salt('bf', 10));
  return new;
end;
$$;

revoke all on function private.hash_staff_legacy_password_v1() from public, anon, authenticated;
grant execute on function private.hash_staff_legacy_password_v1() to service_role;

drop trigger if exists users_hash_legacy_staff_password_v1 on public.users;
create trigger users_hash_legacy_staff_password_v1
before insert or update of password on public.users
for each row execute function private.hash_staff_legacy_password_v1();

update public.users
set password = extensions.crypt(password, extensions.gen_salt('bf', 10))
where password is not null
  and password <> ''
  and password not like '__migrated__:%'
  and password not like '$2%';

create or replace function public.verify_legacy_staff_password_v1(
  p_user_id uuid,
  p_password text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.users u
    where u.id = p_user_id
      and coalesce(u.active, true)
      and u.password like '$2%'
      and extensions.crypt(coalesce(p_password, ''), u.password) = u.password
  );
$$;

revoke all on function public.verify_legacy_staff_password_v1(uuid,text) from public, anon, authenticated;
grant execute on function public.verify_legacy_staff_password_v1(uuid,text) to service_role;
