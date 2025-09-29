-- إضافة عامل التحويل للمنتجات المترابطة
ALTER TABLE public.products 
ADD COLUMN conversion_factor numeric DEFAULT 1;

-- تحديث دالة مزامنة المخزون لتأخذ في الاعتبار عامل التحويل
CREATE OR REPLACE FUNCTION public.sync_linked_products_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_parent_id uuid;
    v_shared_inventory boolean;
    v_conversion_factor numeric;
    v_converted_quantity numeric;
BEGIN
    -- التحقق من وجود منتج أساسي ومشاركة المخزون
    IF NEW.parent_product_id IS NOT NULL THEN
        SELECT parent_product_id, shared_inventory, conversion_factor 
        INTO v_parent_id, v_shared_inventory, v_conversion_factor
        FROM public.products 
        WHERE id = NEW.id;
        
        -- إذا كانت مشاركة المخزون مفعلة
        IF v_shared_inventory THEN
            -- حساب الكمية المحولة (كمية المنتج المرتبط × عامل التحويل)
            v_converted_quantity := NEW.quantity * COALESCE(v_conversion_factor, 1);
            
            -- تحديث كمية المنتج الأساسي
            UPDATE public.inventory 
            SET quantity = v_converted_quantity, updated_at = now()
            WHERE product_id = v_parent_id;
            
            -- تحديث كمية المنتجات المرتبطة الأخرى بناءً على عامل التحويل الخاص بها
            UPDATE public.inventory 
            SET quantity = CASE 
                WHEN p.conversion_factor > 0 THEN v_converted_quantity / p.conversion_factor
                ELSE v_converted_quantity 
            END,
            updated_at = now()
            FROM public.products p
            WHERE inventory.product_id = p.id 
            AND p.parent_product_id = v_parent_id 
            AND p.shared_inventory = true 
            AND p.id != NEW.id;
        END IF;
    ELSIF OLD.parent_product_id IS NOT NULL AND NEW.parent_product_id IS NULL THEN
        -- إذا تم إلغاء الربط
        SELECT parent_product_id, shared_inventory, conversion_factor 
        INTO v_parent_id, v_shared_inventory, v_conversion_factor
        FROM public.products 
        WHERE id = OLD.id;
        
        IF v_shared_inventory THEN
            v_converted_quantity := NEW.quantity * COALESCE(v_conversion_factor, 1);
            
            -- تحديث كمية المنتج الأساسي والمنتجات المرتبطة الأخرى
            UPDATE public.inventory 
            SET quantity = v_converted_quantity, updated_at = now()
            WHERE product_id = v_parent_id;
            
            UPDATE public.inventory 
            SET quantity = CASE 
                WHEN p.conversion_factor > 0 THEN v_converted_quantity / p.conversion_factor
                ELSE v_converted_quantity 
            END,
            updated_at = now()
            FROM public.products p
            WHERE inventory.product_id = p.id 
            AND p.parent_product_id = v_parent_id 
            AND p.shared_inventory = true 
            AND p.id != NEW.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;