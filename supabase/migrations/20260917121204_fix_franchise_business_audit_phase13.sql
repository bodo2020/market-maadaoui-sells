do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.create_franchise_operator_v1(uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def,
E'  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,branch_id,action,after_state,actor_user_id)\n  values(p_tenant_id,''franchise'',v_merchant_id,v_branch_id,''franchise_created'',jsonb_build_object(''merchant_id'',v_merchant_id,''agreement_id'',v_agreement_id,''branch_id'',v_branch_id),auth.uid());\n',
'');
  execute v_def;

  select pg_get_functiondef('public.create_franchise_branch_v1(uuid,jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def,
E'  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,branch_id,action,after_state,actor_user_id)\n  values(v_tenant_id,''franchise_branch'',v_branch_id,v_branch_id,''franchise_branch_created'',jsonb_build_object(''merchant_id'',p_merchant_id,''branch_id'',v_branch_id),auth.uid());\n',
'');
  execute v_def;

  select pg_get_functiondef('public.transition_franchise_agreement_v1(uuid,text,text)'::regprocedure) into v_def;
  v_def := replace(v_def,
E'  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,action,before_state,after_state,reason,actor_user_id)\n  values(v_tenant_id,''franchise_agreement'',v_agreement.id,''franchise_agreement_''||p_action,v_before,(select to_jsonb(a) from private.franchise_agreements_v1 a where a.id=v_agreement.id),p_reason,auth.uid());\n',
'');
  execute v_def;
end $$;
