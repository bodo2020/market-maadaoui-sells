-- M19a — Marketplace partner settlement control.
-- Adds a finance-safe preview and an audited Draft -> Approved -> Paid/Cancelled lifecycle.

create unique index if not exists merchant_settlements_paid_external_reference_v1_idx
  on public.merchant_settlements(merchant_id, external_reference)
  where settlement_kind='marketplace' and status='paid' and external_reference is not null;

create or replace function private.can_manage_marketplace_settlement_v1(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchants m
    where m.id=p_merchant_id
      and m.merchant_type='partner'
      and m.status in ('active','suspended','inactive')
      and (
        public.is_super_admin()
        or public.can_manage_tenant_marketplace_v1(m.tenant_id)
      )
  );
$$;

revoke all on function private.can_manage_marketplace_settlement_v1(uuid) from public,anon,authenticated;

create or replace function public.preview_marketplace_settlement_v1(
  p_merchant_id uuid,
  p_period_end timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_period_end timestamptz:=least(coalesce(p_period_end,now()),now());
  v_period_start timestamptz;
  v_latest_entry_at timestamptz;
  v_gross numeric(14,2):=0;
  v_deductions numeric(14,2):=0;
  v_net numeric(14,2):=0;
  v_count integer:=0;
  v_breakdown jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.can_manage_marketplace_settlement_v1(p_merchant_id) then
    raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED';
  end if;

  select * into v_merchant from public.merchants where id=p_merchant_id and merchant_type='partner';
  if v_merchant.id is null then raise exception using errcode='P0002',message='PARTNER_MERCHANT_NOT_FOUND'; end if;

  select
    min(e.occurred_at),max(e.occurred_at),
    coalesce(sum(case when e.signed_amount>0 then e.signed_amount else 0 end),0),
    coalesce(abs(sum(case when e.signed_amount<0 then e.signed_amount else 0 end)),0),
    coalesce(sum(e.signed_amount),0),count(*)
  into v_period_start,v_latest_entry_at,v_gross,v_deductions,v_net,v_count
  from public.merchant_financial_entries e
  where e.merchant_id=p_merchant_id
    and e.occurred_at<=v_period_end
    and e.entry_type not like 'franchise_%'
    and not exists(
      select 1 from public.merchant_settlement_entries se where se.financial_entry_id=e.id
    );

  select coalesce(jsonb_object_agg(x.entry_type,x.amount),'{}'::jsonb)
  into v_breakdown
  from (
    select e.entry_type,round(sum(e.signed_amount),2) amount
    from public.merchant_financial_entries e
    where e.merchant_id=p_merchant_id
      and e.occurred_at<=v_period_end
      and e.entry_type not like 'franchise_%'
      and not exists(
        select 1 from public.merchant_settlement_entries se where se.financial_entry_id=e.id
      )
    group by e.entry_type
    order by e.entry_type
  ) x;

  return jsonb_build_object(
    'merchant_id',v_merchant.id,'merchant_name',v_merchant.name,
    'period_start',v_period_start,'period_end',v_period_end,'latest_entry_at',v_latest_entry_at,
    'entry_count',v_count,'gross_credits',round(v_gross,2),
    'total_deductions',round(v_deductions,2),'net_payable',round(v_net,2),
    'currency','EGP','balance_direction',case when v_net>0 then 'platform_owes_merchant' when v_net<0 then 'merchant_owes_platform' else 'balanced' end,
    'breakdown',v_breakdown,'eligible',v_count>0
  );
end;
$$;

create or replace function public.create_marketplace_settlement_v2(
  p_merchant_id uuid,
  p_period_end timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preview jsonb;
  v_tenant_id uuid;
  v_settlement_id uuid:=gen_random_uuid();
  v_reference text;
  v_period_end timestamptz:=least(coalesce(p_period_end,now()),now());
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.can_manage_marketplace_settlement_v1(p_merchant_id) then
    raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('marketplace_settlement:'||p_merchant_id::text,0));
  v_preview:=public.preview_marketplace_settlement_v1(p_merchant_id,v_period_end);
  if not coalesce((v_preview->>'eligible')::boolean,false) then
    raise exception using errcode='22023',message='PARTNER_SETTLEMENT_NO_UNSETTLED_ENTRIES';
  end if;

  select tenant_id into v_tenant_id from public.merchants where id=p_merchant_id and merchant_type='partner';
  v_reference:='PSET-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_settlement_id::text,'-',''),1,8));

  insert into public.merchant_settlements(
    id,tenant_id,merchant_id,reference,status,settlement_kind,
    period_start,period_end,gross_credits,total_deductions,net_payable,
    currency,metadata,created_by
  ) values (
    v_settlement_id,v_tenant_id,p_merchant_id,v_reference,'draft','marketplace',
    nullif(v_preview->>'period_start','')::timestamptz,v_period_end,
    (v_preview->>'gross_credits')::numeric,(v_preview->>'total_deductions')::numeric,
    (v_preview->>'net_payable')::numeric,'EGP',
    jsonb_build_object('created_from','partner_settlement_control_m19','preview',v_preview),auth.uid()
  );

  insert into public.merchant_settlement_entries(settlement_id,financial_entry_id)
  select v_settlement_id,e.id
  from public.merchant_financial_entries e
  where e.merchant_id=p_merchant_id
    and e.occurred_at<=v_period_end
    and e.entry_type not like 'franchise_%'
    and not exists(select 1 from public.merchant_settlement_entries se where se.financial_entry_id=e.id);

  if not found then raise exception using errcode='40001',message='PARTNER_SETTLEMENT_CONCURRENTLY_CLAIMED'; end if;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,to_status,actor_user_id,snapshot
  ) values (
    v_settlement_id,v_tenant_id,p_merchant_id,'created','draft',auth.uid(),
    jsonb_build_object('reference',v_reference,'preview',v_preview)
  );

  return jsonb_build_object(
    'settlement_id',v_settlement_id,'reference',v_reference,'status','draft',
    'entry_count',(v_preview->>'entry_count')::integer,
    'gross_credits',(v_preview->>'gross_credits')::numeric,
    'total_deductions',(v_preview->>'total_deductions')::numeric,
    'net_payable',(v_preview->>'net_payable')::numeric,'currency','EGP'
  );
end;
$$;

create or replace function public.approve_marketplace_settlement_v1(p_settlement_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
  v_entry_count integer;
  v_net numeric(14,2);
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind<>'marketplace' then raise exception using errcode='P0002',message='PARTNER_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_marketplace_settlement_v1(v_settlement.merchant_id) then raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED'; end if;
  if v_settlement.status<>'draft' then raise exception using errcode='22023',message='PARTNER_SETTLEMENT_NOT_DRAFT'; end if;

  select count(*),coalesce(sum(e.signed_amount),0)
  into v_entry_count,v_net
  from public.merchant_settlement_entries se
  join public.merchant_financial_entries e on e.id=se.financial_entry_id
  where se.settlement_id=p_settlement_id;

  if v_entry_count=0 or round(v_net,2)<>round(v_settlement.net_payable,2) then
    raise exception using errcode='23514',message='PARTNER_SETTLEMENT_INTEGRITY_MISMATCH';
  end if;

  update public.merchant_settlements
  set status='approved',approved_by=auth.uid(),updated_at=now(),
      metadata=metadata||jsonb_build_object('approval_note',nullif(btrim(coalesce(p_note,'')),''))
  where id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'approved','draft','approved',
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),
    jsonb_build_object('entry_count',v_entry_count,'net_payable',v_settlement.net_payable,'currency',v_settlement.currency)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','approved','entry_count',v_entry_count);
end;
$$;

create or replace function public.mark_marketplace_settlement_paid_v1(
  p_settlement_id uuid,
  p_external_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
  v_reference text:=nullif(btrim(coalesce(p_external_reference,'')),'');
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind<>'marketplace' then raise exception using errcode='P0002',message='PARTNER_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_marketplace_settlement_v1(v_settlement.merchant_id) then raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED'; end if;
  if v_settlement.status<>'approved' then raise exception using errcode='22023',message='PARTNER_SETTLEMENT_NOT_APPROVED'; end if;
  if v_reference is null then raise exception using errcode='22023',message='PARTNER_SETTLEMENT_PAYMENT_REFERENCE_REQUIRED'; end if;

  update public.merchant_settlements
  set status='paid',external_reference=v_reference,paid_at=now(),paid_by=auth.uid(),updated_at=now(),
      metadata=metadata||jsonb_build_object('payment_note',nullif(btrim(coalesce(p_note,'')),''))
  where id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'paid','approved','paid',
    nullif(btrim(coalesce(p_note,'')),''),auth.uid(),
    jsonb_build_object('external_reference',v_reference,'net_payable',v_settlement.net_payable,'currency',v_settlement.currency)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','paid','external_reference',v_reference,'paid_at',now());
end;
$$;

create or replace function public.cancel_marketplace_settlement_v1(p_settlement_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_entry_ids jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind<>'marketplace' then raise exception using errcode='P0002',message='PARTNER_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_marketplace_settlement_v1(v_settlement.merchant_id) then raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED'; end if;
  if v_settlement.status not in ('draft','approved') then raise exception using errcode='22023',message='PARTNER_SETTLEMENT_CANNOT_CANCEL'; end if;
  if v_reason is null then raise exception using errcode='22023',message='PARTNER_SETTLEMENT_CANCEL_REASON_REQUIRED'; end if;

  select coalesce(jsonb_agg(se.financial_entry_id),'[]'::jsonb) into v_entry_ids
  from public.merchant_settlement_entries se where se.settlement_id=p_settlement_id;

  update public.merchant_settlements
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=v_reason,updated_at=now(),
      metadata=metadata||jsonb_build_object('cancelled_entry_ids',v_entry_ids)
  where id=p_settlement_id;
  delete from public.merchant_settlement_entries where settlement_id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'cancelled',v_settlement.status,'cancelled',
    v_reason,auth.uid(),jsonb_build_object('released_entry_ids',v_entry_ids,'net_payable',v_settlement.net_payable,'currency',v_settlement.currency)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','cancelled','released_entries',jsonb_array_length(v_entry_ids));
end;
$$;

create or replace function public.get_marketplace_settlement_control_v1(p_merchant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),150);
  v_preview jsonb;
  v_settlements jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.can_manage_marketplace_settlement_v1(p_merchant_id) then raise exception using errcode='42501',message='PARTNER_SETTLEMENT_MANAGE_DENIED'; end if;
  v_preview:=public.preview_marketplace_settlement_v1(p_merchant_id,now());

  select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb)
  into v_settlements
  from (
    select s.created_at,jsonb_build_object(
      'id',s.id,'reference',s.reference,'status',s.status,
      'period_start',s.period_start,'period_end',s.period_end,
      'gross_credits',s.gross_credits,'total_deductions',s.total_deductions,
      'net_payable',s.net_payable,'currency',s.currency,
      'external_reference',s.external_reference,'created_at',s.created_at,
      'paid_at',s.paid_at,'cancelled_at',s.cancelled_at,'cancellation_reason',s.cancellation_reason,
      'entry_count',(select count(*) from public.merchant_settlement_entries se where se.settlement_id=s.id),
      'breakdown',coalesce((select jsonb_object_agg(q.entry_type,q.amount) from (
        select e.entry_type,round(sum(e.signed_amount),2) amount
        from public.merchant_settlement_entries se
        join public.merchant_financial_entries e on e.id=se.financial_entry_id
        where se.settlement_id=s.id group by e.entry_type
      ) q),'{}'::jsonb),
      'events',coalesce((select jsonb_agg(jsonb_build_object(
        'event_type',ev.event_type,'from_status',ev.from_status,'to_status',ev.to_status,
        'reason',ev.reason,'created_at',ev.created_at
      ) order by ev.created_at) from private.merchant_settlement_events_v1 ev where ev.settlement_id=s.id),'[]'::jsonb)
    ) obj
    from public.merchant_settlements s
    where s.merchant_id=p_merchant_id and s.settlement_kind='marketplace'
    order by s.created_at desc limit v_limit
  ) x;

  return jsonb_build_object(
    'version',1,'merchant_id',p_merchant_id,
    'permissions',jsonb_build_object('can_manage',true),
    'preview',v_preview,'settlements',v_settlements,'generated_at',now()
  );
end;
$$;

revoke all on function public.preview_marketplace_settlement_v1(uuid,timestamptz) from public,anon;
revoke all on function public.create_marketplace_settlement_v2(uuid,timestamptz) from public,anon;
revoke all on function public.approve_marketplace_settlement_v1(uuid,text) from public,anon;
revoke all on function public.mark_marketplace_settlement_paid_v1(uuid,text,text) from public,anon;
revoke all on function public.cancel_marketplace_settlement_v1(uuid,text) from public,anon;
revoke all on function public.get_marketplace_settlement_control_v1(uuid,integer) from public,anon;

grant execute on function public.preview_marketplace_settlement_v1(uuid,timestamptz) to authenticated,service_role;
grant execute on function public.create_marketplace_settlement_v2(uuid,timestamptz) to authenticated,service_role;
grant execute on function public.approve_marketplace_settlement_v1(uuid,text) to authenticated,service_role;
grant execute on function public.mark_marketplace_settlement_paid_v1(uuid,text,text) to authenticated,service_role;
grant execute on function public.cancel_marketplace_settlement_v1(uuid,text) to authenticated,service_role;
grant execute on function public.get_marketplace_settlement_control_v1(uuid,integer) to authenticated,service_role;
