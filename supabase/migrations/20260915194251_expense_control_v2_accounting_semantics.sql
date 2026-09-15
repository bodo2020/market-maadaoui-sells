create or replace function private.expense_recognize_v2(p_document_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_expense uuid; begin
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if d.linked_expense_id is not null then return d.linked_expense_id; end if;

  -- Only OPEX is recognized in the legacy operating-expense ledger/P&L.
  -- CAPEX, prepaid items and employee advances remain controlled documents until
  -- dedicated asset/prepaid/custody ledgers recognize them according to their lifecycle.
  if d.accounting_treatment <> 'opex' then
    perform private.expense_write_audit_v2(
      d.id,
      'non_opex_approved',
      p_actor,
      null,
      jsonb_build_object('accounting_treatment',d.accounting_treatment,'excluded_from_operating_expense',true)
    );
    return null;
  end if;

  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,created_by,status,
    expense_document_id,expense_category_id,accounting_treatment,beneficiary_name,invoice_number)
  values(d.category_name,d.amount,d.description,d.incurred_at,d.receipt_url,d.branch_id,'unpaid',d.requested_by,'active',
    d.id,d.category_id,d.accounting_treatment,d.beneficiary_name,d.invoice_number)
  returning id into v_expense;

  update private.expense_documents_v2 set linked_expense_id=v_expense,updated_at=now() where id=d.id;
  perform private.expense_write_audit_v2(d.id,'recognized',p_actor,null,jsonb_build_object('expense_id',v_expense,'accounting_treatment','opex'));
  return v_expense;
end $$;

-- Harden operating reports so any future/non-V2 active rows explicitly tagged as non-OPEX
-- cannot leak into operating profit. Legacy rows with NULL treatment retain old behavior.
create or replace function private.expense_operating_amount_v2(p_branch_id uuid,p_from timestamptz,p_to timestamptz)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(sum(e.amount),0)::numeric
  from public.expenses e
  where e.branch_id=p_branch_id
    and coalesce(e.status,'active')='active'
    and coalesce(e.accounting_treatment,'opex')='opex'
    and e.date>=p_from and e.date<p_to
$$;
revoke all on function private.expense_operating_amount_v2(uuid,timestamptz,timestamptz) from public,anon,authenticated;
