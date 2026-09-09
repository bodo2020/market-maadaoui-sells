revoke execute on function public.clear_my_pos_workspace(uuid) from public, anon;
grant execute on function public.clear_my_pos_workspace(uuid) to authenticated, service_role;

revoke execute on function public.get_branch_pos_staff_status(uuid) from public, anon;
grant execute on function public.get_branch_pos_staff_status(uuid) to authenticated, service_role;

revoke execute on function public.get_my_pos_workspace(uuid) from public, anon;
grant execute on function public.get_my_pos_workspace(uuid) to authenticated, service_role;

revoke execute on function public.get_pos_runtime_status(uuid,text) from public, anon;
grant execute on function public.get_pos_runtime_status(uuid,text) to authenticated, service_role;

revoke execute on function public.list_branch_pos_operational_events(uuid,integer,text) from public, anon;
grant execute on function public.list_branch_pos_operational_events(uuid,integer,text) to authenticated, service_role;

revoke execute on function public.list_branch_pos_shifts(uuid,text,integer) from public, anon;
grant execute on function public.list_branch_pos_shifts(uuid,text,integer) to authenticated, service_role;

revoke execute on function public.list_pos_devices(uuid) from public, anon;
grant execute on function public.list_pos_devices(uuid) to authenticated, service_role;

revoke execute on function public.log_pos_operational_event(uuid,text,text,text,text,jsonb) from public, anon;
grant execute on function public.log_pos_operational_event(uuid,text,text,text,text,jsonb) to authenticated, service_role;

revoke execute on function public.save_my_pos_workspace(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.save_my_pos_workspace(uuid,uuid,jsonb,text) to authenticated, service_role;

revoke execute on function public.set_staff_pos_access(uuid,uuid,boolean) from public, anon;
grant execute on function public.set_staff_pos_access(uuid,uuid,boolean) to authenticated, service_role;

revoke execute on function public.set_staff_pos_pin(uuid,uuid,text) from public, anon;
grant execute on function public.set_staff_pos_pin(uuid,uuid,text) to authenticated, service_role;

revoke execute on function public.update_pos_device_runtime_settings(uuid,integer,numeric) from public, anon;
grant execute on function public.update_pos_device_runtime_settings(uuid,integer,numeric) to authenticated, service_role;
