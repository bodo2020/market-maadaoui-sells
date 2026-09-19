create or replace function public.search_business_debt_parties_v1(
  p_branch_id uuid,
  p_party_type text,
  p_search text default null,
  p_limit integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_search text := nullif(trim(coalesce(p_search,'')),'');
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='DEBT_VIEW_DENIED'; end if;
  if p_party_type not in ('customer','employee','supplier') then raise exception using errcode='22023',message='INVALID_PARTY_TYPE'; end if;

  if p_party_type='customer' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select c.id,coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل') name,c.phone,c.email
      from public.customers c
      where v_search is null or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.first_name,'') ilike '%'||v_search||'%' or coalesce(c.last_name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%'
      order by 2 limit v_limit
    ) x;
  elsif p_party_type='employee' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select distinct u.id,u.name,u.phone,u.email,coalesce(ep.employee_code,'') employee_code
      from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and coalesce(ubr.active,true)
      left join private.hr_employee_profiles ep on ep.user_id=u.id
      where coalesce(u.active,true) and u.role<>'super_admin'
        and (v_search is null or coalesce(u.name,'') ilike '%'||v_search||'%' or coalesce(u.phone,'') ilike '%'||v_search||'%' or coalesce(ep.employee_code,'') ilike '%'||v_search||'%')
      order by u.name limit v_limit
    ) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select s.id,s.name,s.phone,s.email,s.payment_terms_days,s.credit_limit
      from public.suppliers s
      where coalesce(s.active,true) and (v_search is null or coalesce(s.name,'') ilike '%'||v_search||'%' or coalesce(s.phone,'') ilike '%'||v_search||'%')
      order by s.name limit v_limit
    ) x;
  end if;
  return jsonb_build_object('party_type',p_party_type,'rows',coalesce(v_rows,'[]'::jsonb));
end;
$function$;

revoke all on function public.search_business_debt_parties_v1(uuid,text,text,integer) from public,anon;
grant execute on function public.search_business_debt_parties_v1(uuid,text,text,integer) to authenticated,service_role;
