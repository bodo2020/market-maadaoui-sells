-- إضافة المزيد من المحافظات
INSERT INTO governorates (name, branch_id) VALUES 
('الغربية', '49c736ed-9983-4d11-9408-203e39365afb'),
('الدقهلية', '49c736ed-9983-4d11-9408-203e39365afb'),
('البحيرة', '49c736ed-9983-4d11-9408-203e39365afb');

-- إضافة مدن لكفر الشيخ (المحافظة الموجودة)
INSERT INTO cities (name, governorate_id, branch_id) 
SELECT 'كفر الشيخ', id, '49c736ed-9983-4d11-9408-203e39365afb' 
FROM governorates WHERE name = 'كفرالشيخ'
AND NOT EXISTS (SELECT 1 FROM cities WHERE name = 'كفر الشيخ');

INSERT INTO cities (name, governorate_id, branch_id) 
SELECT 'دسوق', id, '49c736ed-9983-4d11-9408-203e39365afb' 
FROM governorates WHERE name = 'كفرالشيخ';

INSERT INTO cities (name, governorate_id, branch_id) 
SELECT 'بيلا', id, '49c736ed-9983-4d11-9408-203e39365afb' 
FROM governorates WHERE name = 'كفرالشيخ';

-- إضافة مناطق
INSERT INTO areas (name, city_id, branch_id)
SELECT 'وسط البلد', c.id, '49c736ed-9983-4d11-9408-203e39365afb'
FROM cities c 
WHERE c.name = 'كفر الشيخ'
AND NOT EXISTS (SELECT 1 FROM areas WHERE name = 'وسط البلد' AND city_id = c.id);

INSERT INTO areas (name, city_id, branch_id)
SELECT 'الزعفران', c.id, '49c736ed-9983-4d11-9408-203e39365afb'
FROM cities c 
WHERE c.name = 'كفر الشيخ';

INSERT INTO areas (name, city_id, branch_id)
SELECT 'الحامول', c.id, '49c736ed-9983-4d11-9408-203e39365afb'
FROM cities c 
WHERE c.name = 'كفر الشيخ';

-- إضافة أحياء
INSERT INTO neighborhoods (name, area_id, price, estimated_time, branch_id)
SELECT 'الزعفران الغربي', a.id, 15.0, '30-45 دقيقة', '49c736ed-9983-4d11-9408-203e39365afb'
FROM areas a
WHERE a.name = 'الزعفران'
AND NOT EXISTS (SELECT 1 FROM neighborhoods WHERE name = 'الزعفران الغربي' AND area_id = a.id);

INSERT INTO neighborhoods (name, area_id, price, estimated_time, branch_id)
SELECT 'الزعفران الشرقي', a.id, 12.0, '25-35 دقيقة', '49c736ed-9983-4d11-9408-203e39365afb'
FROM areas a
WHERE a.name = 'الزعفران';

INSERT INTO neighborhoods (name, area_id, price, estimated_time, branch_id)
SELECT 'الحامول الجديد', a.id, 20.0, '45-60 دقيقة', '49c736ed-9983-4d11-9408-203e39365afb'
FROM areas a
WHERE a.name = 'الحامول';