-- M17b — explicitly remove anonymous execution from delivery proof/PIN APIs.

revoke execute on function public.get_my_order_delivery_proof_v1(uuid) from anon;
revoke execute on function public.get_order_delivery_proof_v1(uuid) from anon;
revoke execute on function public.transition_my_delivery_order_v2(uuid,text,double precision,double precision,numeric,text,numeric,text,text) from anon;
revoke execute on function public.transition_my_delivery_route_v2(uuid,text,uuid,double precision,double precision,numeric,text,numeric,text,text) from anon;

grant execute on function public.get_my_order_delivery_proof_v1(uuid) to authenticated,service_role;
grant execute on function public.get_order_delivery_proof_v1(uuid) to authenticated,service_role;
grant execute on function public.transition_my_delivery_order_v2(uuid,text,double precision,double precision,numeric,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.transition_my_delivery_route_v2(uuid,text,uuid,double precision,double precision,numeric,text,numeric,text,text) to authenticated,service_role;
