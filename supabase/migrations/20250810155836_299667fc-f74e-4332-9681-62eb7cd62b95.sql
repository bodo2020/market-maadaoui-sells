-- Retry migration with schema-qualified functions
-- 1) Branches and Roles
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text UNIQUE,
  address text,
  phone text,
  email text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branches are viewable by everyone" ON public.branches;
CREATE POLICY "Branches are viewable by everyone"
ON public.branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage branches" ON public.branches;
CREATE POLICY "Admins can manage branches"
ON public.branches FOR ALL USING (public.is_admin() OR public.is_super_admin()) WITH CHECK (public.is_admin() OR public.is_super_admin());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  INSERT INTO public.branches (name, code) 
  VALUES ('الفرع الرئيسي', 'MAIN')
  ON CONFLICT (name) DO NOTHING;
END $$;

-- 2) User-branch roles mapping
CREATE TABLE IF NOT EXISTS public.user_branch_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'branch_manager',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

ALTER TABLE public.user_branch_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage user_branch_roles" ON public.user_branch_roles;
CREATE POLICY "Admins manage user_branch_roles"
ON public.user_branch_roles FOR ALL
USING (public.is_admin() OR public.is_super_admin())
WITH CHECK (public.is_admin() OR public.is_super_admin());

DROP POLICY IF EXISTS "Users can view their branch roles" ON public.user_branch_roles;
CREATE POLICY "Users can view their branch roles"
ON public.user_branch_roles FOR SELECT
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_branch_access(_user uuid, _branch uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT coalesce((SELECT public.is_admin() OR public.is_super_admin()), false)
         OR EXISTS (
           SELECT 1 FROM public.user_branch_roles ubr
           WHERE ubr.user_id = _user AND ubr.branch_id = _branch
         );
$$;

-- 3) Per-branch inventory: add branch_id to inventory and backfill
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS branch_id uuid;

DO $$
DECLARE v_main uuid;
BEGIN
  SELECT id INTO v_main FROM public.branches WHERE code = 'MAIN' OR name = 'الفرع الرئيسي' LIMIT 1;
  IF v_main IS NULL THEN
    INSERT INTO public.branches (name, code) VALUES ('الفرع الرئيسي', 'MAIN') RETURNING id INTO v_main;
  END IF;
  UPDATE public.inventory SET branch_id = v_main WHERE branch_id IS NULL;
END $$;

ALTER TABLE public.inventory ALTER COLUMN branch_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_inventory_product_branch'
  ) THEN
    CREATE UNIQUE INDEX idx_inventory_product_branch ON public.inventory (product_id, branch_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_products_total_quantity()
RETURNS TRIGGER AS $$
DECLARE v_product uuid; v_total int;
BEGIN
  v_product := COALESCE(NEW.product_id, OLD.product_id);
  SELECT COALESCE(SUM(quantity),0) INTO v_total FROM public.inventory WHERE product_id = v_product;
  UPDATE public.products SET quantity = v_total, updated_at = now() WHERE id = v_product;
  RETURN COALESCE(NEW, OLD);
END;$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_sync_products ON public.inventory;
CREATE TRIGGER trg_inventory_sync_products
AFTER INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.sync_products_total_quantity();

-- 4) Add branch_id to operational tables
DO $$
DECLARE v_main uuid;
BEGIN
  SELECT id INTO v_main FROM public.branches WHERE code = 'MAIN' OR name = 'الفرع الرئيسي' LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='branch_id') THEN
    ALTER TABLE public.sales ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.sales SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_sales_branch ON public.sales(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='online_orders' AND column_name='branch_id') THEN
    ALTER TABLE public.online_orders ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.online_orders SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_online_orders_branch ON public.online_orders(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='returns' AND column_name='branch_id') THEN
    ALTER TABLE public.returns ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.returns SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_returns_branch ON public.returns(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='branch_id') THEN
    ALTER TABLE public.expenses ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.expenses SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_tracking' AND column_name='branch_id') THEN
    ALTER TABLE public.cash_tracking ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.cash_tracking SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_cash_tracking_branch ON public.cash_tracking(branch_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='cash_transactions' AND column_name='branch_id') THEN
    ALTER TABLE public.cash_transactions ADD COLUMN branch_id uuid REFERENCES public.branches(id);
    UPDATE public.cash_transactions SET branch_id = v_main WHERE branch_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_branch ON public.cash_transactions(branch_id);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='purchases') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases' AND column_name='branch_id') THEN
      EXECUTE 'ALTER TABLE public.purchases ADD COLUMN branch_id uuid REFERENCES public.branches(id)';
      EXECUTE 'UPDATE public.purchases SET branch_id = '||quote_literal(v_main)||' WHERE branch_id IS NULL';
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_purchases_branch ON public.purchases(branch_id)';
    END IF;
  END IF;
END $$;

-- 5) Inventory transfers between branches
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_branch_id uuid NOT NULL REFERENCES public.branches(id),
  to_branch_id uuid NOT NULL REFERENCES public.branches(id),
  status text NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.inventory_transfers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity int NOT NULL CHECK (quantity > 0)
);

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Branch users can view related transfers" ON public.inventory_transfers;
CREATE POLICY "Branch users can view related transfers"
ON public.inventory_transfers FOR SELECT
USING (public.has_branch_access(auth.uid(), from_branch_id) OR public.has_branch_access(auth.uid(), to_branch_id));

DROP POLICY IF EXISTS "Branch managers/admins can manage transfers" ON public.inventory_transfers;
CREATE POLICY "Branch managers/admins can manage transfers"
ON public.inventory_transfers FOR ALL
USING (public.is_admin() OR public.is_super_admin() OR public.has_branch_access(auth.uid(), from_branch_id) OR public.has_branch_access(auth.uid(), to_branch_id))
WITH CHECK (public.is_admin() OR public.is_super_admin() OR public.has_branch_access(auth.uid(), from_branch_id) OR public.has_branch_access(auth.uid(), to_branch_id));

DROP POLICY IF EXISTS "Branch users can view transfer items via parent" ON public.inventory_transfer_items;
CREATE POLICY "Branch users can view transfer items via parent"
ON public.inventory_transfer_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.inventory_transfers t WHERE t.id = transfer_id AND (
    public.has_branch_access(auth.uid(), t.from_branch_id) OR public.has_branch_access(auth.uid(), t.to_branch_id)
  )
));

DROP POLICY IF EXISTS "Branch managers/admins manage transfer items" ON public.inventory_transfer_items;
CREATE POLICY "Branch managers/admins manage transfer items"
ON public.inventory_transfer_items FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.inventory_transfers t WHERE t.id = transfer_id AND (
    public.is_admin() OR public.is_super_admin() OR public.has_branch_access(auth.uid(), t.from_branch_id) OR public.has_branch_access(auth.uid(), t.to_branch_id)
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.inventory_transfers t WHERE t.id = transfer_id AND (
    public.is_admin() OR public.is_super_admin() OR public.has_branch_access(auth.uid(), t.from_branch_id) OR public.has_branch_access(auth.uid(), t.to_branch_id)
  )
));
