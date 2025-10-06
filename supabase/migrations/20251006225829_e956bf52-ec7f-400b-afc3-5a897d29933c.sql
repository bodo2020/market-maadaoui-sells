-- إضافة جميع المستخدمين الحاليين إلى جدول user_branch_roles للفرع الأول
-- (يمكن للسوبر أدمن تعديلها لاحقاً)

DO $$
DECLARE
  v_first_branch_id uuid;
  v_user_record RECORD;
BEGIN
  -- الحصول على أول فرع نشط
  SELECT id INTO v_first_branch_id 
  FROM public.branches 
  WHERE active = true 
  ORDER BY created_at ASC 
  LIMIT 1;
  
  -- إذا لم يوجد فرع، نتوقف
  IF v_first_branch_id IS NULL THEN
    RAISE NOTICE 'لا يوجد فروع نشطة';
    RETURN;
  END IF;
  
  -- إضافة جميع المستخدمين (ما عدا admin و super_admin) إلى الفرع الأول
  FOR v_user_record IN 
    SELECT id, role 
    FROM public.users 
    WHERE role NOT IN ('super_admin')
  LOOP
    -- إضافة المستخدم إلى user_branch_roles إذا لم يكن موجوداً
    INSERT INTO public.user_branch_roles (user_id, branch_id, role)
    VALUES (v_user_record.id, v_first_branch_id, v_user_record.role)
    ON CONFLICT (user_id, branch_id) DO NOTHING;
  END LOOP;
  
  RAISE NOTICE 'تم إضافة المستخدمين إلى الفرع: %', v_first_branch_id;
END $$;