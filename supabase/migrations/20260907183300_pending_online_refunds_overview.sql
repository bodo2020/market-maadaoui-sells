create or replace function public.get_pending_online_refunds(p_branch_id uuid)
returns table(
  refund_id uuid,
  return_id uuid,
  order_id uuid,
  payment_method text,
  amount numeric,
  status text,
  provider_reference text,
  created_at timestamptz
) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('online_orders.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id)) then
    raise exception using errcode='42501',message='ONLINE_MONEY_VIEW_DENIED';
  end if;
  return query
  select pr.id,pr.return_id,pr.order_id,pr.payment_method,pr.amount,pr.status,pr.provider_reference,pr.created_at
  from public.payment_refunds pr
  where pr.branch_id=p_branch_id and pr.status='pending'
  order by pr.created_at asc;
end; $$;

revoke all on function public.get_pending_online_refunds(uuid) from public,anon;
grant execute on function public.get_pending_online_refunds(uuid) to authenticated;
