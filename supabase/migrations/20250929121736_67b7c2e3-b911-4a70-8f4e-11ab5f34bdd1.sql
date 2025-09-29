-- إزالة الحقول المتبقية من جدول المنتجات
ALTER TABLE public.products 
DROP COLUMN IF EXISTS parent_product_id,
DROP COLUMN IF EXISTS shared_inventory,
DROP COLUMN IF EXISTS conversion_factor;