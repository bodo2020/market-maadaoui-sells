-- إنشاء سياسات أمان لمجلد products
-- السماح لجميع المستخدمين برفع الصور
CREATE POLICY "Allow all users to upload to products bucket"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'products');

-- السماح لجميع المستخدمين بعرض الصور
CREATE POLICY "Allow all users to view products bucket"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'products');

-- السماح لجميع المستخدمين بتحديث الصور
CREATE POLICY "Allow all users to update products bucket"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'products')
WITH CHECK (bucket_id = 'products');

-- السماح لجميع المستخدمين بحذف الصور
CREATE POLICY "Allow all users to delete from products bucket"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'products');