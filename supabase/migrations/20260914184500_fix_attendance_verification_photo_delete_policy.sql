create or replace function private.hr_attendance_verification_owner_can_delete_v1(
  p_name text,
  p_actor uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select
    p_actor is not null
    and array_length(storage.foldername(p_name), 1) >= 2
    and (storage.foldername(p_name))[2] = p_actor::text
    and not exists (
      select 1
      from private.hr_attendance_exceptions e
      where e.verification_photo_path = p_name
        and e.status = 'pending'
    );
$$;

revoke all on function private.hr_attendance_verification_owner_can_delete_v1(text, uuid) from public;
revoke execute on function private.hr_attendance_verification_owner_can_delete_v1(text, uuid) from anon;
grant execute on function private.hr_attendance_verification_owner_can_delete_v1(text, uuid) to authenticated, service_role;

drop policy if exists "hr attendance verification delete" on storage.objects;
create policy "hr attendance verification delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'hr_attendance_verification'
  and array_length(storage.foldername(name), 1) >= 2
  and (
    private.hr_attendance_verification_owner_can_delete_v1(name, auth.uid())
    or (
      (
        public.staff_has_permission('hr.attendance.approve', ((storage.foldername(name))[1])::uuid)
        or public.staff_has_permission('branch.manage_staff', ((storage.foldername(name))[1])::uuid)
        or private.staff_is_super_admin(auth.uid())
      )
      and private.hr_employee_in_scope_v1(
        auth.uid(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[1])::uuid
      )
    )
  )
);