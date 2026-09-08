create or replace function public.get_customer_rfm_score(p_customer_id uuid,p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_frequency bigint:=0;
  v_monetary numeric:=0;
  v_last_purchase timestamptz;
  v_recency_days bigint;
  v_r int:=0;
  v_f int:=0;
  v_m int:=0;
  v_total int:=0;
  v_label text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then
    raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED';
  end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;

  select count(*),coalesce(sum(net),0),max(purchased_at)
  into v_frequency,v_monetary,v_last_purchase
  from (
    select greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net,coalesce(s.date,s.created_at) purchased_at
    from public.sales s where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric,o.created_at
    from public.online_orders o
    where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid'
      and (p_branch_id is null or o.branch_id=p_branch_id)
  ) q;

  v_recency_days:=case when v_last_purchase is null then null else greatest(0,floor(extract(epoch from(now()-v_last_purchase))/86400))::bigint end;
  v_r:=case when v_recency_days is null then 0 when v_recency_days<=7 then 5 when v_recency_days<=14 then 4 when v_recency_days<=30 then 3 when v_recency_days<=60 then 2 else 1 end;
  v_f:=case when v_frequency>=20 then 5 when v_frequency>=10 then 4 when v_frequency>=5 then 3 when v_frequency>=2 then 2 when v_frequency>=1 then 1 else 0 end;
  v_m:=case when v_monetary>=10000 then 5 when v_monetary>=5000 then 4 when v_monetary>=2000 then 3 when v_monetary>=500 then 2 when v_monetary>0 then 1 else 0 end;
  v_total:=v_r+v_f+v_m;
  v_label:=case
    when v_frequency=0 then 'new_no_purchase'
    when v_r>=4 and v_f>=4 and v_m>=4 then 'champion'
    when v_r>=4 and v_f>=3 then 'loyal'
    when v_r>=4 and v_f<=2 then 'promising'
    when v_r<=2 and v_f>=3 then 'at_risk'
    when v_r=1 and v_f>=2 then 'hibernating'
    when v_m>=4 then 'high_value'
    else 'regular'
  end;
  return jsonb_build_object(
    'recency_days',v_recency_days,'frequency',v_frequency,'monetary',v_monetary,
    'recency_score',v_r,'frequency_score',v_f,'monetary_score',v_m,'total_score',v_total,
    'label',v_label,'max_score',15,'calculation','rule_based_v1'
  );
end $$;
revoke all on function public.get_customer_rfm_score(uuid,uuid) from public,anon;
grant execute on function public.get_customer_rfm_score(uuid,uuid) to authenticated;
