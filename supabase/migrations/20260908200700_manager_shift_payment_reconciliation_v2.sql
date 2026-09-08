-- Manager POS shift close must reconcile every payment method, not cash only.
-- Production migration: 20260908200700 / manager_shift_payment_reconciliation_v2.

create or replace function public.get_manager_pos_shift_reconciliation_preview(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_shift public.pos_shifts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_shift from public.pos_shifts where id=p_shift_id;
  if v_shift.id is null or v_shift.status<>'open' then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  return private.pos_shift_reconciliation_preview(v_shift.id);
end;
$function$;

create or replace function public.manager_close_pos_shift_v2(
  p_shift_id uuid,
  p_reconciliation jsonb,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_shift public.pos_shifts%rowtype;
  v_preview jsonb;
  v_method jsonb;
  v_count_row jsonb;
  v_expected numeric;
  v_counted numeric;
  v_variance numeric;
  v_reason text;
  v_cash_counted numeric;
  v_expected_count integer := 0;
  v_payload_count integer := 0;
  v_dup_count integer := 0;
  v_result jsonb;
  v_saved jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_notes,'')),'') is null then raise exception using errcode='22023',message='CLOSING_REASON_REQUIRED'; end if;
  if jsonb_typeof(p_reconciliation) is distinct from 'array' then raise exception using errcode='22023',message='INVALID_RECONCILIATION'; end if;

  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;

  v_preview:=private.pos_shift_reconciliation_preview(v_shift.id);
  v_expected_count:=jsonb_array_length(v_preview->'methods');
  v_payload_count:=jsonb_array_length(p_reconciliation);
  if v_payload_count<>v_expected_count then raise exception using errcode='22023',message='RECONCILIATION_METHOD_MISMATCH'; end if;

  for v_method in select value from jsonb_array_elements(v_preview->'methods') loop
    select count(*),min(value::text)::jsonb into v_dup_count,v_count_row
    from jsonb_array_elements(p_reconciliation)
    where value->>'code'=v_method->>'code';
    if v_dup_count<>1 or v_count_row is null then raise exception using errcode='22023',message='RECONCILIATION_METHOD_MISMATCH'; end if;
    begin
      v_counted:=(v_count_row->>'counted_amount')::numeric;
    exception when others then
      raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT';
    end;
    if v_counted is null or v_counted::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT'; end if;
    if v_method->>'code'='cash' and v_counted<0 then raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT'; end if;
    v_expected:=round(coalesce((v_method->>'expected_amount')::numeric,0),2);
    v_counted:=round(v_counted,2);
    v_variance:=round(v_counted-v_expected,2);
    v_reason:=nullif(btrim(coalesce(v_count_row->>'variance_reason','')),'');
    if abs(v_variance)>0.005 and v_reason is null then raise exception using errcode='22023',message='RECONCILIATION_REASON_REQUIRED|'||(v_method->>'code'); end if;
    if v_method->>'code'='cash' then v_cash_counted:=v_counted; end if;
  end loop;

  if v_cash_counted is null then raise exception using errcode='22023',message='CASH_RECONCILIATION_REQUIRED'; end if;

  v_result:=public.manager_close_pos_shift(p_shift_id,v_cash_counted,btrim(p_notes));

  for v_method in select value from jsonb_array_elements(v_preview->'methods') loop
    select value into v_count_row from jsonb_array_elements(p_reconciliation) where value->>'code'=v_method->>'code' limit 1;
    v_expected:=round(coalesce((v_method->>'expected_amount')::numeric,0),2);
    v_counted:=round((v_count_row->>'counted_amount')::numeric,2);
    v_variance:=round(v_counted-v_expected,2);
    v_reason:=nullif(btrim(coalesce(v_count_row->>'variance_reason','')),'');

    insert into public.pos_shift_payment_reconciliations(
      shift_id,branch_id,payment_method_id,method_code,method_name_snapshot,method_type_snapshot,
      settlement_account_id_snapshot,expected_source,sale_count,base_amount,charged_amount,
      customer_fee_amount,merchant_fee_amount,confirmed_refund_amount,pending_refund_amount,
      expected_amount,counted_amount,variance_amount,variance_reason,confirmed_by,confirmed_by_name_snapshot,confirmed_at
    ) values(
      v_shift.id,v_shift.branch_id,nullif(v_method->>'payment_method_id','')::uuid,v_method->>'code',v_method->>'name',v_method->>'method_type',
      nullif(v_method->>'settlement_account_id','')::uuid,v_method->>'expected_source',coalesce((v_method->>'sale_count')::bigint,0),
      round(coalesce((v_method->>'base_amount')::numeric,0),2),round(coalesce((v_method->>'charged_amount')::numeric,0),2),
      round(coalesce((v_method->>'customer_fee_amount')::numeric,0),2),round(coalesce((v_method->>'merchant_fee_amount')::numeric,0),2),
      round(coalesce((v_method->>'confirmed_refund_amount')::numeric,0),2),round(coalesce((v_method->>'pending_refund_amount')::numeric,0),2),
      v_expected,v_counted,v_variance,v_reason,auth.uid(),(select u.name from public.users u where u.id=auth.uid()),now()
    );

    v_saved:=v_saved||jsonb_build_array(jsonb_build_object(
      'code',v_method->>'code','name',v_method->>'name','method_type',v_method->>'method_type',
      'expected_amount',v_expected,'counted_amount',v_counted,'variance_amount',v_variance,'variance_reason',v_reason,
      'expected_source',v_method->>'expected_source'
    ));
  end loop;

  return v_result||jsonb_build_object(
    'reconciliation_version',2,
    'manager_close',true,
    'payment_reconciliations',v_saved
  );
end;
$function$;

revoke all on function public.manager_close_pos_shift(uuid,numeric,text) from public,anon;
grant execute on function public.manager_close_pos_shift(uuid,numeric,text) to authenticated,service_role;
revoke all on function public.get_manager_pos_shift_reconciliation_preview(uuid) from public,anon;
revoke all on function public.manager_close_pos_shift_v2(uuid,jsonb,text) from public,anon;
grant execute on function public.get_manager_pos_shift_reconciliation_preview(uuid) to authenticated,service_role;
grant execute on function public.manager_close_pos_shift_v2(uuid,jsonb,text) to authenticated,service_role;
