-- المرحلة 1: تعديلات قاعدة البيانات (محاولة ثالثة - حذف الدالة أولاً)

-- 1.1 إضافة price و estimated_time إلى branch_neighborhoods
ALTER TABLE public.branch_neighborhoods 
ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS estimated_time TEXT;

-- 1.2 إنشاء دالة get_delivery_price
CREATE OR REPLACE FUNCTION public.get_delivery_price(p_branch_id UUID, p_neighborhood_id UUID)
RETURNS TABLE (
  price NUMERIC,
  estimated_time TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT bn.price, bn.estimated_time
  FROM public.branch_neighborhoods bn
  WHERE bn.branch_id = p_branch_id
    AND bn.neighborhood_id = p_neighborhood_id
    AND bn.active = true;
END;
$$;

-- 1.3 إنشاء جدول order_routing_log
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_routing_log') THEN
    CREATE TABLE public.order_routing_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID REFERENCES public.online_orders(id) ON DELETE CASCADE,
      neighborhood_id UUID REFERENCES public.neighborhoods(id),
      assigned_branch_id UUID REFERENCES public.branches(id),
      routing_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    ALTER TABLE public.order_routing_log ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- 1.4 RLS policies
DROP POLICY IF EXISTS "Admins can view routing logs" ON public.order_routing_log;
DROP POLICY IF EXISTS "Admins can manage routing logs" ON public.order_routing_log;

CREATE POLICY "Admins can view routing logs" ON public.order_routing_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Admins can manage routing logs" ON public.order_routing_log
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() 
      AND u.role IN ('super_admin', 'admin')
    )
  );

-- 1.5 حذف وإعادة إنشاء get_branch_for_neighborhood
DROP FUNCTION IF EXISTS public.get_branch_for_neighborhood(UUID);

CREATE FUNCTION public.get_branch_for_neighborhood(p_neighborhood_id UUID)
RETURNS TABLE (
  branch_id UUID,
  branch_name TEXT,
  branch_address TEXT,
  branch_phone TEXT,
  branch_type public.branch_type,
  category public.branch_category,
  priority INTEGER,
  routing_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.address,
    b.phone,
    b.branch_type,
    b.category,
    bn.priority,
    CASE 
      WHEN bn.is_primary THEN 'تم التوزيع على الفرع الرئيسي للمنطقة'
      ELSE 'تم التوزيع حسب الأولوية'
    END as routing_reason
  FROM public.branches b
  INNER JOIN public.branch_neighborhoods bn ON b.id = bn.branch_id
  WHERE bn.neighborhood_id = p_neighborhood_id
    AND bn.active = true
    AND b.active = true
  ORDER BY 
    bn.is_primary DESC,
    bn.priority ASC,
    b.category
  LIMIT 1;
END;
$$;

-- 1.6 التوزيع التلقائي
CREATE OR REPLACE FUNCTION public.assign_order_to_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_branch_record RECORD;
  v_hub_id UUID;
  v_routing_reason TEXT;
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_location_id IS NOT NULL THEN
    SELECT * INTO v_branch_record
    FROM public.get_branch_for_neighborhood(NEW.delivery_location_id);
    
    IF FOUND THEN
      NEW.branch_id := v_branch_record.branch_id;
      v_routing_reason := v_branch_record.routing_reason;
      
      INSERT INTO public.order_routing_log (
        order_id,
        neighborhood_id,
        assigned_branch_id,
        routing_reason
      ) VALUES (
        NEW.id,
        NEW.delivery_location_id,
        NEW.branch_id,
        v_routing_reason
      );
      
      RETURN NEW;
    END IF;
  END IF;

  SELECT id INTO v_hub_id
  FROM public.branches
  WHERE category = 'main_hub' AND active = true
  ORDER BY created_at ASC LIMIT 1;
  
  IF v_hub_id IS NULL THEN
    SELECT id INTO v_hub_id
    FROM public.branches
    WHERE active = true
    ORDER BY created_at ASC LIMIT 1;
  END IF;
  
  NEW.branch_id := v_hub_id;
  
  INSERT INTO public.order_routing_log (
    order_id, neighborhood_id, assigned_branch_id, routing_reason
  ) VALUES (
    NEW.id, NEW.delivery_location_id, NEW.branch_id,
    'تم التوزيع على الفرع الرئيسي (لم يتم العثور على فرع في المنطقة)'
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_assign_branch_to_order ON public.online_orders;

CREATE TRIGGER auto_assign_branch_to_order
  BEFORE INSERT ON public.online_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_to_branch();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branch_neighborhoods_branch_id ON public.branch_neighborhoods(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_neighborhoods_neighborhood_id ON public.branch_neighborhoods(neighborhood_id);
CREATE INDEX IF NOT EXISTS idx_order_routing_log_order_id ON public.order_routing_log(order_id);
CREATE INDEX IF NOT EXISTS idx_order_routing_log_branch_id ON public.order_routing_log(assigned_branch_id);