-- إنشاء سجلات المخزون الفرعي للمنتجات الموجودة
INSERT INTO branch_inventory (product_id, branch_id, quantity, min_stock_level, max_stock_level)
SELECT 
    p.id as product_id, 
    p.branch_id, 
    COALESCE(p.quantity, 0) as quantity,
    5 as min_stock_level,
    100 as max_stock_level
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM branch_inventory bi 
    WHERE bi.product_id = p.id AND bi.branch_id = p.branch_id
);

-- تحديث كميات المنتجات من المخزون الفرعي
UPDATE products 
SET quantity = (
    SELECT COALESCE(bi.quantity, 0) 
    FROM branch_inventory bi 
    WHERE bi.product_id = products.id 
    AND bi.branch_id = products.branch_id
);

-- إصلاح سياسات الأمان لأماكن التوصيل
ALTER TABLE governorates DISABLE ROW LEVEL SECURITY;
ALTER TABLE cities DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;

-- إعادة تفعيل RLS مع سياسات أبسط
ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- سياسات جديدة للمحافظات
CREATE POLICY "Allow all users to view governorates" 
ON governorates 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all users to manage governorates" 
ON governorates 
FOR ALL 
USING (true);

-- سياسات جديدة للمدن
CREATE POLICY "Allow all users to view cities" 
ON cities 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all users to manage cities" 
ON cities 
FOR ALL 
USING (true);

-- سياسات جديدة للمناطق
CREATE POLICY "Allow all users to view areas" 
ON areas 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all users to manage areas" 
ON areas 
FOR ALL 
USING (true);