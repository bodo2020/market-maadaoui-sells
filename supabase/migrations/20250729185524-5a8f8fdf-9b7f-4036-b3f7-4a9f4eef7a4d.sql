-- Fix storage policies for super admin
-- Drop existing storage policies if they exist
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Super admin can manage store bucket" ON storage.buckets;
    DROP POLICY IF EXISTS "Super admin can manage store objects" ON storage.objects;
    DROP POLICY IF EXISTS "Public access to store bucket" ON storage.buckets;
    DROP POLICY IF EXISTS "Public read access to store objects" ON storage.objects;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- Create storage policies for store bucket management
CREATE POLICY "Allow super admin to manage store bucket" 
ON storage.buckets 
FOR ALL 
USING (
  bucket_id = 'store' AND 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

CREATE POLICY "Allow super admin to manage store objects" 
ON storage.objects 
FOR ALL 
USING (
  bucket_id = 'store' AND 
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Allow public read access to store objects
CREATE POLICY "Public read access to store objects" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'store');