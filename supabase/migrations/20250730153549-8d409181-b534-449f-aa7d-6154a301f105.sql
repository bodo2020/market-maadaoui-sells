-- إضافة ربط العناوين بالفروع وتوجيه الطلبات للفروع المناسبة

-- إضافة عمود branch_id إلى جدول العناوين (neighborhoods) إذا لم يكن موجود
ALTER TABLE neighborhoods 
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- تحديث جدول الطلبات الإلكترونية لتحديد الفرع تلقائياً بناءً على العنوان المختار
-- إنشاء دالة لتحديد الفرع بناءً على العنوان
CREATE OR REPLACE FUNCTION get_branch_from_delivery_location(location_id UUID)
RETURNS UUID AS $$
DECLARE
    branch_id UUID;
BEGIN
    -- البحث عن الفرع في جدول neighborhoods
    SELECT n.branch_id INTO branch_id
    FROM neighborhoods n
    WHERE n.id = location_id;
    
    -- إذا لم نجد الفرع، نبحث في المحافظات والمدن والمناطق
    IF branch_id IS NULL THEN
        -- البحث في الحكومات
        SELECT g.branch_id INTO branch_id
        FROM neighborhoods n
        JOIN areas a ON n.area_id = a.id
        JOIN cities c ON a.city_id = c.id
        JOIN governorates g ON c.governorate_id = g.id
        WHERE n.id = location_id;
    END IF;
    
    -- إذا لم نجد الفرع، نبحث في المدن
    IF branch_id IS NULL THEN
        SELECT c.branch_id INTO branch_id
        FROM neighborhoods n
        JOIN areas a ON n.area_id = a.id
        JOIN cities c ON a.city_id = c.id
        WHERE n.id = location_id;
    END IF;
    
    RETURN branch_id;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger لتحديث branch_id في الطلبات الإلكترونية عند إضافة delivery_location_id
CREATE OR REPLACE FUNCTION update_order_branch_from_location()
RETURNS TRIGGER AS $$
BEGIN
    -- إذا تم تحديد delivery_location_id، حدد الفرع المناسب
    IF NEW.delivery_location_id IS NOT NULL THEN
        NEW.branch_id := get_branch_from_delivery_location(NEW.delivery_location_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- إنشاء trigger على جدول online_orders
DROP TRIGGER IF EXISTS set_branch_from_delivery_location ON online_orders;
CREATE TRIGGER set_branch_from_delivery_location
    BEFORE INSERT OR UPDATE ON online_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_order_branch_from_location();