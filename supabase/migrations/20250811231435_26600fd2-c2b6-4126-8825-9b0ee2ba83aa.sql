-- Secure public.users and public.customers: restrict public reads
-- Ensure RLS is enabled (no-op if already enabled)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- USERS: remove public-readable SELECT and add scoped policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Allow reading users for authentication'
  ) THEN
    DROP POLICY "Allow reading users for authentication" ON public.users;
  END IF;
END $$;

-- Allow each user to view only their own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Users can view own user data'
  ) THEN
    CREATE POLICY "Users can view own user data"
    ON public.users
    FOR SELECT
    USING (id = auth.uid());
  END IF;
END $$;

-- Allow admins to view all users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'users' AND policyname = 'Admins can view all users'
  ) THEN
    CREATE POLICY "Admins can view all users"
    ON public.users
    FOR SELECT
    USING (is_admin() OR is_super_admin());
  END IF;
END $$;

-- CUSTOMERS: remove public-readable SELECT and add scoped admin policy
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Allow authenticated users to select customers'
  ) THEN
    DROP POLICY "Allow authenticated users to select customers" ON public.customers;
  END IF;
END $$;

-- Ensure policy exists to allow admins to view all customers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'customers' AND policyname = 'Admins can view all customers'
  ) THEN
    CREATE POLICY "Admins can view all customers"
    ON public.customers
    FOR SELECT
    USING (is_admin() OR is_super_admin());
  END IF;
END $$;