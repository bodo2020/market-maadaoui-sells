-- Keep legacy password writes available to authorized admins while preventing
-- authenticated browser clients from reading password hashes back from users.
-- Service-role and postgres retain their existing full-table privileges.

revoke select on table public.users from authenticated;

grant select (
  id,
  name,
  username,
  role,
  phone,
  email,
  active,
  created_at,
  system_role_id
) on table public.users to authenticated;
