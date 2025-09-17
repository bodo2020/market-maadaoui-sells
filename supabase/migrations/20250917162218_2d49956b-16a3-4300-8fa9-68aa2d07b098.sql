-- Create the products bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Create the images bucket if it doesn't exist  
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to products bucket
CREATE POLICY "Allow authenticated users to upload products"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'products');

-- Allow authenticated users to view files in products bucket
CREATE POLICY "Allow authenticated users to view products"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'products');

-- Allow authenticated users to delete files from products bucket
CREATE POLICY "Allow authenticated users to delete products"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'products');

-- Allow authenticated users to upload files to images bucket
CREATE POLICY "Allow authenticated users to upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'images');

-- Allow authenticated users to view files in images bucket
CREATE POLICY "Allow authenticated users to view images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'images');

-- Allow authenticated users to delete files from images bucket
CREATE POLICY "Allow authenticated users to delete images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'images');