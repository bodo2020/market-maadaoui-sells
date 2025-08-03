-- إنشاء جدول لحفظ عمليات الجرد
CREATE TABLE public.inventory_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_date DATE NOT NULL DEFAULT CURRENT_DATE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  expected_quantity INTEGER NOT NULL DEFAULT 0,
  actual_quantity INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  difference_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'checked', 'discrepancy')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إنشاء جدول لتجميع عمليات الجرد حسب التاريخ
CREATE TABLE public.inventory_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_products INTEGER NOT NULL DEFAULT 0,
  completed_products INTEGER NOT NULL DEFAULT 0,
  matched_products INTEGER NOT NULL DEFAULT 0,
  discrepancy_products INTEGER NOT NULL DEFAULT 0,
  total_difference_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE public.inventory_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات الوصول للجرد
CREATE POLICY "Allow all access to inventory records" 
ON public.inventory_records 
FOR ALL 
USING (true) 
WITH CHECK (true);

CREATE POLICY "Allow all access to inventory sessions" 
ON public.inventory_sessions 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- إنشاء دالة لتحديث session عند تغيير الـ records
CREATE OR REPLACE FUNCTION public.update_inventory_session_stats()
RETURNS TRIGGER AS $$
DECLARE
    session_id UUID;
    session_date DATE;
    total_products_count INTEGER;
    completed_products_count INTEGER;
    matched_products_count INTEGER;
    discrepancy_products_count INTEGER;
    total_diff_value NUMERIC;
BEGIN
    -- تحديد تاريخ الجلسة
    IF TG_OP = 'DELETE' THEN
        session_date := OLD.inventory_date;
    ELSE
        session_date := NEW.inventory_date;
    END IF;

    -- البحث عن الجلسة أو إنشاؤها
    SELECT id INTO session_id 
    FROM public.inventory_sessions 
    WHERE session_date = session_date 
    LIMIT 1;

    IF session_id IS NULL THEN
        INSERT INTO public.inventory_sessions (session_date, status)
        VALUES (session_date, 'active')
        RETURNING id INTO session_id;
    END IF;

    -- حساب الإحصائيات
    SELECT 
        COUNT(*),
        COUNT(CASE WHEN status != 'pending' THEN 1 END),
        COUNT(CASE WHEN status = 'checked' THEN 1 END),
        COUNT(CASE WHEN status = 'discrepancy' THEN 1 END),
        COALESCE(SUM(CASE WHEN status = 'discrepancy' THEN ABS(difference_value) ELSE 0 END), 0)
    INTO 
        total_products_count,
        completed_products_count,
        matched_products_count,
        discrepancy_products_count,
        total_diff_value
    FROM public.inventory_records
    WHERE inventory_date = session_date;

    -- تحديث الجلسة
    UPDATE public.inventory_sessions
    SET 
        total_products = total_products_count,
        completed_products = completed_products_count,
        matched_products = matched_products_count,
        discrepancy_products = discrepancy_products_count,
        total_difference_value = total_diff_value,
        updated_at = now()
    WHERE id = session_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء المحفزات
CREATE TRIGGER update_inventory_session_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory_records
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_session_stats();

-- إنشاء دالة لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق المحفزات للتحديث التلقائي
CREATE TRIGGER update_inventory_records_updated_at
    BEFORE UPDATE ON public.inventory_records
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_updated_at();

CREATE TRIGGER update_inventory_sessions_updated_at
    BEFORE UPDATE ON public.inventory_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_updated_at();