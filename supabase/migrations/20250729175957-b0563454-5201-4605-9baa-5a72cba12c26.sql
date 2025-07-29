-- Create branches table
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  manager_id UUID,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  settings JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS on branches table
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Create policies for branches
CREATE POLICY "Super admins can manage all branches"
  ON public.branches
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Branch managers can view their branch"
  ON public.branches
  FOR SELECT
  USING (
    manager_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE id = auth.uid() AND role IN ('super_admin', 'admin')
    )
  );

-- Add branch_id to users table
ALTER TABLE public.users ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to products table
ALTER TABLE public.products ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to sales table
ALTER TABLE public.sales ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to cash_tracking table
ALTER TABLE public.cash_tracking ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to online_orders table
ALTER TABLE public.online_orders ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to expenses table
ALTER TABLE public.expenses ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Add branch_id to purchases table
ALTER TABLE public.purchases ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Create a default main branch
INSERT INTO public.branches (name, address, phone, active) 
VALUES ('الفرع الرئيسي', 'العنوان الرئيسي', '', true);

-- Update existing data to use the main branch
UPDATE public.users SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.products SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.sales SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.cash_tracking SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.online_orders SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.expenses SET branch_id = (SELECT id FROM public.branches LIMIT 1);
UPDATE public.purchases SET branch_id = (SELECT id FROM public.branches LIMIT 1);

-- Update RLS policies for users table to include branch filtering
DROP POLICY IF EXISTS "Allow full access to all users temporarily" ON public.users;

CREATE POLICY "Super admins can manage all users"
  ON public.users
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Branch managers can manage their branch users"
  ON public.users
  FOR ALL
  USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.manager_id = auth.uid()
    ) OR
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

-- Update products RLS policies
DROP POLICY IF EXISTS "Allow full access to all users temporarily" ON public.products;
DROP POLICY IF EXISTS "Allow full access to all users" ON public.products;

CREATE POLICY "Users can view products in their branch"
  ON public.products
  FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id FROM public.users WHERE id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Branch managers and admins can manage products"
  ON public.products
  FOR ALL
  USING (
    branch_id IN (
      SELECT branch_id FROM public.users WHERE id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin', 'branch_manager')
    )
  );

-- Update sales RLS policies
DROP POLICY IF EXISTS "Allow full access to all users temporarily" ON public.sales;

CREATE POLICY "Users can view sales in their branch"
  ON public.sales
  FOR SELECT
  USING (
    branch_id IN (
      SELECT branch_id FROM public.users WHERE id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create sales in their branch"
  ON public.sales
  FOR INSERT
  WITH CHECK (
    branch_id IN (
      SELECT branch_id FROM public.users WHERE id = auth.uid()
    )
  );

-- Function to get user's branch
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID
LANGUAGE SQL
STABLE SECURITY DEFINER
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid();
$$;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
AS $$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid();
$$;