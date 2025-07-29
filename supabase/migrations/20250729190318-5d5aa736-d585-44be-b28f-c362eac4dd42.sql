-- Add new admin user
INSERT INTO public.users (
  name,
  username,
  password,
  role,
  phone,
  email,
  active
) VALUES (
  'Admin Bodo',
  'adminbodo',
  '*Bodo2020@16#',
  'admin',
  null,
  null,
  true
);