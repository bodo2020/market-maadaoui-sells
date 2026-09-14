-- The function is SECURITY DEFINER and performs its own branch/scope permission checks.
-- Authenticated HR/branch reviewers must be able to invoke it through PostgREST.
grant execute on function public.decide_attendance_exception_v1(uuid, text, text) to authenticated;
revoke execute on function public.decide_attendance_exception_v1(uuid, text, text) from anon;
