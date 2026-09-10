create or replace function private.sync_purchase_supplier_ledger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_old_net numeric(12,2):=0; v_new_net numeric(12,2):=0; v_delta numeric(12,2):=0; v_op uuid; v_rep uuid; v_actor uuid; v_key text;
begin
  begin v_actor:=auth.uid(); exception when others then v_actor:=null; end;
  begin v_op:=nullif(current_setting('app.supplier_wallet_operation_id',true),'')::uuid; exception when others then v_op:=null; end;
  begin v_rep:=nullif(current_setting('app.supplier_representative_id',true),'')::uuid; exception when others then v_rep:=null; end;
  if tg_op='INSERT' then
    v_new_net:=round(coalesce(new.total,0)-coalesce(new.paid,0),2);
    if v_new_net<>0 then
      v_key:='purchase:'||new.id::text||':insert:'||gen_random_uuid()::text;
      insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by,created_at)
      values(new.branch_id,new.supplier_id,'purchase_invoice_net',v_new_net,new.id,v_op,v_rep,v_key,'صافي فاتورة شراء '||coalesce(new.invoice_number,new.id::text),jsonb_build_object('total',new.total,'paid',new.paid,'operation','insert'),v_actor,coalesce(new.date::timestamptz,now()));
    end if; return new;
  elsif tg_op='DELETE' then
    v_old_net:=round(coalesce(old.total,0)-coalesce(old.paid,0),2);
    if v_old_net<>0 then
      v_key:='purchase:'||old.id::text||':delete:'||gen_random_uuid()::text;
      insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
      values(old.branch_id,old.supplier_id,'purchase_void',-v_old_net,null,v_op,v_rep,v_key,'عكس صافي فاتورة شراء '||coalesce(old.invoice_number,old.id::text),jsonb_build_object('purchase_id',old.id,'total',old.total,'paid',old.paid,'operation','delete'),v_actor);
    end if; return old;
  end if;
  v_old_net:=round(coalesce(old.total,0)-coalesce(old.paid,0),2); v_new_net:=round(coalesce(new.total,0)-coalesce(new.paid,0),2);
  if new.supplier_id is distinct from old.supplier_id or new.branch_id is distinct from old.branch_id then
    if v_old_net<>0 then insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,idempotency_key,description,metadata,created_by) values(old.branch_id,old.supplier_id,'purchase_reassigned',-v_old_net,new.id,'purchase:'||new.id::text||':reassign-old:'||gen_random_uuid()::text,'نقل فاتورة شراء من المورد/الفرع السابق',jsonb_build_object('operation','reassign_old'),v_actor); end if;
    if v_new_net<>0 then insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,idempotency_key,description,metadata,created_by) values(new.branch_id,new.supplier_id,'purchase_reassigned',v_new_net,new.id,'purchase:'||new.id::text||':reassign-new:'||gen_random_uuid()::text,'نقل فاتورة شراء إلى المورد/الفرع الجديد',jsonb_build_object('operation','reassign_new'),v_actor); end if;
    return new;
  end if;
  v_delta:=round(v_new_net-v_old_net,2);
  if v_delta<>0 then
    v_key:='purchase:'||new.id::text||':update:'||gen_random_uuid()::text;
    insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
    values(new.branch_id,new.supplier_id,case when coalesce(new.paid,0) is distinct from coalesce(old.paid,0) and new.total is not distinct from old.total then 'supplier_payment' else 'purchase_adjustment' end,v_delta,new.id,v_op,v_rep,v_key,case when v_delta<0 then 'تخفيض مديونية فاتورة شراء' else 'زيادة مديونية فاتورة شراء' end,jsonb_build_object('old_total',old.total,'new_total',new.total,'old_paid',old.paid,'new_paid',new.paid),v_actor);
  end if; return new;
end $$;