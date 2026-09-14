create or replace function public.request_my_delivery_cash_handover_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_branch_id uuid;
  v_balance numeric(12,2);
  v_handover private.delivery_cash_handovers_v1%rowtype;
  v_target_shift_id uuid;
  v_target jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.users u where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)) then
    raise exception 'delivery_access_required';
  end if;

  select coalesce(sum(amount),0) into v_balance from private.delivery_cash_ledger_v1 where driver_user_id=v_uid;
  if v_balance <= 0 then raise exception 'no_cash_to_handover'; end if;
  if exists(select 1 from private.delivery_cash_handovers_v1 where driver_user_id=v_uid and status='pending') then
    raise exception 'cash_handover_already_pending';
  end if;

  select coalesce(
    (select ubr.branch_id from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc,ubr.updated_at desc limit 1),
    (select ep.primary_branch_id from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.employment_status <> 'terminated' limit 1)
  ) into v_branch_id;
  if v_branch_id is null then raise exception 'delivery_branch_required'; end if;

  insert into private.delivery_cash_handovers_v1(driver_user_id,branch_id,amount)
  values(v_uid,v_branch_id,v_balance)
  returning * into v_handover;

  select s.id into v_target_shift_id
  from public.pos_shifts s
  join public.pos_devices d on d.id=s.device_id and d.active and d.revoked_at is null
  where s.branch_id=v_branch_id
    and s.status='open'
    and coalesce(
      s.drawer_account_id,
      (select ca.id from public.cash_accounts ca where ca.device_id=d.id and ca.account_type='pos_drawer' and ca.active order by ca.created_at desc limit 1)
    ) is not null
  order by
    (coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '10 minutes') desc,
    d.last_seen_at desc nulls last,
    s.opened_at desc
  limit 1;

  if v_target_shift_id is not null then
    begin
      v_target:=public.assign_my_delivery_cash_handover_target_v1(v_handover.id,v_target_shift_id);
    exception when others then
      v_target:=jsonb_build_object('assigned',false,'reason','auto_target_failed');
    end;
  else
    v_target:=jsonb_build_object('assigned',false,'reason','no_open_pos_shift');
  end if;

  return jsonb_build_object(
    'ok',true,
    'handover_id',v_handover.id,
    'amount',v_handover.amount,
    'status',v_handover.status,
    'target',coalesce(v_target,'{}'::jsonb)
  );
end;
$function$;
