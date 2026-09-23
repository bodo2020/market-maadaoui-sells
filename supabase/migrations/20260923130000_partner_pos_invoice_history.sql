-- Partner-owned invoice history, scoped by active membership, branch and POS channel.
create or replace function public.list_partner_pos_invoices_v1(p_branch_id uuid,p_limit integer default 30,p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.branches b join public.merchants m on m.id=b.merchant_id join public.merchant_members mm on mm.merchant_id=m.id
   where b.id=p_branch_id and b.branch_type='external' and b.active and m.merchant_type='partner' and m.status='active'
   and mm.user_id=auth.uid() and mm.is_active and mm.role in ('owner','admin','manager','staff')
   and private.branch_channel_effective_enabled_v1(b.id,'pos')) then
   raise exception using errcode='42501',message='PARTNER_POS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_date desc),'[]'::jsonb) into v_result from (
  select i.sale_id,i.invoice_number,i.sale_date,i.cashier_name,i.customer_name,i.customer_phone,i.total,i.amount_charged,i.payment_method_name,i.item_count,
   coalesce((select sum(r.total_amount) from public.returns r where r.sale_id=i.sale_id and r.status<>'rejected'),0) returned_amount,
   coalesce((select count(*) from public.returns r where r.sale_id=i.sale_id and r.status<>'rejected'),0) return_count
  from public.pos_invoices i where i.branch_id=p_branch_id and
  (nullif(btrim(coalesce(p_search,'')),'') is null or i.invoice_number ilike '%'||btrim(p_search)||'%' or coalesce(i.customer_name,'') ilike '%'||btrim(p_search)||'%')
  order by i.sale_date desc limit greatest(1,least(coalesce(p_limit,30),100))
 ) x;
 return v_result;
end $$;
revoke all on function public.list_partner_pos_invoices_v1(uuid,integer,text) from public,anon;
grant execute on function public.list_partner_pos_invoices_v1(uuid,integer,text) to authenticated,service_role;

create or replace function public.get_partner_pos_invoice_v1(p_sale_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_invoice public.pos_invoices%rowtype;v_items jsonb;v_returns jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_invoice from public.pos_invoices where sale_id=p_sale_id;
 if v_invoice.id is null then raise exception using errcode='P0002',message='INVOICE_NOT_FOUND'; end if;
 if not exists(select 1 from public.branches b join public.merchants m on m.id=b.merchant_id join public.merchant_members mm on mm.merchant_id=m.id
   where b.id=v_invoice.branch_id and b.branch_type='external' and b.active and m.merchant_type='partner' and m.status='active'
   and mm.user_id=auth.uid() and mm.is_active and mm.role in ('owner','admin','manager','staff')
   and private.branch_channel_effective_enabled_v1(b.id,'pos')) then
   raise exception using errcode='42501',message='PARTNER_POS_ACCESS_DENIED'; end if;
 select coalesce(jsonb_agg(to_jsonb(ii) order by ii.line_no),'[]'::jsonb) into v_items from public.pos_invoice_items ii where ii.invoice_id=v_invoice.id;
 select coalesce(jsonb_agg(jsonb_build_object('total_amount',r.total_amount,'status',r.status,'refund_status',r.refund_status,'created_at',r.created_at) order by r.created_at desc),'[]'::jsonb)
 into v_returns from public.returns r where r.sale_id=p_sale_id and r.status<>'rejected';
 return jsonb_build_object('invoice',to_jsonb(v_invoice),'items',v_items,'returns',v_returns);
end $$;
revoke all on function public.get_partner_pos_invoice_v1(uuid) from public,anon;
grant execute on function public.get_partner_pos_invoice_v1(uuid) to authenticated,service_role;
