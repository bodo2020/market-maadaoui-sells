-- إصلاح trigger sync_product_inventory ليشمل branch_id
CREATE OR REPLACE FUNCTION public.sync_product_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_default_branch_id uuid;
BEGIN
  -- عند إنشاء منتج جديد، أنشئ سجل مخزون له
  IF TG_OP = 'INSERT' THEN
    -- الحصول على الفرع الافتراضي (أول فرع نشط)
    SELECT id INTO v_default_branch_id 
    FROM public.branches 
    WHERE active = true 
    ORDER BY created_at ASC 
    LIMIT 1;
    
    -- إنشاء سجل مخزون مع branch_id
    IF v_default_branch_id IS NOT NULL THEN
      INSERT INTO public.inventory (product_id, quantity, branch_id)
      VALUES (NEW.id, 0, v_default_branch_id)
      ON CONFLICT (product_id, branch_id) DO NOTHING;
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$function$