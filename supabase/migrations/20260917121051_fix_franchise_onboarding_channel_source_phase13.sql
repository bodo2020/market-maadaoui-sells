do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.create_franchise_operator_v1(uuid,jsonb,jsonb,jsonb,uuid)'::regprocedure) into v_def;
  v_def := replace(v_def, '''franchise_onboarding''', '''policy''');
  execute v_def;

  select pg_get_functiondef('public.create_franchise_branch_v1(uuid,jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, '''franchise_onboarding''', '''policy''');
  execute v_def;
end $$;
