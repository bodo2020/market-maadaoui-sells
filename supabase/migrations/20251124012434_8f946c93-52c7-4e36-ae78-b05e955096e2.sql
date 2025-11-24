-- المرحلة 1: تصنيفات الفروع ونظام الفرانشيز (النسخة النهائية)

-- 1. إنشاء enum لتصنيفات الفروع (مع التحقق من الوجود)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'branch_category') THEN
    CREATE TYPE branch_category AS ENUM (
      'main_hub',
      'franchise',
      'internal',
      'retail',
      'warehouse'
    );
  END IF;
END $$;

-- 2. إضافة أعمدة جديدة لجدول branches
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'category') THEN
    ALTER TABLE branches ADD COLUMN category branch_category DEFAULT 'internal';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'hub_branch_id') THEN
    ALTER TABLE branches ADD COLUMN hub_branch_id UUID REFERENCES branches(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'franchise_code') THEN
    ALTER TABLE branches ADD COLUMN franchise_code TEXT UNIQUE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'commission_rate') THEN
    ALTER TABLE branches ADD COLUMN commission_rate NUMERIC(5,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'contract_start_date') THEN
    ALTER TABLE branches ADD COLUMN contract_start_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'contract_end_date') THEN
    ALTER TABLE branches ADD COLUMN contract_end_date DATE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branches' AND column_name = 'monthly_fee') THEN
    ALTER TABLE branches ADD COLUMN monthly_fee NUMERIC(10,2);
  END IF;
END $$;

-- 3. إنشاء جدول إعدادات الفرانشيز
CREATE TABLE IF NOT EXISTS franchise_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) UNIQUE NOT NULL,
  profit_share_percentage NUMERIC(5,2) DEFAULT 0,
  payment_terms TEXT,
  can_modify_prices BOOLEAN DEFAULT false,
  can_add_products BOOLEAN DEFAULT false,
  can_manage_inventory BOOLEAN DEFAULT true,
  can_view_analytics BOOLEAN DEFAULT true,
  max_discount_percentage NUMERIC(5,2) DEFAULT 10,
  requires_approval_for_orders BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. تحسين جدول branch_neighborhoods
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branch_neighborhoods' AND column_name = 'priority') THEN
    ALTER TABLE branch_neighborhoods ADD COLUMN priority INTEGER DEFAULT 1;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branch_neighborhoods' AND column_name = 'delivery_radius_km') THEN
    ALTER TABLE branch_neighborhoods ADD COLUMN delivery_radius_km NUMERIC(5,2);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'branch_neighborhoods' AND column_name = 'is_primary') THEN
    ALTER TABLE branch_neighborhoods ADD COLUMN is_primary BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 5. حذف الدالة القديمة وإنشاء دالة جديدة للحصول على الفرع المناسب
DROP FUNCTION IF EXISTS get_branch_for_neighborhood(UUID);

CREATE FUNCTION get_branch_for_neighborhood(p_neighborhood_id UUID)
RETURNS TABLE (
  branch_id UUID,
  branch_name TEXT,
  branch_address TEXT,
  branch_phone TEXT,
  branch_type branch_type,
  category branch_category,
  priority INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.name,
    b.address,
    b.phone,
    b.branch_type,
    b.category,
    bn.priority
  FROM branches b
  INNER JOIN branch_neighborhoods bn ON b.id = bn.branch_id
  WHERE bn.neighborhood_id = p_neighborhood_id
    AND bn.active = true
    AND b.active = true
  ORDER BY 
    bn.is_primary DESC,
    bn.priority ASC,
    b.category
  LIMIT 1;
END;
$$;

-- 6. RLS policies لجدول franchise_settings
ALTER TABLE franchise_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage franchise settings" ON franchise_settings;
CREATE POLICY "Admins can manage franchise settings"
ON franchise_settings FOR ALL
USING (is_admin() OR is_super_admin())
WITH CHECK (is_admin() OR is_super_admin());

DROP POLICY IF EXISTS "Franchise owners can view their settings" ON franchise_settings;
CREATE POLICY "Franchise owners can view their settings"
ON franchise_settings FOR SELECT
USING (
  branch_id IN (
    SELECT branch_id FROM user_branch_roles WHERE user_id = auth.uid()
  )
);

-- 7. Trigger لتحديث updated_at
DROP TRIGGER IF EXISTS update_franchise_settings_updated_at ON franchise_settings;
CREATE TRIGGER update_franchise_settings_updated_at
  BEFORE UPDATE ON franchise_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 8. Indexes لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_branches_category ON branches(category);
CREATE INDEX IF NOT EXISTS idx_branches_hub_branch_id ON branches(hub_branch_id);
CREATE INDEX IF NOT EXISTS idx_branches_franchise_code ON branches(franchise_code);
CREATE INDEX IF NOT EXISTS idx_franchise_settings_branch_id ON franchise_settings(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_neighborhoods_priority ON branch_neighborhoods(priority, is_primary);