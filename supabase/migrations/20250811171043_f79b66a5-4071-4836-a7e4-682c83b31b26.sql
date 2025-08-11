-- إنشاء جدول المخزون مع الفروع إذا لم يكن موجوداً
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 5,
  max_stock_level INTEGER DEFAULT NULL,
  reorder_point INTEGER DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id, branch_id)
);

-- إضافة فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_inventory_product_branch ON public.inventory(product_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_branch ON public.inventory(branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock ON public.inventory(quantity, min_stock_level);

-- تمكين RLS للمخزون
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- سياسات RLS للمخزون
DROP POLICY IF EXISTS "Users can view inventory for accessible branches" ON public.inventory;
CREATE POLICY "Users can view inventory for accessible branches"
ON public.inventory
FOR SELECT
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);

DROP POLICY IF EXISTS "Admins can manage inventory" ON public.inventory;
CREATE POLICY "Admins can manage inventory"
ON public.inventory
FOR ALL
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);

-- تحديث بيانات المخزون الموجودة لتشمل الفرع الرئيسي
DO $$
DECLARE
  main_branch_id UUID;
BEGIN
  -- الحصول على معرف الفرع الرئيسي
  SELECT id INTO main_branch_id FROM public.branches WHERE code = 'MAIN' LIMIT 1;
  
  -- إذا لم يوجد فرع رئيسي، أنشئه
  IF main_branch_id IS NULL THEN
    INSERT INTO public.branches (name, code, active)
    VALUES ('الفرع الرئيسي', 'MAIN', true)
    RETURNING id INTO main_branch_id;
  END IF;
  
  -- نقل البيانات الموجودة إلى الفرع الرئيسي إذا كان الجدول فارغاً
  INSERT INTO public.inventory (product_id, branch_id, quantity, min_stock_level)
  SELECT p.id, main_branch_id, COALESCE(p.quantity, 0), 5
  FROM public.products p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory i 
    WHERE i.product_id = p.id AND i.branch_id = main_branch_id
  );
END $$;

-- إضافة trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_updated_at ON public.inventory;
CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_updated_at();

-- تحديث جدول المنتجات لإزالة عمود quantity المباشر
-- ALTER TABLE public.products DROP COLUMN IF EXISTS quantity;

-- إضافة فهارس للجداول الأخرى للفروع
CREATE INDEX IF NOT EXISTS idx_sales_branch_date ON public.sales(branch_id, date);
CREATE INDEX IF NOT EXISTS idx_cash_tracking_branch_date ON public.cash_tracking(branch_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON public.expenses(branch_id, date);