-- تحديث بعض الكميات للفرع الحالي كمثال
UPDATE branch_inventory 
SET quantity = CASE 
    WHEN product_id IN (
        SELECT id FROM products WHERE name LIKE '%جبنه%' 
        ORDER BY created_at LIMIT 3
    ) THEN 25
    WHEN product_id IN (
        SELECT id FROM products WHERE name LIKE '%مياه%' 
        ORDER BY created_at LIMIT 2  
    ) THEN 50
    WHEN product_id IN (
        SELECT id FROM products WHERE name LIKE '%مشروب%' 
        ORDER BY created_at LIMIT 4
    ) THEN 15
    ELSE 10  -- كمية افتراضية للمنتجات الأخرى
END
WHERE branch_id = '49c736ed-9983-4d11-9408-203e39365afb';