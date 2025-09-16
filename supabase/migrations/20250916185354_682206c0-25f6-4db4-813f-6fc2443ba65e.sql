-- Relax RLS on favorites to work without Supabase Auth (temporary until auth is added)
-- Drop existing restrictive policies that require auth.uid()/customer mapping
DROP POLICY IF EXISTS "Allow own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Customers can delete their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Customers can insert their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Customers can only see their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Customers can update their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.favorites;

-- Create permissive, simple policies allowing all operations (POS-only use case)
CREATE POLICY "Public can select favorites"
ON public.favorites
FOR SELECT
USING (true);

CREATE POLICY "Public can insert favorites"
ON public.favorites
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update favorites"
ON public.favorites
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Public can delete favorites"
ON public.favorites
FOR DELETE
USING (true);
