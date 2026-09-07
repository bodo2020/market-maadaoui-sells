-- Execute the entire file inside BEGIN / ROLLBACK. No fixtures may be committed.
create temporary table checkout_fixture as select gen_random_uuid() u1,gen_random_uuid() u2,
  gen_random_uuid() admin_id,gen_random_uuid() product,gen_random_uuid() weight_product,
  gen_random_uuid() address,gen_random_uuid() foreign_address,gen_random_uuid() request_id;
grant select on checkout_fixture to authenticated,anon;
insert into auth.users(id,raw_user_meta_data) select u1,'{"name":"Checkout fixture"}'::jsonb from checkout_fixture;
insert into auth.users(id,raw_user_meta_data) select u2,'{"name":"Other fixture"}'::jsonb from checkout_fixture;
insert into auth.users(id,raw_user_meta_data) select admin_id,'{"name":"Admin fixture"}'::jsonb from checkout_fixture;
insert into public.users(id,name,username,password,role)
select admin_id,'Checkout fixture admin',admin_id::text,'unused-test-only','admin' from checkout_fixture;
insert into public.products(id,name,price,purchase_price,quantity,bulk_enabled,bulk_quantity,bulk_price,is_offer,offer_price)
select product,'Checkout temporary product',10,5,0,true,6,50,false,1 from checkout_fixture;
insert into public.products(id,name,price,purchase_price,quantity,barcode_type)
select weight_product,'Checkout temporary weight',40,20,0,'scale' from checkout_fixture;
update public.inventory set quantity=20 where product_id in(select product from checkout_fixture union all select weight_product from checkout_fixture);
insert into public.customer_addresses(id,user_id,address,latitude,longitude,neighborhood_id)
select f.address,f.u1,'Checkout temporary address',30.1,31.2,
  (select n.id from public.neighborhoods n join public.delivery_type_pricing d on d.delivery_location_id=n.id
    group by n.id having count(*)=1 limit 1) from checkout_fixture f;
insert into public.customer_addresses(id,user_id,address)
select foreign_address,u2,'Foreign checkout address' from checkout_fixture;

select set_config('request.jwt.claim.sub',(select admin_id::text from checkout_fixture),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare f record; b uuid; payload jsonb; result jsonb; repeated jsonb; initial_cash bigint; delta_id uuid:=gen_random_uuid(); begin
 select * into f from checkout_fixture;
 select branch_id into b from public.inventory where product_id=f.product limit 1;
 payload:=jsonb_build_object('invoice_number','ATOMIC-ROLLBACK-FIXTURE','subtotal',80,'discount',0,'total',80,'profit',0,'payment_method','cash','cash_amount',80,'card_amount',0,'items',jsonb_build_array(
 jsonb_build_object('product',jsonb_build_object('id',f.product),'quantity',2,'price',10,'total',20),
 jsonb_build_object('product',jsonb_build_object('id',f.product),'quantity',1,'isBulk',true,'price',50,'total',50),
 jsonb_build_object('product',jsonb_build_object('id',f.weight_product),'quantity',1,'weight',0.25,'price',40,'total',10)));
 select count(*) into initial_cash from public.cash_transactions where branch_id=b;
 result:=public.create_pos_sale(f.request_id,b,payload);
 repeated:=public.create_pos_sale(f.request_id,b,payload);
 if result<>repeated then raise exception 'Sale retry changed result';end if;
 if (select quantity from public.inventory where product_id=f.product and branch_id=b)<>12 or
 (select quantity from public.inventory where product_id=f.weight_product and branch_id=b)<>19.75 then raise exception 'Incorrect sale stock';end if;
 if (select count(*) from public.cash_transactions where branch_id=b)<>initial_cash+1 then raise exception 'Cash receipt duplicated';end if;
 begin
  perform public.create_pos_sale(gen_random_uuid(),b,jsonb_set(payload,'{items,0,quantity}','1000'));
  raise exception 'Oversold stock';
 exception when invalid_parameter_value then null; end;
 if (select count(*) from public.sales where invoice_number='ATOMIC-ROLLBACK-FIXTURE')<>1 then raise exception 'Failed sale remained';end if;
 if public.adjust_branch_inventory(delta_id,f.product,b,1)<>13 then raise exception 'Stock adjustment wrong';end if;
 if public.adjust_branch_inventory(delta_id,f.product,b,1)<>13 then raise exception 'Stock adjustment duplicated';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select u1::text from checkout_fixture),true);
set local role authenticated;
do $$ begin
 begin
  perform public.create_pos_sale(gen_random_uuid(),(select branch_id from public.inventory limit 1),'{}');
  raise exception 'Customer created POS sale';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set constraints all immediate;
select 'PASS: atomic sale, bulk and fractional stock, cash receipt once, oversell rollback, adjustment retries, customer denial' as result;
