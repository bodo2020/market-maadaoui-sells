-- إضافة الـ policies المفقودة لإصلاح التحذيرات الأمنية

-- إضافة policies لجدول purchase_items
CREATE POLICY "Users can manage purchase items" 
ON public.purchase_items 
FOR ALL 
USING (
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  ))
);

CREATE POLICY "Users can view purchase items" 
ON public.purchase_items 
FOR SELECT 
USING (true);

-- إضافة policies لجدول purchases  
CREATE POLICY "Users can manage purchases" 
ON public.purchases 
FOR ALL 
USING (
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  ))
);

CREATE POLICY "Users can view purchases" 
ON public.purchases 
FOR SELECT 
USING (true);

-- تحديث functions لتتضمن search_path
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN (
    SELECT role = 'admin' 
    FROM public.users 
    WHERE id = auth.uid()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN 'ADMIN';
END;
$function$;