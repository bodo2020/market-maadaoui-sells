alter function public.get_finance_control_center_v2(uuid,integer) rename to get_finance_control_center_base_v3;
revoke all on function public.get_finance_control_center_base_v3(uuid,integer) from public,anon,authenticated;
grant execute on function public.get_finance_control_center_base_v3(uuid,integer) to service_role;

create or replace function public.get_finance_control_center_v2(p_branch_id uuid,p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_base jsonb;v_summary jsonb;v_settlement_in_transit numeric:=0;v_settlement_in_transit_count integer:=0;v_settlement_exceptions integer:=0;
  v_old_in_transit numeric:=0;v_old_in_transit_count integer:=0;v_old_exceptions integer:=0;v_old_attention integer:=0;v_old_custody numeric:=0;
begin
  v_base:=public.get_finance_control_center_base_v3(p_branch_id,p_limit);
  select coalesce(sum(s.net_amount) filter(where s.status in ('awaiting_receiver','exception')),0),count(*) filter(where s.status in ('awaiting_receiver','exception')),count(*) filter(where s.status='exception')
  into v_settlement_in_transit,v_settlement_in_transit_count,v_settlement_exceptions from public.payment_settlements s where s.branch_id=p_branch_id;
  v_summary:=coalesce(v_base->'summary','{}'::jsonb);
  v_old_in_transit:=coalesce((v_summary->>'in_transit_amount')::numeric,0);v_old_in_transit_count:=coalesce((v_summary->>'in_transit_count')::integer,0);v_old_exceptions:=coalesce((v_summary->>'transfer_exception_count')::integer,0);v_old_attention:=coalesce((v_summary->>'attention_count')::integer,0);v_old_custody:=coalesce((v_summary->>'funds_under_custody_total')::numeric,coalesce((v_summary->>'liquid_funds_total')::numeric,0));
  v_summary:=v_summary||jsonb_build_object('internal_transfer_in_transit_amount',round(v_old_in_transit,2),'settlement_in_transit_amount',round(v_settlement_in_transit,2),'settlement_in_transit_count',v_settlement_in_transit_count,'settlement_exception_count',v_settlement_exceptions,'in_transit_amount',round(v_old_in_transit+v_settlement_in_transit,2),'in_transit_count',v_old_in_transit_count+v_settlement_in_transit_count,'funds_under_custody_total',round(v_old_custody+v_settlement_in_transit,2),'transfer_exception_count',v_old_exceptions+v_settlement_exceptions,'attention_count',v_old_attention+v_settlement_exceptions);
  v_base:=jsonb_set(v_base,'{summary}',v_summary,true);v_base:=jsonb_set(v_base,'{version}','4'::jsonb,true);return v_base;
end;$$;
revoke all on function public.get_finance_control_center_v2(uuid,integer) from public,anon;
grant execute on function public.get_finance_control_center_v2(uuid,integer) to authenticated,service_role;
