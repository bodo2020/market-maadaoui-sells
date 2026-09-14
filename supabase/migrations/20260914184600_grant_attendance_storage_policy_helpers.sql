-- Allow authenticated HR reviewers to evaluate the attendance verification
-- storage RLS policy helpers. Keep anonymous callers blocked.
grant execute on function private.staff_is_super_admin(uuid) to authenticated;
grant execute on function private.hr_employee_in_scope_v1(uuid, uuid, uuid) to authenticated;

revoke execute on function private.staff_is_super_admin(uuid) from anon;
revoke execute on function private.hr_employee_in_scope_v1(uuid, uuid, uuid) from anon;
