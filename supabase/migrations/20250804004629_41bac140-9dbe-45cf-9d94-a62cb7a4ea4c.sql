-- إنشاء جدول تنبيهات المخزون
CREATE TABLE IF NOT EXISTS public.inventory_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_stock_level INTEGER DEFAULT NULL, -- الحد الأدنى للمخزون (NULL يعني لا يوجد تنبيه)
  alert_enabled BOOLEAN DEFAULT false, -- تفعيل/إلغاء التنبيه
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(product_id)
);

-- تمكين RLS
ALTER TABLE public.inventory_alerts ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات للوصول
CREATE POLICY "Allow all operations for inventory_alerts" 
ON public.inventory_alerts 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product_id ON public.inventory_alerts(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_enabled ON public.inventory_alerts(alert_enabled);

-- إنشاء trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_inventory_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_alerts_updated_at
    BEFORE UPDATE ON public.inventory_alerts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_inventory_alerts_updated_at();

-- إنشاء trigger لإنشاء تنبيه افتراضي عند إضافة منتج جديد
CREATE OR REPLACE FUNCTION public.create_default_inventory_alert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.inventory_alerts (product_id, min_stock_level, alert_enabled)
    VALUES (NEW.id, NULL, false)
    ON CONFLICT (product_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_default_inventory_alert
    AFTER INSERT ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_inventory_alert();