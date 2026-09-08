-- Finance Settlement Transfer V2
-- Moves POS electronic settlement balances atomically to the branch bank or branch safe.
-- Production migration: 20260908201544 / finance_settlement_transfer_v2.

alter table public.payment_settlements add column if not exists request_id uuid;
alter table public.payment_settlements add column if not exists request_fingerprint text;
alter table public.payment_settlements add column if not exists target_kind text not null default 'bank';
alter table public.payment_settlements add column if not exists cash_account_id uuid references public.cash_accounts(id);
alter table public.payment_settlements add column if not exists source_account_name_snapshot text;
alter table public.payment_settlements add column if not exists target_account_name_snapshot text;
alter table public.payment_settlements add column if not exists payment_method_name_snapshot text;
alter table public.payment_settlements alter column bank_account_id drop not null;

create unique index if not exists payment_settlements_request_id_unique
  on public.payment_settlements(request_id)
  where request_id is not null;
create index if not exists payment_settlements_branch_settled_idx
  on public.payment_settlements(branch_id,settled_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.payment_settlements'::regclass
      and conname='payment_settlements_target_kind_check'
  ) then
    alter table public.payment_settlements
      add constraint payment_settlements_target_kind_check
      check (target_kind in ('bank','safe'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.payment_settlements'::regclass
      and conname='payment_settlements_target_account_check'
  ) then
    alter table public.payment_settlements
      add constraint payment_settlements_target_account_check
      check (
        (target_kind='bank' and bank_account_id is not null and cash_account_id is null)
        or
        (target_kind='safe' and cash_account_id is not null and bank_account_id is null)
      );
  end if;
end $$;

create or replace function public.get_finance_settlement_workspace_v2(p_branch_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),10),200);
  v_can_manage boolean:=false;
  v_sources jsonb:='[]'::jsonb;
  v_targets jsonb:='[]'::jsonb;
  v_recent jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not (
    public.staff_has_permission('finance.view',p_branch_id)
    or public.staff_has_permission('finance.manage',p_branch_id)
    or private.staff_is_super_admin(auth.uid())
  ) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;

  v_can_manage:=public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',a.id,
    'account_type',a.account_type,
    'provider_code',a.provider_code,
    'account_name',a.name,
    'active',a.active,
    'balance',round(b.balance,2),
    'payment_method_id',pm.id,
    'payment_method_code',coalesce(pm.code,a.provider_code),
    'payment_method_name',coalesce(pm.name,a.name),
    'method_type',coalesce(pm.method_type,'other'),
    'method_active',pm.active
  ) order by case when coalesce(b.balance,0)>0 then 0 else 1 end,coalesce(pm.sort_order,999),a.name),'[]'::jsonb)
  into v_sources
  from public.payment_accounts a
  left join public.pos_payment_methods pm
    on pm.branch_id=a.branch_id and pm.settlement_account_id=a.id
  cross join lateral (select private.payment_account_balance(a.id) balance) b
  where a.branch_id=p_branch_id and a.account_type='gateway_clearing'
    and (a.active or pm.id is not null or abs(coalesce(b.balance,0))>0.005);

  with targets as (
    select pa.id account_id,'bank'::text target_kind,pa.name,pa.provider_code,pa.active,
      private.payment_account_balance(pa.id) balance
    from public.payment_accounts pa
    where pa.branch_id=p_branch_id and pa.account_type='bank' and pa.active
    union all
    select ca.id,'safe',ca.name,'branch_safe',ca.active,private.cash_account_balance(ca.id)
    from public.cash_accounts ca
    where ca.branch_id=p_branch_id and ca.account_type='branch_safe' and ca.active
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',account_id,'target_kind',target_kind,'name',name,
    'provider_code',provider_code,'active',active,'balance',round(balance,2)
  ) order by case when target_kind='safe' then 0 else 1 end,name),'[]'::jsonb)
  into v_targets from targets;

  select coalesce(jsonb_agg(jsonb_build_object(
    'settlement_id',s.id,
    'request_id',s.request_id,
    'payment_method',s.payment_method,
    'payment_method_name',coalesce(s.payment_method_name_snapshot,s.payment_method),
    'source_account_id',s.clearing_account_id,
    'source_account_name',coalesce(s.source_account_name_snapshot,src.name),
    'target_kind',s.target_kind,
    'target_account_id',case when s.target_kind='safe' then s.cash_account_id else s.bank_account_id end,
    'target_account_name',coalesce(s.target_account_name_snapshot,tca.name,tpa.name),
    'gross_amount',round(s.gross_amount,2),
    'fee_amount',round(s.fee_amount,2),
    'net_amount',round(s.net_amount,2),
    'provider_reference',s.provider_reference,
    'note',s.note,
    'settled_at',s.settled_at,
    'created_by',s.created_by,
    'created_by_name',u.name
  ) order by s.settled_at desc),'[]'::jsonb)
  into v_recent
  from (
    select * from public.payment_settlements
    where branch_id=p_branch_id
    order by settled_at desc
    limit v_limit
  ) s
  left join public.payment_accounts src on src.id=s.clearing_account_id
  left join public.payment_accounts tpa on tpa.id=s.bank_account_id
  left join public.cash_accounts tca on tca.id=s.cash_account_id
  left join public.users u on u.id=s.created_by;

  return jsonb_build_object(
    'version',2,
    'branch_id',p_branch_id,
    'permissions',jsonb_build_object('can_manage',v_can_manage),
    'sources',v_sources,
    'targets',v_targets,
    'recent_transfers',v_recent,
    'generated_at',now()
  );
end;
$function$;

create or replace function public.transfer_payment_settlement_v2(
  p_request_id uuid,
  p_branch_id uuid,
  p_source_account_id uuid,
  p_target_kind text,
  p_target_account_id uuid,
  p_gross_amount numeric,
  p_fee_amount numeric default 0,
  p_provider_reference text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_source public.payment_accounts%rowtype;
  v_target_payment public.payment_accounts%rowtype;
  v_target_cash public.cash_accounts%rowtype;
  v_existing public.payment_settlements%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_gross numeric;
  v_fee numeric;
  v_net numeric;
  v_source_balance numeric;
  v_target_balance numeric;
  v_settlement_id uuid;
  v_fingerprint text;
  v_target_id uuid;
  v_provider_reference text:=nullif(btrim(coalesce(p_provider_reference,'')),'');
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_branch_id is null or p_source_account_id is null then raise exception using errcode='22023',message='INVALID_TRANSFER_REQUEST'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid())) then
    raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';
  end if;
  if p_target_kind not in ('bank','safe') then raise exception using errcode='22023',message='INVALID_TARGET_KIND'; end if;

  begin
    v_gross:=round(p_gross_amount,2);
    v_fee:=round(coalesce(p_fee_amount,0),2);
  exception when others then
    raise exception using errcode='22023',message='INVALID_AMOUNT';
  end;
  if v_gross is null or v_gross<=0 or v_fee<0 or v_fee>=v_gross
     or v_gross::text in ('NaN','Infinity','-Infinity') or v_fee::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='INVALID_AMOUNT';
  end if;
  v_net:=round(v_gross-v_fee,2);

  select * into v_source from public.payment_accounts
  where id=p_source_account_id and branch_id=p_branch_id and account_type='gateway_clearing';
  if v_source.id is null then raise exception using errcode='22023',message='SOURCE_ACCOUNT_UNAVAILABLE'; end if;

  if p_target_kind='bank' then
    if p_target_account_id is null then
      v_target_id:=private.ensure_payment_account(p_branch_id,'bank','branch_bank');
    else
      v_target_id:=p_target_account_id;
    end if;
    select * into v_target_payment from public.payment_accounts
    where id=v_target_id and branch_id=p_branch_id and account_type='bank' and active;
    if v_target_payment.id is null then raise exception using errcode='22023',message='TARGET_ACCOUNT_UNAVAILABLE'; end if;
    if v_target_payment.id=v_source.id then raise exception using errcode='22023',message='SAME_ACCOUNT_TRANSFER'; end if;
  else
    if p_target_account_id is null then
      select * into v_target_cash from public.cash_accounts
      where branch_id=p_branch_id and account_type='branch_safe' and active
      order by created_at limit 1;
    else
      select * into v_target_cash from public.cash_accounts
      where id=p_target_account_id and branch_id=p_branch_id and account_type='branch_safe' and active;
    end if;
    if v_target_cash.id is null then raise exception using errcode='22023',message='TARGET_ACCOUNT_UNAVAILABLE'; end if;
    v_target_id:=v_target_cash.id;
  end if;

  select * into v_method from public.pos_payment_methods
  where branch_id=p_branch_id and settlement_account_id=v_source.id
  order by active desc,sort_order,updated_at desc
  limit 1;

  v_fingerprint:=md5(jsonb_build_array(
    p_branch_id,p_source_account_id,p_target_kind,v_target_id,v_gross,v_fee,
    v_provider_reference,v_note
  )::text);

  perform pg_advisory_xact_lock(hashtextextended('finance-settlement-request:'||p_request_id::text,76));
  select * into v_existing from public.payment_settlements where request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception using errcode='22023',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'version',2,'request_replayed',true,'settlement_id',v_existing.id,
      'gross_amount',v_existing.gross_amount,'fee_amount',v_existing.fee_amount,'net_amount',v_existing.net_amount,
      'target_kind',v_existing.target_kind,'source_account_id',v_existing.clearing_account_id,
      'target_account_id',case when v_existing.target_kind='safe' then v_existing.cash_account_id else v_existing.bank_account_id end
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('payment-account:'||v_source.id::text,42));
  v_source_balance:=private.payment_account_balance(v_source.id);
  if v_gross>round(v_source_balance,2) then raise exception using errcode='22023',message='INSUFFICIENT_SETTLEMENT_BALANCE'; end if;

  insert into public.payment_settlements(
    branch_id,payment_method,clearing_account_id,bank_account_id,cash_account_id,
    gross_amount,fee_amount,net_amount,provider_reference,note,created_by,
    request_id,request_fingerprint,target_kind,source_account_name_snapshot,target_account_name_snapshot,payment_method_name_snapshot
  ) values(
    p_branch_id,coalesce(nullif(v_method.code,''),v_source.provider_code),v_source.id,
    case when p_target_kind='bank' then v_target_payment.id else null end,
    case when p_target_kind='safe' then v_target_cash.id else null end,
    v_gross,v_fee,v_net,v_provider_reference,v_note,auth.uid(),
    p_request_id,v_fingerprint,p_target_kind,v_source.name,
    case when p_target_kind='bank' then v_target_payment.name else v_target_cash.name end,
    coalesce(nullif(v_method.name,''),v_source.name)
  ) returning id into v_settlement_id;

  if v_net>0 then
    insert into public.payment_ledger(
      account_id,branch_id,settlement_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by
    ) values(
      v_source.id,p_branch_id,v_settlement_id,'finance_settlement_out',-v_net,
      coalesce(nullif(v_method.code,''),v_source.provider_code),v_provider_reference,
      'تحويل تسوية من '||v_source.name,
      jsonb_build_object('target_kind',p_target_kind,'target_account_id',v_target_id,'request_id',p_request_id),auth.uid()
    );
  end if;
  if v_fee>0 then
    insert into public.payment_ledger(
      account_id,branch_id,settlement_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by
    ) values(
      v_source.id,p_branch_id,v_settlement_id,'finance_settlement_fee',-v_fee,
      coalesce(nullif(v_method.code,''),v_source.provider_code),v_provider_reference,
      'رسوم تحويل/سحب تسوية '||v_source.name,
      jsonb_build_object('target_kind',p_target_kind,'target_account_id',v_target_id,'request_id',p_request_id),auth.uid()
    );
  end if;

  if p_target_kind='bank' then
    insert into public.payment_ledger(
      account_id,branch_id,settlement_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by
    ) values(
      v_target_payment.id,p_branch_id,v_settlement_id,'finance_settlement_in',v_net,
      coalesce(nullif(v_method.code,''),v_source.provider_code),v_provider_reference,
      'استلام تسوية من '||v_source.name,
      jsonb_build_object('source_account_id',v_source.id,'request_id',p_request_id),auth.uid()
    );
    v_target_balance:=private.payment_account_balance(v_target_payment.id);
  else
    insert into public.cash_ledger(
      account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by
    ) values(
      v_target_cash.id,p_branch_id,auth.uid(),'payment_settlement_in',v_net,
      'payment_settlement',v_settlement_id,'توريد تسوية إلكترونية إلى الخزنة من '||v_source.name,
      jsonb_build_object('source_account_id',v_source.id,'payment_method',coalesce(nullif(v_method.code,''),v_source.provider_code),'request_id',p_request_id,'provider_reference',v_provider_reference),auth.uid()
    );
    v_target_balance:=private.cash_account_balance(v_target_cash.id);
  end if;

  return jsonb_build_object(
    'version',2,'request_replayed',false,'settlement_id',v_settlement_id,'request_id',p_request_id,
    'payment_method',coalesce(nullif(v_method.code,''),v_source.provider_code),
    'payment_method_name',coalesce(nullif(v_method.name,''),v_source.name),
    'source_account_id',v_source.id,'source_account_name',v_source.name,
    'target_kind',p_target_kind,'target_account_id',v_target_id,
    'target_account_name',case when p_target_kind='bank' then v_target_payment.name else v_target_cash.name end,
    'gross_amount',v_gross,'fee_amount',v_fee,'net_amount',v_net,
    'source_balance_after',private.payment_account_balance(v_source.id),
    'target_balance_after',v_target_balance,
    'provider_reference',v_provider_reference,'note',v_note
  );
end;
$function$;

revoke all on function public.get_finance_settlement_workspace_v2(uuid,integer) from public,anon;
revoke all on function public.transfer_payment_settlement_v2(uuid,uuid,uuid,text,uuid,numeric,numeric,text,text) from public,anon;
grant execute on function public.get_finance_settlement_workspace_v2(uuid,integer) to authenticated,service_role;
grant execute on function public.transfer_payment_settlement_v2(uuid,uuid,uuid,text,uuid,numeric,numeric,text,text) to authenticated,service_role;
