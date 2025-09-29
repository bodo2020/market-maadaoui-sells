-- إنشاء جدول المنتجات المترابطة (Product Variants)
CREATE TABLE public.product_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  variant_type TEXT NOT NULL, -- مثل "كرتونة", "نص كرتونة", "قطعة"
  price NUMERIC NOT NULL DEFAULT 0,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  conversion_factor NUMERIC NOT NULL DEFAULT 1, -- كم قطعة من الوحدة الأساسية يساوي هذا الصنف
  barcode TEXT UNIQUE,
  bulk_barcode TEXT,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER DEFAULT 0, -- ترتيب عرض الأصناف
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- إضافة حقول جديدة لجدول المنتجات الحالي
ALTER TABLE public.products 
ADD COLUMN has_variants BOOLEAN DEFAULT false,
ADD COLUMN is_variant BOOLEAN DEFAULT false,
ADD COLUMN base_unit TEXT DEFAULT 'قطعة'; -- الوحدة الأساسية للمنتج

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX idx_product_variants_parent_id ON public.product_variants(parent_product_id);
CREATE INDEX idx_product_variants_barcode ON public.product_variants(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_product_variants_active ON public.product_variants(active);
CREATE INDEX idx_products_has_variants ON public.products(has_variants);

-- تفعيل RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات الأمان
CREATE POLICY "Allow all operations for product_variants" 
ON public.product_variants 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- إنشاء trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION public.update_product_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_variants_updated_at();