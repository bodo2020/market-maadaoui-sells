-- Phase 1: إضافة البنية التحتية للـ Multi-Schema Architecture

-- 1. إضافة حقل schema_name لجدول branches
ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS schema_name TEXT;

-- 2. إنشاء index على schema_name
CREATE INDEX IF NOT EXISTS idx_branches_schema_name ON public.branches(schema_name);

-- 3. Function لإنشاء schema جديد للفرع الخارجي
CREATE OR REPLACE FUNCTION public.create_branch_schema(
  p_branch_id UUID,
  p_branch_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema_name TEXT;
BEGIN
  -- إنشاء اسم schema بناءً على كود الفرع
  v_schema_name := 'branch_' || lower(regexp_replace(p_branch_code, '[^a-zA-Z0-9]', '_', 'g'));
  
  -- إنشاء schema إذا لم يكن موجوداً
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
  
  -- تحديث جدول branches بـ schema_name
  UPDATE public.branches 
  SET schema_name = v_schema_name 
  WHERE id = p_branch_id;
  
  -- منح الصلاحيات للـ authenticated users
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated', v_schema_name);
  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA %I TO authenticated', v_schema_name);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT ALL ON TABLES TO authenticated', v_schema_name);
  
  RETURN v_schema_name;
END;
$$;

-- 4. Function لنسخ هيكل الجداول الأساسية للـ schema الجديد
CREATE OR REPLACE FUNCTION public.setup_branch_tables(p_schema_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- إنشاء جدول products في الـ schema الجديد
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      barcode TEXT,
      price NUMERIC NOT NULL,
      purchase_price NUMERIC,
      quantity INTEGER DEFAULT 0,
      image_urls TEXT[],
      description TEXT,
      unit_of_measure TEXT DEFAULT ''unit'',
      shelf_location TEXT,
      expiry_date DATE,
      is_offer BOOLEAN DEFAULT false,
      offer_price NUMERIC,
      company_id UUID,
      main_category_id UUID,
      subcategory_id UUID,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name);

  -- إنشاء جدول inventory
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.inventory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES %I.products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      min_stock_level INTEGER DEFAULT 5,
      max_stock_level INTEGER DEFAULT 100,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name, p_schema_name);

  -- إنشاء جدول sales
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      items JSONB NOT NULL,
      total NUMERIC NOT NULL,
      profit NUMERIC,
      payment_method TEXT,
      customer_id UUID,
      cashier_id UUID,
      invoice_number TEXT,
      date TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name);

  -- إنشاء جدول categories
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.main_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name);

  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.subcategories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      category_id UUID REFERENCES %I.main_categories(id) ON DELETE CASCADE,
      description TEXT,
      image_url TEXT,
      position INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name, p_schema_name);

  -- إنشاء جدول companies
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      logo_url TEXT,
      contact_phone TEXT,
      contact_email TEXT,
      address TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )', p_schema_name);

  -- Enable RLS على الجداول
  EXECUTE format('ALTER TABLE %I.products ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.inventory ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.sales ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.main_categories ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.subcategories ENABLE ROW LEVEL SECURITY', p_schema_name);
  EXECUTE format('ALTER TABLE %I.companies ENABLE ROW LEVEL SECURITY', p_schema_name);

  -- إضافة RLS policies - السماح بكل العمليات للـ authenticated users
  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.products
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.inventory
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.sales
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.main_categories
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.subcategories
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

  EXECUTE format('
    CREATE POLICY "Allow all for authenticated users" ON %I.companies
    FOR ALL TO authenticated USING (true) WITH CHECK (true)
  ', p_schema_name);

END;
$$;

-- 5. Function مدمجة لإنشاء فرع خارجي مع schema خاص
CREATE OR REPLACE FUNCTION public.initialize_external_branch(
  p_branch_id UUID,
  p_branch_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema_name TEXT;
BEGIN
  -- إنشاء schema
  v_schema_name := public.create_branch_schema(p_branch_id, p_branch_code);
  
  -- إعداد الجداول
  PERFORM public.setup_branch_tables(v_schema_name);
  
  RETURN v_schema_name;
END;
$$;