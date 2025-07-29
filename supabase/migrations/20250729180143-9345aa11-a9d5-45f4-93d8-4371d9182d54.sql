-- Enable RLS for purchases table
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Add policies for purchases
CREATE POLICY "Users can view purchases in their branch"
  ON public.purchases
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

CREATE POLICY "Users can manage purchases in their branch"
  ON public.purchases
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

-- Fix remaining functions with search_path
CREATE OR REPLACE FUNCTION public.create_bucket_if_not_exists(bucket_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO storage.buckets (id, name, public)
  SELECT bucket_name, bucket_name, true
  WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = bucket_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.link_profile_to_customer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- ابحث عن السجل الخاص بالعميل الذي يحمل user_id يساوي id في جدول profiles
  UPDATE public.profiles
  SET customer_id = c.id
  FROM public.customers c
  WHERE public.profiles.id = c.user_id
    AND public.profiles.id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_subcategory_belongs_to_main_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.subcategory_id IS NOT NULL AND NEW.main_category_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM public.subcategories s
      WHERE s.id = NEW.subcategory_id 
      AND s.category_id = NEW.main_category_id
    ) THEN
      RAISE EXCEPTION 'Subcategory must belong to the selected main category';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.customers (
    user_id, 
    first_name, 
    last_name, 
    email, 
    phone, 
    address,
    name
  ) VALUES (
    NEW.id, 
    NEW.raw_user_meta_data->>'first_name', 
    NEW.raw_user_meta_data->>'last_name', 
    NEW.email, 
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address',
    COALESCE(NEW.raw_user_meta_data->>'name', concat_ws(' ', NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'last_name'))
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_verification_codes_table()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Drop the table if it exists
  DROP TABLE IF EXISTS public.verification_codes;
  
  -- Create the table
  CREATE TABLE public.verification_codes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
  );
  
  -- Enable RLS for security
  ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_id_from_user()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id FROM public.customers WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.set_customer_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.customer_id := public.get_customer_id_from_user();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_cash_transaction(p_amount numeric, p_transaction_type text, p_register_type text, p_notes text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_balance numeric;
    v_new_balance numeric;
BEGIN
    -- Get the current balance
    SELECT COALESCE(
        (
            SELECT closing_balance 
            FROM public.cash_tracking 
            WHERE register_type = p_register_type
            ORDER BY date DESC, created_at DESC 
            LIMIT 1
        ), 
        0
    ) INTO v_current_balance;

    -- Calculate new balance
    IF p_transaction_type = 'deposit' THEN
        v_new_balance := v_current_balance + p_amount;
    ELSE
        -- Check for sufficient funds on withdrawal
        IF p_amount > v_current_balance THEN
            RAISE EXCEPTION 'Insufficient funds. Current balance: %', v_current_balance;
        END IF;
        v_new_balance := v_current_balance - p_amount;
    END IF;

    -- Insert transaction record
    INSERT INTO public.cash_transactions (
        transaction_date,
        amount,
        transaction_type,
        register_type,
        notes,
        balance_after
    ) VALUES (
        NOW(),
        p_amount,
        p_transaction_type,
        p_register_type,
        p_notes,
        v_new_balance
    );

    -- Insert tracking record
    INSERT INTO public.cash_tracking (
        date,
        register_type,
        opening_balance,
        closing_balance,
        difference,
        notes
    ) VALUES (
        CURRENT_DATE,
        p_register_type,
        v_current_balance,
        v_new_balance,
        CASE 
            WHEN p_transaction_type = 'deposit' THEN p_amount 
            ELSE -p_amount 
        END,
        p_notes
    );

    RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN (
    SELECT role = 'admin' 
    FROM public.users 
    WHERE id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN 'ADMIN';
END;
$$;