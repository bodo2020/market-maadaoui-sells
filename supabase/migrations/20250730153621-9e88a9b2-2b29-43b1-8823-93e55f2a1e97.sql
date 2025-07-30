-- إصلاح التحذيرات الأمنية بإضافة search_path للدوال

-- إصلاح دالة get_branch_from_delivery_location
CREATE OR REPLACE FUNCTION get_branch_from_delivery_location(location_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    branch_id UUID;
BEGIN
    -- البحث عن الفرع في جدول neighborhoods
    SELECT n.branch_id INTO branch_id
    FROM public.neighborhoods n
    WHERE n.id = location_id;
    
    -- إذا لم نجد الفرع، نبحث في المحافظات والمدن والمناطق
    IF branch_id IS NULL THEN
        -- البحث في الحكومات
        SELECT g.branch_id INTO branch_id
        FROM public.neighborhoods n
        JOIN public.areas a ON n.area_id = a.id
        JOIN public.cities c ON a.city_id = c.id
        JOIN public.governorates g ON c.governorate_id = g.id
        WHERE n.id = location_id;
    END IF;
    
    -- إذا لم نجد الفرع، نبحث في المدن
    IF branch_id IS NULL THEN
        SELECT c.branch_id INTO branch_id
        FROM public.neighborhoods n
        JOIN public.areas a ON n.area_id = a.id
        JOIN public.cities c ON a.city_id = c.id
        WHERE n.id = location_id;
    END IF;
    
    RETURN branch_id;
END;
$$;

-- إصلاح دالة update_order_branch_from_location
CREATE OR REPLACE FUNCTION update_order_branch_from_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- إذا تم تحديد delivery_location_id، حدد الفرع المناسب
    IF NEW.delivery_location_id IS NOT NULL THEN
        NEW.branch_id := public.get_branch_from_delivery_location(NEW.delivery_location_id);
    END IF;
    
    RETURN NEW;
END;
$$;