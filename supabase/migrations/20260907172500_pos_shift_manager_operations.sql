create or replace function public.list_branch_pos_shifts(
  p_branch_id uuid,
  p_status text default null,
  p_limit integer default 50
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.staff_has_permission('pos.manage_shifts',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_status is not null and p_status not in ('open','closed') then
    raise exception using errcode='22023',message='INVALID_SHIFT_STATUS';
  end if;

  return query
  select jsonb_build_object(
    'id',s.id,'user_id',s.user_id,'employee_name',u.name,
    'device_id',s.device_id,'device_name',d.name,'device_code',d.device_code,
    'branch_id',s.branch_id,'status',s.status,'opened_at',s.opened_at,'closed_at',s.closed_at,
    'opening_cash',s.opening_cash,'closing_cash',s.closing_cash,
    'expected_cash',case when s.status='open' then private.cash_account_balance(s.drawer_account_id) else s.expected_cash end,
    'cash_difference',s.cash_difference,'closing_notes',s.closing_notes,
    'sales_count',coalesce(x.sales_count,0),'sales_total',coalesce(x.sales_total,0),
    'cash_sales_total',coalesce(x.cash_sales_total,0),'card_sales_total',coalesce(x.card_sales_total,0),
    'drawer_balance',private.cash_account_balance(s.drawer_account_id)
  )
  from public.pos_shifts s
  join public.users u on u.id=s.user_id
  join public.pos_devices d on d.id=s.device_id
  left join lateral (
    select count(*)::bigint as sales_count,
      coalesce(sum(sa.total),0) as sales_total,
      coalesce(sum(sa.cash_amount),0) as cash_sales_total,
      coalesce(sum(sa.card_amount),0) as card_sales_total
    from public.sales sa where sa.shift_id=s.id
  ) x on true
  where s.branch_id=p_branch_id and (p_status is null or s.status=p_status)
  order by case when s.status='open' then 0 else 1 end,coalesce(s.closed_at,s.opened_at) desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

grant execute on function public.list_branch_pos_shifts(uuid,text,integer) to authenticated;

create or replace function public.manager_close_pos_shift(p_shift_id uuid,p_closing_cash numeric,p_notes text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_shift public.pos_shifts%rowtype; v_device public.pos_devices%rowtype;
  v_expected numeric; v_diff numeric; v_movement numeric; v_sales_count bigint; v_sales_total numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_closing_cash is null or p_closing_cash<0 or p_closing_cash::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='INVALID_CLOSING_CASH';
  end if;
  if nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception using errcode='22023',message='CLOSING_REASON_REQUIRED'; end if;

  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  select * into v_device from public.pos_devices where id=v_shift.device_id;

  v_expected:=private.cash_account_balance(v_shift.drawer_account_id);
  v_diff:=round(p_closing_cash-v_expected,2);
  select coalesce(sum(l.signed_amount),0) into v_movement from public.cash_ledger l where l.shift_id=v_shift.id;
  select count(*),coalesce(sum(total),0) into v_sales_count,v_sales_total from public.sales where shift_id=v_shift.id;

  update public.pos_shifts set status='closed',closed_at=now(),closing_cash=round(p_closing_cash,2),expected_cash=v_expected,
    cash_difference=v_diff,closing_notes='إغلاق إداري: '||btrim(p_notes),closed_by=auth.uid(),updated_at=now()
  where id=v_shift.id returning * into v_shift;

  if v_diff<>0 then
    insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_shift.drawer_account_id,v_shift.branch_id,v_shift.id,v_shift.device_id,v_shift.user_id,'shift_close_variance',v_diff,'pos_shift',v_shift.id,
      'تسوية فرق إغلاق وردية إداري',jsonb_build_object('expected_cash',v_expected,'counted_cash',round(p_closing_cash,2),'manager_close',true,'reason',btrim(p_notes)),auth.uid());
  end if;

  return to_jsonb(v_shift)||jsonb_build_object('cash_movement',v_movement,'sales_count',v_sales_count,'sales_total',v_sales_total,
    'drawer_balance_after',private.cash_account_balance(v_shift.drawer_account_id),'employee_name',(select u.name from public.users u where u.id=v_shift.user_id),
    'device_name',v_device.name,'branch_name',(select b.name from public.branches b where b.id=v_shift.branch_id));
end;
$$;

grant execute on function public.manager_close_pos_shift(uuid,numeric,text) to authenticated;
