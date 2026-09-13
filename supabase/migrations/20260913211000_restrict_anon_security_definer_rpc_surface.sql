-- Tighten anonymous EXECUTE grants on authenticated-only SECURITY DEFINER RPCs.
-- Public storefront RPCs are intentionally left callable.

revoke execute on function public.get_hr_attendance_control_v1(uuid,date) from public, anon;
revoke execute on function public.get_hr_employee_directory_v2(uuid,text,uuid,text,integer,integer) from public, anon;
revoke execute on function public.get_hr_employee_performance_detail_v2(uuid,uuid,date,date) from public, anon;
revoke execute on function public.get_hr_employee_profile_v2(uuid,uuid) from public, anon;
revoke execute on function public.get_hr_workspace_dashboard_v1(uuid,date) from public, anon;
revoke execute on function public.get_push_operational_status_v1() from public, anon;
revoke execute on function public.has_branch_access(uuid,uuid) from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.mark_attendance_verification_photo_deleted_v1(uuid) from public, anon;
revoke execute on function public.staff_attendance_check_in_v2(uuid,uuid,text,text,double precision,double precision,numeric,text,text,text) from public, anon;
revoke execute on function public.get_my_back_in_stock_reminders_v1(uuid) from public, anon;
revoke execute on function public.get_customer_branch_favorite_products_v1(uuid,uuid[]) from public, anon;
revoke execute on function public.set_back_in_stock_reminder_v1(uuid,uuid,uuid,boolean) from public, anon;

-- Explicitly retain the intended authenticated/service API surface.
grant execute on function public.get_hr_attendance_control_v1(uuid,date) to authenticated, service_role;
grant execute on function public.get_hr_employee_directory_v2(uuid,text,uuid,text,integer,integer) to authenticated, service_role;
grant execute on function public.get_hr_employee_performance_detail_v2(uuid,uuid,date,date) to authenticated, service_role;
grant execute on function public.get_hr_employee_profile_v2(uuid,uuid) to authenticated, service_role;
grant execute on function public.get_hr_workspace_dashboard_v1(uuid,date) to authenticated, service_role;
grant execute on function public.get_push_operational_status_v1() to authenticated, service_role;
grant execute on function public.has_branch_access(uuid,uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.mark_attendance_verification_photo_deleted_v1(uuid) to authenticated, service_role;
grant execute on function public.staff_attendance_check_in_v2(uuid,uuid,text,text,double precision,double precision,numeric,text,text,text) to authenticated, service_role;
grant execute on function public.get_my_back_in_stock_reminders_v1(uuid) to authenticated, service_role;
grant execute on function public.get_customer_branch_favorite_products_v1(uuid,uuid[]) to authenticated, service_role;
grant execute on function public.set_back_in_stock_reminder_v1(uuid,uuid,uuid,boolean) to authenticated, service_role;

-- Trigger helpers are not browser RPCs.
revoke execute on function public.sync_product_collection_home_metadata() from public, anon, authenticated;
grant execute on function public.sync_product_collection_home_metadata() to service_role;
