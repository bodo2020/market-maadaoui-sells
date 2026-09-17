create or replace function private.create_franchise_operation_request_v1(
  p_merchant_id uuid,p_branch_id uuid,p_request_type text,p_product_id uuid,p_order_id uuid,p_payload jsonb,p_title text,p_description text,p_priority text default 'normal'
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid:=gen_random_uuid(); v_task uuid:=gen_random_uuid(); v_tenant uuid;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  select b.tenant_id into v_tenant from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id;

  insert into public.operations_tasks(id,branch_id,task_type,source_kind,source_id,order_id,priority,status,title,description,due_at,metadata,created_by)
  values(v_task,p_branch_id,'franchise_operation_review','franchise_operation',v_id,p_order_id,case when p_priority in ('urgent','high','normal','low') then p_priority else 'normal' end,'open',p_title,p_description,now()+interval '24 hours',jsonb_build_object('merchant_id',p_merchant_id,'request_type',p_request_type,'requested_by',auth.uid()),auth.uid());

  insert into private.franchise_operation_requests_v1(id,tenant_id,merchant_id,branch_id,request_type,product_id,order_id,payload,status,requested_by,task_id)
  values(v_id,v_tenant,p_merchant_id,p_branch_id,p_request_type,p_product_id,p_order_id,coalesce(p_payload,'{}'::jsonb),'pending',auth.uid(),v_task);

  return jsonb_build_object('mode','approval_required','request_id',v_id,'task_id',v_task,'status','pending');
end;
$$;

revoke all on function private.create_franchise_operation_request_v1(uuid,uuid,text,uuid,uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function private.create_franchise_operation_request_v1(uuid,uuid,text,uuid,uuid,jsonb,text,text,text) to service_role;
