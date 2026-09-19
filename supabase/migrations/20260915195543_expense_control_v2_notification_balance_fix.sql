create or replace function private.expense_payment_notification_v2()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  d private.expense_documents_v2%rowtype;
  v_source text;
  v_remaining numeric;
begin
  select * into d from private.expense_documents_v2 where id=new.expense_document_id;
  if d.id is null then return new; end if;
  v_source:=case new.source_kind when 'branch_safe' then 'خزنة الفرع' when 'pos_drawer' then 'درج الكاشير' when 'bank' then 'الحساب البنكي' else 'الحساب المالي' end;
  if tg_op='INSERT' and new.status='active' then
    v_remaining:=greatest(d.amount-d.paid_amount-new.amount,0);
    perform private.expense_notify_requester_v2(d.id,'expense.payment','تم صرف دفعة للمصروف',
      d.document_number||' · '||to_char(new.amount,'FM9999999990.00')||' ج.م من '||v_source||
      case when v_remaining>0 then ' · المتبقي '||to_char(v_remaining,'FM9999999990.00')||' ج.م' else ' · تم السداد بالكامل' end,
      'payment:'||new.id::text,'normal');
  elsif tg_op='UPDATE' and new.status='reversed' and old.status is distinct from new.status then
    perform private.expense_notify_requester_v2(d.id,'expense.payment_reversed','تم عكس دفعة للمصروف',
      d.document_number||' · '||to_char(new.amount,'FM9999999990.00')||' ج.م'||coalesce(' · '||nullif(new.reverse_reason,''),''),
      'payment-reversed:'||new.id::text,'high');
  end if;
  return new;
end $$;