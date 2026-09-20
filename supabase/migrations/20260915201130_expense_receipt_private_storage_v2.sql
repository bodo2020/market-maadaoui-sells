insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-receipts-v2','expense-receipts-v2',false,15728640,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "expense_receipts_insert_v2" on storage.objects;
create policy "expense_receipts_insert_v2" on storage.objects
for insert to authenticated
with check (
  bucket_id='expense-receipts-v2'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2]=(select auth.uid()::text)
  and (
    public.staff_has_permission('expense.request',((storage.foldername(name))[1])::uuid)
    or public.staff_has_permission('finance.manage',((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "expense_receipts_select_v2" on storage.objects;
create policy "expense_receipts_select_v2" on storage.objects
for select to authenticated
using (
  bucket_id='expense-receipts-v2'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (storage.foldername(name))[2]=(select auth.uid()::text)
    or public.staff_has_permission('expense.view',((storage.foldername(name))[1])::uuid)
    or public.staff_has_permission('expense.approve',((storage.foldername(name))[1])::uuid)
    or public.staff_has_permission('expense.pay',((storage.foldername(name))[1])::uuid)
    or public.staff_has_permission('finance.view',((storage.foldername(name))[1])::uuid)
    or public.staff_has_permission('finance.manage',((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists "expense_receipts_delete_v2" on storage.objects;
create policy "expense_receipts_delete_v2" on storage.objects
for delete to authenticated
using (
  bucket_id='expense-receipts-v2'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    (storage.foldername(name))[2]=(select auth.uid()::text)
    or public.staff_has_permission('finance.manage',((storage.foldername(name))[1])::uuid)
  )
);
