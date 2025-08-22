-- إضافة موردين تجريبيين
INSERT INTO suppliers (name, contact_person, phone, email, address, balance, notes) VALUES
('شركة التكنولوجيا المتقدمة', 'أحمد محمد', '01234567890', 'info@techadvanced.com', 'القاهرة - مدينة نصر', 0, 'مورد للأجهزة الإلكترونية'),
('مؤسسة الأغذية المصرية', 'فاطمة علي', '01123456789', 'contact@egyptfood.com', 'الجيزة - الهرم', 1500, 'مورد للمواد الغذائية'),
('شركة النسيج والملابس', 'محمد إبراهيم', '01012345678', 'sales@textile.com', 'الإسكندرية - المحطة', -500, 'مورد للملابس والأقمشة')
ON CONFLICT (id) DO NOTHING;

-- تحديث بيانات التفاعلات لربطها بشكل صحيح
UPDATE customer_interactions 
SET created_by = (SELECT id FROM auth.users LIMIT 1)
WHERE created_by IS NULL;