-- إنشاء جدول neighborhoods إذا لم يكن موجود
CREATE TABLE IF NOT EXISTS neighborhoods (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    area_id UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    price NUMERIC,
    estimated_time TEXT,
    active BOOLEAN DEFAULT true,
    branch_id UUID REFERENCES branches(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للأحياء
CREATE POLICY "Allow all users to view neighborhoods" 
ON neighborhoods 
FOR SELECT 
USING (true);

CREATE POLICY "Allow all users to manage neighborhoods" 
ON neighborhoods 
FOR ALL 
USING (true);

-- إضافة بعض الأحياء إذا لم تكن موجودة
INSERT INTO neighborhoods (name, area_id, price, estimated_time, branch_id)
SELECT 'الزعفران الغربي', a.id, 15.0, '30-45 دقيقة', '49c736ed-9983-4d11-9408-203e39365afb'
FROM areas a
WHERE a.name = 'الزعفران'
AND NOT EXISTS (SELECT 1 FROM neighborhoods WHERE name = 'الزعفران الغربي' AND area_id = a.id)
LIMIT 1;