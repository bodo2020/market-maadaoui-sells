-- إزالة الـ trigger والـ function القديم الذي يسبب المشكلة
DROP TRIGGER IF EXISTS sync_linked_products_inventory_trigger ON inventory;
DROP FUNCTION IF EXISTS public.sync_linked_products_inventory() CASCADE;