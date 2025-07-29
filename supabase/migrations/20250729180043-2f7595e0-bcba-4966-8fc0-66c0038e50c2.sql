-- Enable RLS for tables that don't have it
ALTER TABLE public.main_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governorates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.register_transfers ENABLE ROW LEVEL SECURITY;

-- Add policies for main_categories
CREATE POLICY "All users can view main categories"
  ON public.main_categories
  FOR SELECT
  USING (true);

CREATE POLICY "Branch managers and admins can manage main categories"
  ON public.main_categories
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin', 'branch_manager')
    )
  );

-- Add policies for subcategories
CREATE POLICY "All users can view subcategories"
  ON public.subcategories
  FOR SELECT
  USING (true);

CREATE POLICY "Branch managers and admins can manage subcategories"
  ON public.subcategories
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin', 'branch_manager')
    )
  );

-- Add policies for purchase_items
CREATE POLICY "Users can view purchase items in their branch"
  ON public.purchase_items
  FOR SELECT
  USING (
    purchase_id IN (
      SELECT id FROM public.purchases 
      WHERE branch_id IN (
        SELECT branch_id FROM public.users WHERE id = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Users can manage purchase items"
  ON public.purchase_items
  FOR ALL
  USING (
    purchase_id IN (
      SELECT id FROM public.purchases 
      WHERE branch_id IN (
        SELECT branch_id FROM public.users WHERE id = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin', 'branch_manager')
    )
  );

-- Add policies for invoice_settings (global settings)
CREATE POLICY "All users can view invoice settings"
  ON public.invoice_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage invoice settings"
  ON public.invoice_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

-- Add policies for payment_settings (global settings)
CREATE POLICY "All users can view payment settings"
  ON public.payment_settings
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage payment settings"
  ON public.payment_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

-- Add policies for location tables (public data)
CREATE POLICY "All users can view governorates"
  ON public.governorates
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage governorates"
  ON public.governorates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "All users can view cities"
  ON public.cities
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage cities"
  ON public.cities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "All users can view areas"
  ON public.areas
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage areas"
  ON public.areas
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "All users can view neighborhoods"
  ON public.neighborhoods
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can manage neighborhoods"
  ON public.neighborhoods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('super_admin', 'admin')
    )
  );

-- Add policies for register_transfers
CREATE POLICY "Users can view register transfers in their branch"
  ON public.register_transfers
  FOR SELECT
  USING (
    created_by IN (
      SELECT id FROM public.users 
      WHERE branch_id IN (
        SELECT branch_id FROM public.users WHERE id = auth.uid()
      )
    ) OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'super_admin'
    )
  );

CREATE POLICY "Users can create register transfers"
  ON public.register_transfers
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
  );

-- Fix search_path for functions
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT branch_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role = 'super_admin' FROM public.users WHERE id = auth.uid();
$$;