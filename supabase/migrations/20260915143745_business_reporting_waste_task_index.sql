create index if not exists operations_tasks_waste_reporting_idx
on public.operations_tasks (branch_id, completed_at desc, source_id)
where task_type='inventory_adjustment_review'
  and source_kind='inventory_adjustment'
  and status='completed';
