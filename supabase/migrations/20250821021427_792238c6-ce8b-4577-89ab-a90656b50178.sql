-- إضافة بيانات تجريبية للعملاء المحتملين
INSERT INTO leads (name, email, phone, source, status, score, notes) VALUES
('أحمد محمد', 'ahmed@example.com', '01012345678', 'website', 'new', 75, 'مهتم بالمنتجات الإلكترونية'),
('فاطمة علي', 'fatima@example.com', '01987654321', 'social_media', 'contacted', 60, 'تريد معرفة الأسعار'),
('محمد إبراهيم', 'mohamed@example.com', '01555666777', 'referral', 'qualified', 85, 'عميل محتمل ممتاز')
ON CONFLICT DO NOTHING;

-- إضافة تفاعلات تجريبية مع العملاء الموجودين
INSERT INTO customer_interactions (customer_id, type, subject, description, priority, status)
SELECT 
  c.id,
  'call'::text,
  'مكالمة متابعة',
  'تم التواصل مع العميل لمتابعة طلبه',
  'medium'::text,
  'completed'::text
FROM customers c 
WHERE c.name LIKE '%المعداوي%'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO customer_interactions (customer_id, type, subject, description, priority, status)
SELECT 
  c.id,
  'note'::text,
  'ملاحظة مهمة',
  'العميل يفضل التواصل في المساء',
  'high'::text,
  'pending'::text
FROM customers c 
WHERE c.phone IS NOT NULL
LIMIT 1
ON CONFLICT DO NOTHING;