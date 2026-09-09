create or replace function private.route_approval_task_notification_to_center_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.source_kind in ('inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance') then
    update private.notification_events_v2
       set action_url='/approvals',
           action_label='فتح الموافقة',
           updated_at=now()
     where source_kind='operations_task'
       and source_id=new.id
       and status='active';
  end if;
  return new;
end;
$function$;

drop trigger if exists zz_operations_task_approval_notification_route_v1 on public.operations_tasks;
create trigger zz_operations_task_approval_notification_route_v1
after insert or update of status,claimed_by,due_at,title,description,priority
on public.operations_tasks
for each row execute function private.route_approval_task_notification_to_center_v1();

update private.notification_events_v2 ne
   set action_url='/approvals', action_label='فتح الموافقة', updated_at=now()
  from public.operations_tasks t
 where ne.source_kind='operations_task'
   and ne.source_id=t.id
   and ne.status='active'
   and t.source_kind in ('inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance');
