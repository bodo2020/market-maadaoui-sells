-- تحديث المستخدم الحالي ليصبح super admin
UPDATE public.users 
SET role = 'super_admin' 
WHERE id = '1386d756-cecb-47c3-a9b6-ad6c5afd41b5';