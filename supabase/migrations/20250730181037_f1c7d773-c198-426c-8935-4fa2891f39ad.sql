-- إصلاح آخر function ليحتوي على search_path
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE 
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid();
$function$;