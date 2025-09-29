-- إضافة أعمدة المنتجات المترابطة لجدول products
ALTER TABLE public.products 
ADD COLUMN parent_product_id uuid REFERENCES public.products(id),
ADD COLUMN shared_inventory boolean DEFAULT false;

-- إنشاء index لتحسين الأداء
CREATE INDEX idx_products_parent_product_id ON public.products(parent_product_id);

-- دالة لمزامنة المخزون للمنتجات المترابطة
CREATE OR REPLACE FUNCTION public.sync_linked_products_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_parent_id uuid;
    v_shared_inventory boolean;
BEGIN
    -- التحقق من وجود منتج أساسي ومشاركة المخزون
    IF NEW.parent_product_id IS NOT NULL THEN
        SELECT parent_product_id, shared_inventory INTO v_parent_id, v_shared_inventory
        FROM public.products 
        WHERE id = NEW.id;
        
        -- إذا كانت مشاركة المخزون مفعلة
        IF v_shared_inventory THEN
            -- تحديث كمية المنتج الأساسي والمنتجات المرتبطة
            UPDATE public.inventory 
            SET quantity = NEW.quantity, updated_at = now()
            WHERE product_id = v_parent_id OR product_id IN (
                SELECT id FROM public.products 
                WHERE parent_product_id = v_parent_id AND shared_inventory = true
            );
        END IF;
    ELSIF OLD.parent_product_id IS NOT NULL AND NEW.parent_product_id IS NULL THEN
        -- إذا تم إلغاء الربط
        SELECT parent_product_id, shared_inventory INTO v_parent_id, v_shared_inventory
        FROM public.products 
        WHERE id = OLD.id;
        
        IF v_shared_inventory THEN
            -- تحديث كمية المنتجات المرتبطة الأخرى
            UPDATE public.inventory 
            SET quantity = NEW.quantity, updated_at = now()
            WHERE product_id = v_parent_id OR product_id IN (
                SELECT id FROM public.products 
                WHERE parent_product_id = v_parent_id AND shared_inventory = true AND id != NEW.id
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- إنشاء trigger لمزامنة المخزون
CREATE TRIGGER trigger_sync_linked_products_inventory
    AFTER UPDATE OF quantity ON public.inventory
    FOR EACH ROW
    WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
    EXECUTE FUNCTION public.sync_linked_products_inventory();