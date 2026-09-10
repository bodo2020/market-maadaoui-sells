create table if not exists private.pos_return_payment_parts_v3 (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_payment_part_id uuid not null references private.pos_sale_payment_parts_v3(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  device_id uuid references public.pos_devices(id) on delete set null,
  payment_method_id uuid not null references public.pos_payment_methods(id) on delete restrict,
  part_order integer not null,
  method_code_snapshot text not null,
  method_name_snapshot text not null,
  method_type_snapshot text not null,
  settlement_account_id_snapshot uuid references public.payment_accounts(id) on delete restrict,
  original_payment_reference text,
  base_refund_amount numeric(12,2) not null,
  status text not null,
  provider_reference text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.users(id) on delete set null,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  constraint pos_return_payment_parts_v3_unique unique(return_id,sale_payment_part_id),
  constraint pos_return_payment_parts_v3_type_check check(method_type_snapshot in ('cash','card','digital_wallet','bank_transfer','other')),
  constraint pos_return_payment_parts_v3_status_check check(status in ('completed','pending','confirmed','failed')),
  constraint pos_return_payment_parts_v3_amount_check check(base_refund_amount > 0)
);

create index if not exists pos_return_payment_parts_v3_return_idx on private.pos_return_payment_parts_v3(return_id,part_order);
create index if not exists pos_return_payment_parts_v3_sale_idx on private.pos_return_payment_parts_v3(sale_id,created_at desc);
create index if not exists pos_return_payment_parts_v3_pending_idx on private.pos_return_payment_parts_v3(branch_id,status,created_at desc) where status='pending';
create index if not exists pos_return_payment_parts_v3_method_idx on private.pos_return_payment_parts_v3(payment_method_id,created_at desc);
create index if not exists pos_return_payment_parts_v3_shift_idx on private.pos_return_payment_parts_v3(shift_id) where shift_id is not null;
create index if not exists pos_return_payment_parts_v3_device_idx on private.pos_return_payment_parts_v3(device_id) where device_id is not null;
create index if not exists pos_return_payment_parts_v3_settlement_idx on private.pos_return_payment_parts_v3(settlement_account_id_snapshot) where settlement_account_id_snapshot is not null;
create index if not exists pos_return_payment_parts_v3_created_by_idx on private.pos_return_payment_parts_v3(created_by) where created_by is not null;
create index if not exists pos_return_payment_parts_v3_confirmed_by_idx on private.pos_return_payment_parts_v3(confirmed_by) where confirmed_by is not null;

alter table private.pos_return_payment_parts_v3 enable row level security;
revoke all on private.pos_return_payment_parts_v3 from public,anon,authenticated;

-- Preserve legacy single-entry protection while allowing one immutable ledger row per V3 refund part.
drop index if exists public.payment_ledger_return_once_idx;
create unique index payment_ledger_return_once_idx
  on public.payment_ledger(account_id,return_id,entry_type,coalesce(metadata->>'refund_part_v3_id',''))
  where return_id is not null;

create or replace function private.pos_return_payment_breakdown_v3(p_return_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'return_id',p.return_id,
    'sale_id',p.sale_id,
    'sale_payment_part_id',p.sale_payment_part_id,
    'payment_method_id',p.payment_method_id,
    'part_order',p.part_order,
    'code',p.method_code_snapshot,
    'name',p.method_name_snapshot,
    'method_type',p.method_type_snapshot,
    'settlement_account_id',p.settlement_account_id_snapshot,
    'original_payment_reference',p.original_payment_reference,
    'base_refund_amount',p.base_refund_amount,
    'status',p.status,
    'provider_reference',p.provider_reference,
    'confirmed_at',p.confirmed_at,
    'failed_at',p.failed_at,
    'failure_reason',p.failure_reason
  ) order by p.part_order),'[]'::jsonb)
  from private.pos_return_payment_parts_v3 p
  where p.return_id=p_return_id;
$$;
revoke all on function private.pos_return_payment_breakdown_v3(uuid) from public,anon,authenticated;

create or replace function public.get_pos_sale_return_preview_v3(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_sale public.sales%rowtype;
  v_breakdown jsonb;
  v_pending jsonb;
begin
  v_base:=public.get_pos_sale_return_preview(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  v_breakdown:=coalesce(v_sale.payment_breakdown,private.pos_sale_payment_breakdown_v3(v_sale.id),'[]'::jsonb);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'return_id',p.return_id,'amount',p.base_refund_amount,'status',p.status,
    'payment_method_id',p.payment_method_id,'payment_method_code',p.method_code_snapshot,
    'payment_method_name',p.method_name_snapshot,'payment_method_type',p.method_type_snapshot,
    'original_payment_reference',p.original_payment_reference,'created_at',p.created_at
  ) order by p.created_at,p.part_order),'[]'::jsonb)
  into v_pending
  from private.pos_return_payment_parts_v3 p
  where p.sale_id=p_sale_id and p.status='pending';
  return v_base||jsonb_build_object('return_version',3,'payment_breakdown',v_breakdown,'pending_payment_refunds',v_pending);
end;
$$;
revoke all on function public.get_pos_sale_return_preview_v3(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v3(uuid) to authenticated;

create or replace function public.create_pos_sale_return_v3(
  p_request_id uuid,
  p_sale_id uuid,
  p_device_id uuid,
  p_device_token text,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_return public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_part private.pos_sale_payment_parts_v3%rowtype;
  v_part_count integer:=0;
  v_breakdown jsonb:='[]'::jsonb;
  v_orig_noncash numeric(12,2):=0;
  v_prev_noncash numeric(12,2):=0;
  v_target_noncash numeric(12,2):=0;
  v_cum_orig numeric(12,2):=0;
  v_prev_cum numeric(12,2):=0;
  v_target_cum numeric(12,2):=0;
  v_prev_cum_before numeric(12,2):=0;
  v_target_cum_before numeric(12,2):=0;
  v_part_refund numeric(12,2):=0;
  v_allocated numeric(12,2):=0;
  v_cash_sale_part private.pos_sale_payment_parts_v3%rowtype;
begin
  v_result:=public.create_pos_sale_return(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason);
  select * into v_sale from public.sales where id=p_sale_id;
  select * into v_return from public.returns where id=nullif(v_result->>'id','')::uuid;
  if v_sale.id is null or v_return.id is null then raise exception using errcode='55000',message='RETURN_NOT_CONFIRMED'; end if;

  select count(*) into v_part_count from private.pos_sale_payment_parts_v3 where sale_id=v_sale.id;
  if v_part_count<=1 then
    return v_result||jsonb_build_object('return_version',2,'refund_breakdown','[]'::jsonb);
  end if;

  if exists(select 1 from private.pos_return_payment_parts_v3 where return_id=v_return.id) then
    v_breakdown:=private.pos_return_payment_breakdown_v3(v_return.id);
    return (v_result-'card_refund')||jsonb_build_object(
      'return_version',3,
      'refund_breakdown',v_breakdown,
      'payment_refunds_pending',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_breakdown) x where x->>'status'='pending'),'[]'::jsonb),
      'card_refund_id',null,
      'card_refund_pending',exists(select 1 from private.pos_return_payment_parts_v3 where return_id=v_return.id and status='pending')
    );
  end if;

  if v_return.refund_cash_amount>0 then
    select * into v_cash_sale_part
    from private.pos_sale_payment_parts_v3
    where sale_id=v_sale.id and method_type_snapshot='cash'
    order by part_order limit 1;
    if v_cash_sale_part.id is null then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;
    insert into private.pos_return_payment_parts_v3(
      return_id,sale_id,sale_payment_part_id,branch_id,shift_id,device_id,payment_method_id,part_order,
      method_code_snapshot,method_name_snapshot,method_type_snapshot,settlement_account_id_snapshot,
      original_payment_reference,base_refund_amount,status,created_by,confirmed_by,confirmed_at
    ) values(
      v_return.id,v_sale.id,v_cash_sale_part.id,v_return.branch_id,v_return.shift_id,v_return.device_id,
      v_cash_sale_part.payment_method_id,v_cash_sale_part.part_order,v_cash_sale_part.method_code_snapshot,
      v_cash_sale_part.method_name_snapshot,v_cash_sale_part.method_type_snapshot,v_cash_sale_part.settlement_account_id_snapshot,
      v_cash_sale_part.reference,v_return.refund_cash_amount,'completed',auth.uid(),auth.uid(),now()
    );
  end if;

  if v_return.refund_card_amount>0 then
    select coalesce(sum(base_amount),0) into v_orig_noncash
    from private.pos_sale_payment_parts_v3 where sale_id=v_sale.id and method_type_snapshot<>'cash';
    if v_orig_noncash<=0 then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;

    select coalesce(sum(refund_card_amount),0) into v_prev_noncash
    from public.returns where sale_id=v_sale.id and status='approved' and id<>v_return.id;
    v_target_noncash:=round(v_prev_noncash+v_return.refund_card_amount,2);
    if v_target_noncash>v_orig_noncash+0.009 then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;

    -- The legacy flow creates one aggregate pending electronic refund. Replace it atomically with per-method V3 rows.
    delete from public.pos_card_refunds where return_id=v_return.id and status='pending';

    for v_part in
      select * from private.pos_sale_payment_parts_v3
      where sale_id=v_sale.id and method_type_snapshot<>'cash'
      order by part_order
    loop
      v_cum_orig:=round(v_cum_orig+v_part.base_amount,2);
      if v_cum_orig>=v_orig_noncash-0.009 then
        v_prev_cum:=v_prev_noncash;
        v_target_cum:=v_target_noncash;
      else
        v_prev_cum:=round(v_prev_noncash*v_cum_orig/v_orig_noncash,2);
        v_target_cum:=round(v_target_noncash*v_cum_orig/v_orig_noncash,2);
      end if;
      v_part_refund:=round((v_target_cum-v_target_cum_before)-(v_prev_cum-v_prev_cum_before),2);
      v_prev_cum_before:=v_prev_cum;
      v_target_cum_before:=v_target_cum;
      if v_part_refund>0 then
        insert into private.pos_return_payment_parts_v3(
          return_id,sale_id,sale_payment_part_id,branch_id,shift_id,device_id,payment_method_id,part_order,
          method_code_snapshot,method_name_snapshot,method_type_snapshot,settlement_account_id_snapshot,
          original_payment_reference,base_refund_amount,status,created_by
        ) values(
          v_return.id,v_sale.id,v_part.id,v_return.branch_id,v_return.shift_id,v_return.device_id,
          v_part.payment_method_id,v_part.part_order,v_part.method_code_snapshot,v_part.method_name_snapshot,
          v_part.method_type_snapshot,v_part.settlement_account_id_snapshot,v_part.reference,v_part_refund,'pending',auth.uid()
        );
        v_allocated:=round(v_allocated+v_part_refund,2);
      end if;
    end loop;
    if abs(v_allocated-v_return.refund_card_amount)>0.009 then
      raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID',detail=jsonb_build_object('expected',v_return.refund_card_amount,'allocated',v_allocated)::text;
    end if;
  end if;

  v_breakdown:=private.pos_return_payment_breakdown_v3(v_return.id);
  return (v_result-'card_refund')||jsonb_build_object(
    'return_version',3,
    'refund_breakdown',v_breakdown,
    'payment_refunds_pending',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_breakdown) x where x->>'status'='pending'),'[]'::jsonb),
    'card_refund_id',null,
    'card_refund_pending',exists(select 1 from private.pos_return_payment_parts_v3 where return_id=v_return.id and status='pending')
  );
end;
$$;
revoke all on function public.create_pos_sale_return_v3(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_pos_sale_return_v3(uuid,uuid,uuid,text,jsonb,text) to authenticated;

create or replace function public.list_pos_sale_pending_payment_refunds_v3(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_sale public.sales%rowtype;
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null or v_sale.branch_id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  if not public.staff_has_permission('sales.refund',v_sale.branch_id) and not public.staff_has_permission('finance.manage',v_sale.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'return_id',p.return_id,'sale_id',p.sale_id,'amount',p.base_refund_amount,'status',p.status,
    'created_at',p.created_at,'provider_reference',p.provider_reference,'payment_method_id',p.payment_method_id,
    'payment_method_code',p.method_code_snapshot,'payment_method_name',p.method_name_snapshot,
    'payment_method_type',p.method_type_snapshot,'payment_reference',p.original_payment_reference
  ) order by p.created_at,p.part_order),'[]'::jsonb)
  into v_rows
  from private.pos_return_payment_parts_v3 p
  where p.sale_id=p_sale_id and p.status='pending';
  return v_rows;
end;
$$;
revoke all on function public.list_pos_sale_pending_payment_refunds_v3(uuid) from public,anon;
grant execute on function public.list_pos_sale_pending_payment_refunds_v3(uuid) to authenticated;

create or replace function public.confirm_pos_payment_refund_v3(p_refund_id uuid,p_provider_reference text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_refund private.pos_return_payment_parts_v3%rowtype;
  v_return public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_reference text;
  v_ledger_recorded boolean:=false;
  v_pending integer:=0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_refund from private.pos_return_payment_parts_v3 where id=p_refund_id for update;
  if v_refund.id is null then raise exception using errcode='22023',message='REFUND_NOT_FOUND'; end if;
  if v_refund.method_type_snapshot='cash' then raise exception using errcode='22023',message='REFUND_NOT_PENDING'; end if;
  if not public.staff_has_permission('sales.refund',v_refund.branch_id) and not public.staff_has_permission('finance.manage',v_refund.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;
  select * into v_return from public.returns where id=v_refund.return_id for update;
  select * into v_sale from public.sales where id=v_refund.sale_id;

  if v_refund.status='confirmed' then
    select exists(select 1 from public.payment_ledger l where l.return_id=v_refund.return_id and l.metadata->>'refund_part_v3_id'=v_refund.id::text) into v_ledger_recorded;
    return to_jsonb(v_refund)||jsonb_build_object('return_status',v_return.refund_status,'payment_ledger_recorded',v_ledger_recorded,'idempotent',true);
  end if;
  if v_refund.status<>'pending' then raise exception using errcode='22023',message='REFUND_NOT_PENDING'; end if;

  v_reference:=trim(coalesce(p_provider_reference,''));
  if length(v_reference)<3 then raise exception using errcode='22023',message='PROVIDER_REFERENCE_REQUIRED'; end if;

  update private.pos_return_payment_parts_v3
    set status='confirmed',provider_reference=v_reference,confirmed_by=auth.uid(),confirmed_at=now()
  where id=v_refund.id returning * into v_refund;

  if v_refund.settlement_account_id_snapshot is not null and v_refund.base_refund_amount>0 then
    insert into public.payment_ledger(
      account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by,return_id,sale_id
    )
    select
      v_refund.settlement_account_id_snapshot,v_refund.branch_id,'pos_sale_refund',-v_refund.base_refund_amount,
      v_refund.method_code_snapshot,v_reference,'رد POS - فاتورة '||v_sale.invoice_number,
      jsonb_build_object(
        'sale_id',v_sale.id,'return_id',v_return.id,'refund_part_v3_id',v_refund.id,
        'sale_payment_part_id',v_refund.sale_payment_part_id,'payment_method_id',v_refund.payment_method_id,
        'payment_method',v_refund.method_name_snapshot,'original_payment_reference',v_refund.original_payment_reference,
        'mixed_payment_refund',true
      ),auth.uid(),v_return.id,v_sale.id
    where not exists(
      select 1 from public.payment_ledger l
      where l.return_id=v_return.id and l.metadata->>'refund_part_v3_id'=v_refund.id::text
    );
  end if;

  select count(*) into v_pending from private.pos_return_payment_parts_v3 where return_id=v_return.id and status='pending';
  if v_pending=0 then
    update public.returns set refund_status='completed',updated_at=now() where id=v_return.id returning * into v_return;
  end if;

  select exists(select 1 from public.payment_ledger l where l.return_id=v_return.id and l.metadata->>'refund_part_v3_id'=v_refund.id::text) into v_ledger_recorded;
  return to_jsonb(v_refund)||jsonb_build_object('return_status',v_return.refund_status,'payment_ledger_recorded',v_ledger_recorded,'pending_count',v_pending,'idempotent',false);
end;
$$;
revoke all on function public.confirm_pos_payment_refund_v3(uuid,text) from public,anon;
grant execute on function public.confirm_pos_payment_refund_v3(uuid,text) to authenticated;
