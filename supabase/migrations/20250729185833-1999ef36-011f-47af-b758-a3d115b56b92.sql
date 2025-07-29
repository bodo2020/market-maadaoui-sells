-- Add new super admin user
INSERT INTO public.users (
  name,
  username,
  password,
  role,
  phone,
  email,
  active
) VALUES (
  'Super Bodo',
  'superbodo',
  '*Bodo2020@16#',
  'super_admin',
  null,
  null,
  true
);