-- M15g — deny anonymous execution of substitution/customer checkout RPCs.
revoke execute on function public.search_order_fulfillment_substitution_candidates_v2(uuid,text,integer) from anon;
revoke execute on function public.propose_order_fulfillment_substitution_v2(uuid,uuid,uuid,numeric,text) from anon;
revoke execute on function public.get_my_order_picking_session_v2(uuid) from anon;
revoke execute on function public.mark_order_fulfillment_shortage_v2(uuid,numeric,text) from anon;
revoke execute on function public.get_my_order_substitutions_v1(uuid) from anon;
revoke execute on function public.decide_my_order_substitution_v1(uuid,text) from anon;
revoke execute on function public.place_customer_order_with_voucher_v3(uuid,jsonb,uuid,text,text,text,text,numeric,uuid,text) from anon;
revoke execute on function public.place_marketplace_order_v3(uuid,uuid,jsonb,uuid,text,text,text,uuid,text) from anon;
revoke execute on function public.place_combined_order_group_v3(uuid,jsonb,uuid,text,text,text,uuid,text) from anon;
revoke execute on function public.list_order_substitution_approvals_v1(uuid,integer) from anon;
revoke execute on function public.decide_order_fulfillment_substitution_v1(uuid,text,text) from anon;
