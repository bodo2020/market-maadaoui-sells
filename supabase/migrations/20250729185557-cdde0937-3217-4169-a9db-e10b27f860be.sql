-- Fix storage policies for super admin access
-- Remove any existing conflicting policies
DROP POLICY IF EXISTS "Allow super admin to manage store bucket" ON storage.buckets;
DROP POLICY IF EXISTS "Allow super admin to manage store objects" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to store objects" ON storage.objects;

-- Create storage policies for store bucket (using correct column names)
CREATE POLICY "Super admin can manage store bucket" 
ON storage.buckets 
FOR ALL 
USING (
  id = 'store' AND 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Create storage policies for store objects
CREATE POLICY "Super admin can manage store objects" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'store' AND 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow public read access to store objects (for displaying images)
CREATE POLICY "Public read access to store objects" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'store');