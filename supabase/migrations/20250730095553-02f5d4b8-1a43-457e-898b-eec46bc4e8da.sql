-- التأكد من أن كل منتج له سجل في branch_inventory لجميع الفروع
INSERT INTO branch_inventory (product_id, branch_id, quantity, min_stock_level, max_stock_level)
SELECT 
    p.id as product_id,
    b.id as branch_id,
    0 as quantity,  -- كمية افتراضية 0
    5 as min_stock_level,
    100 as max_stock_level
FROM products p
CROSS JOIN branches b
WHERE NOT EXISTS (
    SELECT 1 FROM branch_inventory bi 
    WHERE bi.product_id = p.id AND bi.branch_id = b.id
);