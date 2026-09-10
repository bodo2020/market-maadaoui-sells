-- Allow retried receiver tasks to use the same specialized receipt workflow.

create or replace function public.get_my_finance_transfer_tasks_v2(p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id',o.id,'task_status',o.status,
    'stage',case when o.source_kind='finance_transfer_sender' then 'sender' else 'receiver' end,
    'is_retry',o.task_type='finance_transfer_retry',
    'transfer_id',t.id,'transfer_status',t.status,'amount',t.amount,'currency',t.currency,
    'source_account_name',t.source_account_name,'destination_account_name',t.destination_account_name,
    'requested_at',t.requested_at,'reference',t.reference,'note',t.note
  ) order by o.created_at desc),'[]') into v_rows
  from public.operations_tasks o join private.finance_transfers_v2 t on t.id=o.source_id
  where o.task_type in ('finance_transfer','finance_transfer_retry')
    and o.source_kind in ('finance_transfer_sender','finance_transfer_receiver','finance_transfer_receiver_retry')
    and o.claimed_by=auth.uid() and o.status in ('claimed','in_progress','failed')
    and (p_branch_id is null or o.branch_id=p_branch_id);
  return jsonb_build_object('version',2,'items',v_rows,'generated_at',now());
end;$$;

create or replace function public.confirm_finance_transfer_receipt_v2(p_task_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;d jsonb;v_entry uuid;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_CONFIRM_NOTE_REQUIRED';end if;
 select * into o from public.operations_tasks where id=p_task_id for update;
 if o.id is null or o.task_type not in ('finance_transfer','finance_transfer_retry') or o.source_kind not in ('finance_transfer_receiver','finance_transfer_receiver_retry') then raise exception using errcode='22023',message='FINANCE_TRANSFER_TASK_NOT_FOUND';end if;
 if o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER';end if;
 select * into t from private.finance_transfers_v2 where id=o.source_id for update;
 if t.status='completed' then return jsonb_build_object('ok',true,'idempotent',true,'transfer_id',t.id,'status','completed');end if;
 if t.status<>'awaiting_receiver' or o.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_RECEIVABLE';end if;
 d:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.destination_ledger_kind,t.destination_account_id);
 if d is null or (d->>'responsible_user_id')::uuid is distinct from auth.uid() or t.destination_responsible_user_id is distinct from auth.uid() then raise exception using errcode='55000',message='FINANCE_TRANSFER_DESTINATION_RESPONSIBILITY_CHANGED';end if;
 v_entry:=private.finance_transfer_post_ledger_v2(t.id,t.branch_id,t.destination_ledger_kind,t.destination_account_id,t.amount,'in','استلام تحويل مالي من '||t.source_account_name,auth.uid());
 update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),failure_reason=null,metadata=metadata||jsonb_build_object('resolution_note',trim(p_note),'finance_transfer_stage','receiver_confirmed'),updated_at=now() where id=o.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'completed',auth.uid(),trim(p_note),jsonb_build_object('transfer_id',t.id,'stage','receiver','is_retry',o.task_type='finance_transfer_retry'));
 update private.finance_transfers_v2 set status='completed',destination_ledger_entry_id=v_entry,receiver_confirmed_by=auth.uid(),receiver_confirmed_at=now(),receiver_note=trim(p_note),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','completed','destination_ledger_entry_id',v_entry);
end;$$;

create or replace function public.reject_finance_transfer_receipt_v2(p_task_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_REJECTION_REASON_REQUIRED';end if;
 select * into o from public.operations_tasks where id=p_task_id for update;
 if o.id is null or o.task_type not in ('finance_transfer','finance_transfer_retry') or o.source_kind not in ('finance_transfer_receiver','finance_transfer_receiver_retry') or o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER';end if;
 select * into t from private.finance_transfers_v2 where id=o.source_id for update;
 if t.status<>'awaiting_receiver' then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_REJECTABLE';end if;
 update public.operations_tasks set status='failed',failure_reason=trim(p_reason),completed_by=auth.uid(),completed_at=now(),updated_at=now() where id=o.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'failed',auth.uid(),trim(p_reason),jsonb_build_object('transfer_id',t.id,'stage','receiver','is_retry',o.task_type='finance_transfer_retry'));
 update private.finance_transfers_v2 set status='exception',rejected_by=auth.uid(),rejected_at=now(),rejection_stage='receiver',rejection_reason=trim(p_reason),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','exception','in_transit_amount',t.amount);
end;$$;

revoke all on function public.get_my_finance_transfer_tasks_v2(uuid) from public,anon;
revoke all on function public.confirm_finance_transfer_receipt_v2(uuid,text) from public,anon;
revoke all on function public.reject_finance_transfer_receipt_v2(uuid,text) from public,anon;
grant execute on function public.get_my_finance_transfer_tasks_v2(uuid) to authenticated,service_role;
grant execute on function public.confirm_finance_transfer_receipt_v2(uuid,text) to authenticated,service_role;
grant execute on function public.reject_finance_transfer_receipt_v2(uuid,text) to authenticated,service_role;
