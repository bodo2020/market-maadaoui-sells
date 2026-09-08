alter table public.customer_interactions add column if not exists outcome_code text;
alter table public.customer_interactions add column if not exists outcome_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='customer_interactions_outcome_code_check' and conrelid='public.customer_interactions'::regclass) then
    alter table public.customer_interactions add constraint customer_interactions_outcome_code_check
      check (outcome_code is null or outcome_code in ('reached','no_answer','interested','not_interested','issue_resolved','callback_requested','wrong_number'));
  end if;
end $$;
create index if not exists customer_interactions_outcome_completed_idx on public.customer_interactions(outcome_code,completed_at desc) where status='completed';

drop function if exists public.complete_customer_followup_v2(uuid,text,text,uuid);
create function public.complete_customer_followup_v2(p_interaction_id uuid,p_outcome_code text,p_outcome_note text default null,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_customer_id uuid; v_status text; v_interaction_branch uuid; v_code text:=lower(btrim(coalesce(p_outcome_code,''))); v_note text:=nullif(btrim(coalesce(p_outcome_note,'')),''); v_label text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if v_code not in ('reached','no_answer','interested','not_interested','issue_resolved','callback_requested','wrong_number') then raise exception using errcode='22023',message='INVALID_FOLLOWUP_OUTCOME_CODE'; end if;
  if v_note is not null and length(v_note)>1000 then raise exception using errcode='22023',message='FOLLOWUP_OUTCOME_NOTE_TOO_LONG'; end if;
  select customer_id,status,branch_id into v_customer_id,v_status,v_interaction_branch from public.customer_interactions where id=p_interaction_id and type in ('call','email','meeting','whatsapp') for update;
  if v_customer_id is null then raise exception using errcode='22023',message='FOLLOWUP_NOT_FOUND'; end if;
  if not v_super and v_interaction_branch is distinct from p_branch_id then raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED'; end if;
  if v_status<>'pending' then raise exception using errcode='22023',message='FOLLOWUP_ALREADY_CLOSED'; end if;
  v_label:=case v_code when 'reached' then 'تم التواصل' when 'no_answer' then 'لم يرد' when 'interested' then 'مهتم' when 'not_interested' then 'غير مهتم' when 'issue_resolved' then 'تم حل المشكلة' when 'callback_requested' then 'طلب إعادة التواصل' when 'wrong_number' then 'رقم غير صحيح' end;
  update public.customer_interactions set status='completed',outcome_code=v_code,outcome_note=v_note,description=concat_ws(E'\n\n',nullif(description,''),'النتيجة: '||v_label,case when v_note is not null then 'ملاحظة النتيجة: '||v_note end),completed_at=now(),completed_by=auth.uid(),updated_at=now() where id=p_interaction_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(v_customer_id,'followup_completed',coalesce(v_interaction_branch,p_branch_id),auth.uid(),jsonb_build_object('interaction_id',p_interaction_id,'outcome_code',v_code,'outcome_label',v_label,'outcome_note',v_note));
  return public.get_customer_management_workspace(v_customer_id,p_branch_id);
end $$;
revoke all on function public.complete_customer_followup_v2(uuid,text,text,uuid) from public,anon;
grant execute on function public.complete_customer_followup_v2(uuid,text,text,uuid) to authenticated;

drop function if exists public.get_customer_followup_outcome_dashboard(uuid,integer);
create function public.get_customer_followup_outcome_dashboard(p_branch_id uuid default null,p_days integer default 30)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_days integer:=least(greatest(coalesce(p_days,30),1),365); v_rows jsonb; v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;
  with purchase_events as (
    select 'store'::text source,s.id purchase_id,s.customer_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total from public.sales s where s.customer_id is not null and (p_branch_id is null or s.branch_id=p_branch_id)
    union all select 'online'::text,o.id,o.customer_id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric from public.online_orders o where o.customer_id is not null and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), f as (
    select i.id interaction_id,i.customer_id,coalesce(i.outcome_code,'legacy') outcome_code,i.completed_at from public.customer_interactions i where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.*,f.interaction_id,f.outcome_code,f.completed_at,row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn from purchase_events p join f on f.customer_id=p.customer_id and p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), a as (select * from candidates where rn=1), fm as (
    select f.interaction_id,f.outcome_code,(count(a.purchase_id)>0) converted,count(a.purchase_id)::bigint orders,coalesce(sum(a.net_total),0)::numeric revenue from f left join a on a.interaction_id=f.interaction_id group by f.interaction_id,f.outcome_code
  ), q as (
    select outcome_code,count(*)::bigint completed,count(*) filter(where converted)::bigint converted,case when count(*)>0 then round((100.0*count(*) filter(where converted)/count(*))::numeric,1) else 0 end conversion_rate,coalesce(sum(orders),0)::bigint attributed_orders,coalesce(sum(revenue),0)::numeric attributed_revenue,
      case outcome_code when 'no_answer' then 'إعادة المحاولة في وقت مختلف' when 'callback_requested' then 'جدولة متابعة جديدة' when 'interested' then 'متابعة سريعة أو عرض مناسب' when 'reached' then 'راقب الشراء خلال 7 أيام' when 'issue_resolved' then 'راقب رضا العميل وعودته للشراء' when 'not_interested' then 'لا تكرر التواصل قريبًا' when 'wrong_number' then 'راجع رقم الهاتف قبل أي تواصل جديد' else 'راجع الملاحظة وحدد الإجراء التالي' end recommended_action
    from fm group by outcome_code order by completed desc
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.completed desc),'[]'::jsonb) into v_rows from q;
  with f as (
    select coalesce(i.outcome_code,'legacy') outcome_code from public.customer_interactions i where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ) select jsonb_build_object('window_days',v_days,'total_completed',count(*)::bigint,'structured_outcomes',count(*) filter(where outcome_code<>'legacy')::bigint,'no_answer',count(*) filter(where outcome_code='no_answer')::bigint,'interested',count(*) filter(where outcome_code='interested')::bigint,'not_interested',count(*) filter(where outcome_code='not_interested')::bigint,'callback_requested',count(*) filter(where outcome_code='callback_requested')::bigint,'issue_resolved',count(*) filter(where outcome_code='issue_resolved')::bigint,'reached',count(*) filter(where outcome_code='reached')::bigint,'wrong_number',count(*) filter(where outcome_code='wrong_number')::bigint) into v_summary from f;
  return jsonb_build_object('summary',v_summary,'outcomes',v_rows,'attribution_window_days',7);
end $$;
revoke all on function public.get_customer_followup_outcome_dashboard(uuid,integer) from public,anon;
grant execute on function public.get_customer_followup_outcome_dashboard(uuid,integer) to authenticated;
