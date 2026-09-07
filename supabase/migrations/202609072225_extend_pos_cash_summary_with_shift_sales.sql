create or replace function public.get_my_pos_cash_summary(p_device_id uuid, p_device_token text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_account uuid;
  v_balance numeric;
  v_sales numeric;
  v_refunds numeric;
  v_expenses numeric;
  v_in numeric;
  v_out numeric;
  v_adjustments numeric;
  v_sales_count bigint := 0;
  v_sales_total numeric := 0;
  v_card_sales numeric := 0;
  v_cash_paid numeric := 0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());

  select id into v_account
  from public.cash_accounts
  where device_id=v_device.id and account_type='pos_drawer' and active
  limit 1;
  if v_account is null then raise exception using errcode='55000',message='DRAWER_ACCOUNT_MISSING'; end if;

  select * into v_shift
  from public.pos_shifts
  where user_id=auth.uid()
    and device_id=v_device.id
    and branch_id=v_device.branch_id
    and status='open'
  order by opened_at desc
  limit 1;

  v_balance:=private.cash_account_balance(v_account);

  select
    coalesce(sum(signed_amount) filter(where entry_type='sale_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='refund_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='expense_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='transfer_in'),0),
    coalesce(-sum(signed_amount) filter(where entry_type='transfer_out'),0),
    coalesce(sum(signed_amount) filter(where entry_type in ('shift_open_reconciliation','shift_close_variance')),0)
  into v_sales,v_refunds,v_expenses,v_in,v_out,v_adjustments
  from public.cash_ledger
  where shift_id=v_shift.id;

  if v_shift.id is not null then
    select
      count(*),
      coalesce(sum(total),0),
      coalesce(sum(card_amount),0),
      coalesce(sum(cash_amount),0)
    into v_sales_count,v_sales_total,v_card_sales,v_cash_paid
    from public.sales
    where shift_id=v_shift.id;
  end if;

  return jsonb_build_object(
    'drawer_account_id',v_account,
    'drawer_balance',v_balance,
    'branch_id',v_device.branch_id,
    'device_id',v_device.id,
    'device_name',v_device.name,
    'shift_id',v_shift.id,
    'shift_opened_at',v_shift.opened_at,
    'opening_cash',v_shift.opening_cash,
    'cash_sales',v_sales,
    'cash_refunds',v_refunds,
    'cash_expenses',v_expenses,
    'transfers_in',v_in,
    'transfers_out',v_out,
    'adjustments',v_adjustments,
    'sales_count',v_sales_count,
    'sales_total',v_sales_total,
    'card_sales',v_card_sales,
    'cash_paid_total',v_cash_paid
  );
end;
$function$;

grant execute on function public.get_my_pos_cash_summary(uuid,text) to authenticated;
