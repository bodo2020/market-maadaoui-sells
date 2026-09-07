revoke all on function public.preflight_pos_sale(uuid,jsonb) from public,anon;
grant execute on function public.preflight_pos_sale(uuid,jsonb) to authenticated;

revoke all on function public.save_product_editor(uuid,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_product_editor(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;

revoke all on function public.save_product_variant(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.save_product_variant(uuid,uuid,jsonb,uuid) to authenticated;

revoke all on function public.set_product_variant_active(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_product_variant_active(uuid,uuid,boolean) to authenticated;

revoke all on function public.get_product_management_catalog(uuid,text,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_product_management_catalog(uuid,text,uuid,uuid,integer,integer) to authenticated;

revoke all on function public.import_product_rows(uuid,jsonb,text) from public,anon;
grant execute on function public.import_product_rows(uuid,jsonb,text) to authenticated;
