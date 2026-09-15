create or replace function private.expense_notify_requester_v2(
  p_document_id uuid,p_event_key text,p_title text,p_body text,p_dedupe_suffix text,p_severity text default 'normal'
)
returns void language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype;
begin
  select * into d from private.expense_documents_v2 where id=p_document_id;
  if d.id is null or d.requested_by is null then return; end if;
  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
    action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
  ) values(
    'staff',d.requested_by,d.branch_id,p_event_key,'finance',coalesce(nullif(p_severity,''),'normal'),p_title,p_body,
    'expense_document',d.id,'/finance/expenses','عرض المصروف',false,
    'expense-requester:'||d.id::text||':'||p_dedupe_suffix,array['in_app']::text[],'active',
    jsonb_build_object('expense_document_id',d.id,'document_number',d.document_number,'status',d.status,'amount',d.amount,
      'paid_amount',d.paid_amount,'remaining_amount',greatest(d.amount-d.paid_amount,0)),now(),now()
  )
  on conflict(recipient_user_id,dedupe_key) do update set title=excluded.title,body=excluded.body,severity=excluded.severity,
    status='active',resolved_at=null,metadata=excluded.metadata,updated_at=now();
end $$;

create or replace function private.expense_document_status_notification_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    if new.status='approved' then
      perform private.expense_notify_requester_v2(new.id,'expense.approved','تم اعتماد طلب المصروف',
        new.document_number||' · '||new.category_name||' · '||to_char(new.amount,'FM9999999990.00')||' ج.م','approved','normal');
    elsif new.status='rejected' then
      perform private.expense_notify_requester_v2(new.id,'expense.rejected','تم رفض طلب المصروف',
        new.document_number||coalesce(' · '||nullif(new.rejection_reason,''),''),'rejected','high');
    elsif new.status='voided' then
      perform private.expense_notify_requester_v2(new.id,'expense.voided','تم عكس مستند المصروف',
        new.document_number||coalesce(' · '||nullif(new.void_reason,''),''),'voided','high');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists expense_document_status_notification_v2 on private.expense_documents_v2;
create trigger expense_document_status_notification_v2 after update of status on private.expense_documents_v2
for each row execute function private.expense_document_status_notification_v2();

create or replace function private.expense_payment_notification_v2()
returns trigger language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_source text;
begin
  select * into d from private.expense_documents_v2 where id=new.expense_document_id;
  if d.id is null then return new; end if;
  v_source:=case new.source_kind when 'branch_safe' then 'خزنة الفرع' when 'pos_drawer' then 'درج الكاشير' when 'bank' then 'الحساب البنكي' else 'الحساب المالي' end;
  if tg_op='INSERT' and new.status='active' then
    perform private.expense_notify_requester_v2(d.id,'expense.payment','تم صرف دفعة للمصروف',
      d.document_number||' · '||to_char(new.amount,'FM9999999990.00')||' ج.م من '||v_source,
      'payment:'||new.id::text,'normal');
  elsif tg_op='UPDATE' and new.status='reversed' and old.status is distinct from new.status then
    perform private.expense_notify_requester_v2(d.id,'expense.payment_reversed','تم عكس دفعة للمصروف',
      d.document_number||' · '||to_char(new.amount,'FM9999999990.00')||' ج.م'||coalesce(' · '||nullif(new.reverse_reason,''),''),
      'payment-reversed:'||new.id::text,'high');
  end if;
  return new;
end $$;

drop trigger if exists expense_payment_notification_v2 on private.expense_payments_v2;
create trigger expense_payment_notification_v2 after insert or update of status on private.expense_payments_v2
for each row execute function private.expense_payment_notification_v2();

revoke all on function private.expense_notify_requester_v2(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function private.expense_document_status_notification_v2() from public,anon,authenticated;
revoke all on function private.expense_payment_notification_v2() from public,anon,authenticated;