-- Drop all existing storage policies to start fresh
DROP POLICY IF EXISTS "Super admin can manage store bucket" ON storage.buckets;
DROP POLICY IF EXISTS "Super admin can manage store objects" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to store objects" ON storage.objects;

-- Allow authenticated super admins to manage store bucket
CREATE POLICY "Super admin can manage store bucket" 
ON storage.buckets 
FOR ALL 
TO authenticated
USING (
  id = 'store' AND 
  public.is_super_admin()
);

-- Allow authenticated super admins to manage store objects
CREATE POLICY "Super admin can manage store objects" 
ON storage.objects 
FOR ALL 
TO authenticated
USING (
  bucket_id = 'store' AND 
  public.is_super_admin()
);

-- Allow public read access to store objects
CREATE POLICY "Public read access to store objects" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'store');