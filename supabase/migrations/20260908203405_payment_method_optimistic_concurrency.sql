-- Prevent an already-open settings form from silently overwriting newer payment config.
-- Existing clients remain compatible when updated_at is absent; current clients send it.

create or replace function public.get_pos_payment_methods(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not (private.can_operate_cash_branch(p_branch_id)
          or private.staff_is_super_admin(auth.uid())
          or public.staff_has_permission('finance.view',p_branch_id)
          or public.staff_has_permission('finance.manage',p_branch_id)
          or public.staff_has_permission('branch.manage_settings',p_branch_id)) then
    raise exception using errcode='42501',message='PAYMENT_METHOD_ACCESS_DENIED';
  end if;
  perform private.ensure_default_pos_payment_methods(p_branch_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',m.id,'branch_id',m.branch_id,'code',m.code,'name',m.name,'method_type',m.method_type,
      'active',m.active,'sort_order',m.sort_order,'fee_type',m.fee_type,'fee_value',m.fee_value,
      'fee_bearer',m.fee_bearer,'require_reference',m.require_reference,
      'settlement_account_id',m.settlement_account_id,'metadata',m.metadata,'updated_at',m.updated_at
    ) order by m.sort_order,m.name)
    from public.pos_payment_methods m
    where m.branch_id=p_branch_id
      and coalesce(m.metadata->>'archived','false') <> 'true'
  ),'[]'::jsonb);
end
$function$;

create or replace function public.save_pos_payment_method(p_branch_id uuid, p_method jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid; v_code text; v_name text; v_type text; v_fee_type text; v_fee_bearer text;
  v_fee numeric; v_sort integer; v_active boolean; v_require_ref boolean; v_account uuid;
  v_saved public.pos_payment_methods%rowtype;
  v_metadata jsonb;
  v_expected_updated_at timestamptz;
  v_current_updated_at timestamptz;
  v_existing_account uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('branch.manage_settings',p_branch_id)) then
    raise exception using errcode='42501',message='PAYMENT_METHOD_MANAGE_DENIED';
  end if;
  begin v_id:=nullif(p_method->>'id','')::uuid; exception when others then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD_ID'; end;
  begin v_expected_updated_at:=nullif(p_method->>'updated_at','')::timestamptz; exception when others then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD_VERSION'; end;
  v_code:=lower(btrim(coalesce(p_method->>'code','')));
  v_name:=btrim(coalesce(p_method->>'name',''));
  v_type:=coalesce(nullif(p_method->>'method_type',''),'other');
  v_fee_type:=coalesce(nullif(p_method->>'fee_type',''),'none');
  v_fee_bearer:=coalesce(nullif(p_method->>'fee_bearer',''),'business');
  begin v_fee:=coalesce((p_method->>'fee_value')::numeric,0); exception when others then raise exception using errcode='22023',message='INVALID_PAYMENT_FEE'; end;
  begin v_sort:=coalesce((p_method->>'sort_order')::integer,100); exception when others then v_sort:=100; end;
  v_active:=coalesce((p_method->>'active')::boolean,true);
  v_require_ref:=coalesce((p_method->>'require_reference')::boolean,false);
  begin v_account:=nullif(p_method->>'settlement_account_id','')::uuid; exception when others then raise exception using errcode='22023',message='INVALID_SETTLEMENT_ACCOUNT'; end;
  v_metadata:=case when p_method ? 'metadata' then coalesce(p_method->'metadata','{}'::jsonb) else null end;

  if v_code !~ '^[a-z0-9_]{2,32}$' then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD_CODE'; end if;
  if length(v_name)<2 or length(v_name)>80 then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD_NAME'; end if;
  if v_type not in ('cash','card','digital_wallet','bank_transfer','other') then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD_TYPE'; end if;
  if v_fee_type not in ('none','percent','fixed') or v_fee_bearer not in ('customer','business') or v_fee<0 or (v_fee_type='percent' and v_fee>100) then raise exception using errcode='22023',message='INVALID_PAYMENT_FEE'; end if;
  if v_fee_type='none' then v_fee:=0; end if;

  if v_id is null then
    select id, settlement_account_id
    into v_id, v_account
    from public.pos_payment_methods
    where branch_id=p_branch_id
      and code=v_code
      and coalesce(metadata->>'archived','false')='true'
    limit 1;
  end if;

  if v_id is not null then
    select updated_at, settlement_account_id
      into v_current_updated_at, v_existing_account
    from public.pos_payment_methods
    where id=v_id and branch_id=p_branch_id
    for update;
    if not found then raise exception using errcode='22023',message='PAYMENT_METHOD_NOT_FOUND'; end if;
    if v_expected_updated_at is not null and v_current_updated_at is distinct from v_expected_updated_at then
      raise exception using errcode='40001',message='PAYMENT_METHOD_STALE';
    end if;
  end if;

  if v_type='cash' then
    v_account:=null;
  elsif v_account is not null then
    if not exists(select 1 from public.payment_accounts a where a.id=v_account and a.branch_id=p_branch_id) then
      raise exception using errcode='22023',message='INVALID_SETTLEMENT_ACCOUNT';
    end if;
  elsif v_existing_account is not null then
    v_account:=v_existing_account;
  end if;

  if v_type<>'cash' and v_account is null then
    insert into public.payment_accounts(branch_id,account_type,provider_code,name,currency,active)
    values(p_branch_id,'gateway_clearing','pos_'||v_code,v_name,'EGP',true)
    returning id into v_account;
  elsif v_type<>'cash' and v_account is not null then
    update public.payment_accounts set name=v_name,provider_code='pos_'||v_code,active=true,updated_at=now() where id=v_account and branch_id=p_branch_id;
  end if;

  if v_id is null then
    insert into public.pos_payment_methods(branch_id,code,name,method_type,active,sort_order,fee_type,fee_value,fee_bearer,require_reference,settlement_account_id,metadata,created_by,updated_by)
    values(p_branch_id,v_code,v_name,v_type,v_active,v_sort,v_fee_type,v_fee,v_fee_bearer,v_require_ref,v_account,coalesce(v_metadata,'{}'::jsonb),auth.uid(),auth.uid()) returning * into v_saved;
  else
    update public.pos_payment_methods set code=v_code,name=v_name,method_type=v_type,active=v_active,sort_order=v_sort,
      fee_type=v_fee_type,fee_value=v_fee,fee_bearer=v_fee_bearer,require_reference=v_require_ref,
      settlement_account_id=v_account,
      metadata=(case when v_metadata is null then coalesce(metadata,'{}'::jsonb) else v_metadata end) - 'archived' - 'archived_at' - 'archived_by',
      updated_by=auth.uid(),updated_at=now()
    where id=v_id and branch_id=p_branch_id returning * into v_saved;
    if v_saved.id is null then raise exception using errcode='22023',message='PAYMENT_METHOD_NOT_FOUND'; end if;
  end if;
  return to_jsonb(v_saved);
exception when unique_violation then
  raise exception using errcode='22023',message='PAYMENT_METHOD_CODE_EXISTS';
end
$function$;

revoke all on function public.get_pos_payment_methods(uuid) from public,anon;
grant execute on function public.get_pos_payment_methods(uuid) to authenticated;
revoke all on function public.save_pos_payment_method(uuid,jsonb) from public,anon;
grant execute on function public.save_pos_payment_method(uuid,jsonb) to authenticated;
