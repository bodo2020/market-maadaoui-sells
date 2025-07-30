-- خطوة 2: تكملة إزالة نظام الفروع بعد حذف الـ policies

-- 1. إنشاء جدول مخزون جديد بدون مرجع للفروع
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id)
);

-- 2. نقل البيانات من branch_inventory إلى inventory الجديد
-- جمع الكميات من جميع الفروع لكل منتج
INSERT INTO public.inventory (product_id, quantity, min_stock_level, max_stock_level, created_at, updated_at)
SELECT 
  bi.product_id,
  SUM(bi.quantity) as total_quantity,
  MIN(bi.min_stock_level) as min_stock,
  MAX(bi.max_stock_level) as max_stock,
  MIN(bi.created_at) as created_at,
  MAX(bi.updated_at) as updated_at
FROM branch_inventory bi
GROUP BY bi.product_id
ON CONFLICT (product_id) DO UPDATE SET
  quantity = EXCLUDED.quantity,
  min_stock_level = EXCLUDED.min_stock_level,
  max_stock_level = EXCLUDED.max_stock_level,
  updated_at = EXCLUDED.updated_at;

-- 3. تحديث الجداول - إزالة مراجع الفروع
ALTER TABLE public.products DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.expenses DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.cash_tracking DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.online_orders DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.sales DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.governorates DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.cities DROP COLUMN IF EXISTS branch_id;

-- 4. إنشاء RLS policies للجدول الجديد
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage inventory" 
ON public.inventory 
FOR ALL 
USING (
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  )) OR
  (auth.role() = 'service_role'::text) OR
  (auth.uid() IS NULL)
) 
WITH CHECK (
  (EXISTS ( 
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'branch_manager'::text])
  )) OR
  (auth.role() = 'service_role'::text) OR
  (auth.uid() IS NULL)
);

CREATE POLICY "Users can view inventory" 
ON public.inventory 
FOR SELECT 
USING (true);

-- 5. تحديث trigger للمنتجات الجديدة
DROP FUNCTION IF EXISTS public.sync_product_branch_inventory() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_product_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- عند إنشاء منتج جديد، أنشئ سجل مخزون له
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.inventory (product_id, quantity)
    VALUES (NEW.id, 0)
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$function$;

CREATE TRIGGER sync_product_inventory_trigger
  AFTER INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_inventory();

-- 6. إزالة الجداول المرتبطة بالفروع
DROP TABLE IF EXISTS public.inventory_transfers CASCADE;
DROP TABLE IF EXISTS public.branch_inventory CASCADE;
DROP TABLE IF EXISTS public.branches CASCADE;

-- 7. إزالة الـ functions المرتبطة بالفروع
DROP FUNCTION IF EXISTS public.get_user_branch_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_branch_from_delivery_location(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_order_branch_from_location() CASCADE;
DROP FUNCTION IF EXISTS public.process_inventory_transfer(uuid, text) CASCADE;