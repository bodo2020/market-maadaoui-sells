-- تحديث رصيد مؤسسة الأغذية المصرية ليصبح 850 بدلاً من 1500
UPDATE public.suppliers 
SET balance = 850, updated_at = now()
WHERE name = 'مؤسسة الأغذية المصرية';