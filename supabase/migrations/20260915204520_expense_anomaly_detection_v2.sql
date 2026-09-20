create or replace function public.get_expense_anomalies_v2(p_branch_id uuid,p_days integer default 120)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_from timestamptz:=now()-make_interval(days=>least(greatest(coalesce(p_days,120),30),365)); v_rows jsonb; v_summary jsonb; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  with base as (
    select d.*,lower(regexp_replace(coalesce(d.invoice_number,''),'\s+','','g')) invoice_key,lower(regexp_replace(coalesce(d.beneficiary_name,''),'\s+','','g')) beneficiary_key
    from private.expense_documents_v2 d where d.branch_id=p_branch_id and d.created_at>=v_from and d.status not in ('rejected','cancelled','voided')
  ), invoice_dups as (
    select 'duplicate_invoice'::text anomaly_type,'high'::text severity,d.id document_id,d.document_number,d.amount,d.category_name,d.beneficiary_name,d.invoice_number,d.created_at,
      'رقم الفاتورة مستخدم في أكثر من مستند مصروف'::text message,
      (select jsonb_agg(x.document_number order by x.created_at) from base x where x.invoice_key=d.invoice_key and x.invoice_key<>'') related_documents
    from base d where d.invoice_key<>'' and (select count(*) from base x where x.invoice_key=d.invoice_key)>1
  ), near_dups as (
    select 'near_duplicate'::text anomaly_type,'normal'::text severity,d.id document_id,d.document_number,d.amount,d.category_name,d.beneficiary_name,d.invoice_number,d.created_at,
      'مصروف مشابه جدًا في القيمة والبند والمستفيد خلال 48 ساعة'::text message,
      (select jsonb_agg(x.document_number order by x.created_at) from base x where x.id<>d.id and x.category_id=d.category_id and x.amount=d.amount and x.beneficiary_key=d.beneficiary_key and abs(extract(epoch from (x.incurred_at-d.incurred_at)))<=172800) related_documents
    from base d where exists(select 1 from base x where x.id<>d.id and x.category_id=d.category_id and x.amount=d.amount and x.beneficiary_key=d.beneficiary_key and abs(extract(epoch from (x.incurred_at-d.incurred_at)))<=172800)
      and not (d.invoice_key<>'' and (select count(*) from base z where z.invoice_key=d.invoice_key)>1)
  ), stats as (
    select category_id,percentile_cont(0.5) within group(order by amount)::numeric median_amount,count(*) n
    from base where accounting_treatment='opex' group by category_id having count(*)>=5
  ), unusual as (
    select 'unusual_amount'::text anomaly_type,'normal'::text severity,d.id document_id,d.document_number,d.amount,d.category_name,d.beneficiary_name,d.invoice_number,d.created_at,
      ('قيمة المصروف أعلى من 2.5× الوسيط التاريخي للبند ('||round(s.median_amount,2)||' ج.م)')::text message,
      jsonb_build_array() related_documents
    from base d join stats s on s.category_id=d.category_id where s.median_amount>0 and d.amount>=s.median_amount*2.5
  ), all_rows as (
    select * from invoice_dups union all select * from near_dups union all select * from unusual
  )
  select coalesce(jsonb_agg(jsonb_build_object('type',anomaly_type,'severity',severity,'document_id',document_id,'document_number',document_number,'amount',amount,'category_name',category_name,
    'beneficiary_name',beneficiary_name,'invoice_number',invoice_number,'created_at',created_at,'message',message,'related_documents',related_documents)
    order by case severity when 'high' then 0 else 1 end,created_at desc),'[]'::jsonb) into v_rows from all_rows;
  with x as (select value from jsonb_array_elements(coalesce(v_rows,'[]'::jsonb)))
  select jsonb_build_object('total',count(*),'high',count(*) filter(where value->>'severity'='high'),'normal',count(*) filter(where value->>'severity'='normal')) into v_summary from x;
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'days',least(greatest(coalesce(p_days,120),30),365),'summary',v_summary,'anomalies',v_rows,'generated_at',now());
end $$;

create or replace function private.expense_duplicate_notification_v2()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_related private.expense_documents_v2%rowtype; v_reason text; begin
  if new.status in ('rejected','cancelled','voided') then return new; end if;
  if nullif(lower(regexp_replace(coalesce(new.invoice_number,''),'\s+','','g')),'') is not null then
    select * into v_related from private.expense_documents_v2 x where x.branch_id=new.branch_id and x.id<>new.id and x.status not in ('rejected','cancelled','voided')
      and lower(regexp_replace(coalesce(x.invoice_number,''),'\s+','','g'))=lower(regexp_replace(new.invoice_number,'\s+','','g')) order by x.created_at desc limit 1;
    if v_related.id is not null then v_reason:='رقم الفاتورة مكرر مع '||v_related.document_number; end if;
  end if;
  if v_reason is null then
    select * into v_related from private.expense_documents_v2 x where x.branch_id=new.branch_id and x.id<>new.id and x.status not in ('rejected','cancelled','voided')
      and x.category_id=new.category_id and x.amount=new.amount and lower(regexp_replace(coalesce(x.beneficiary_name,''),'\s+','','g'))=lower(regexp_replace(coalesce(new.beneficiary_name,''),'\s+','','g'))
      and abs(extract(epoch from (x.incurred_at-new.incurred_at)))<=86400 order by x.created_at desc limit 1;
    if v_related.id is not null then v_reason:='مصروف مماثل خلال 24 ساعة مع '||v_related.document_number; end if;
  end if;
  if v_reason is not null then
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
    select 'staff',u.id,new.branch_id,'expense.possible_duplicate','finance','high','احتمال تكرار مصروف',new.document_number||' · '||v_reason,'expense_document',new.id,'/finance/expenses/insights','مراجعة التنبيه',true,
      'expense-duplicate:'||new.id::text,array['in_app']::text[],'active',jsonb_build_object('document_id',new.id,'document_number',new.document_number,'related_document_id',v_related.id,'related_document_number',v_related.document_number,'reason',v_reason),now(),now()
    from public.users u where coalesce(u.active,true) and (private.staff_user_has_permission_v3(u.id,'expense.approve',new.branch_id) or private.staff_user_has_permission_v3(u.id,'finance.manage',new.branch_id))
    on conflict(recipient_user_id,dedupe_key) do update set body=excluded.body,status='active',resolved_at=null,metadata=excluded.metadata,updated_at=now();
  end if;
  return new;
end $$;
drop trigger if exists expense_duplicate_notification_v2 on private.expense_documents_v2;
create trigger expense_duplicate_notification_v2 after insert on private.expense_documents_v2 for each row execute function private.expense_duplicate_notification_v2();

revoke all on function private.expense_duplicate_notification_v2() from public,anon,authenticated;
revoke all on function public.get_expense_anomalies_v2(uuid,integer) from public,anon;
grant execute on function public.get_expense_anomalies_v2(uuid,integer) to authenticated;
