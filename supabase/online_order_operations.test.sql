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


create temporary table order_ops_fixture as select gen_random_uuid() legacy,gen_random_uuid() modern,gen_random_uuid() oversell,gen_random_uuid() late_payment,gen_random_uuid() cancellation, (select branch_id from public.inventory where product_id=(select product from checkout_fixture) limit 1) branch;
grant select on order_ops_fixture to authenticated;
insert into public.online_orders(id,branch_id,status,payment_status,payment_method,total,items)
select o.legacy,o.branch,'shipped','pending','cash',80,jsonb_build_array(
 jsonb_build_object('product_id',f.product,'quantity',2),
 jsonb_build_object('product_id',f.product,'quantity',1,'is_bulk',true,'bulk_quantity',6),
 jsonb_build_object('product_id',f.weight_product,'quantity',0.25,'unit_of_measure','weight')) from checkout_fixture f cross join order_ops_fixture o;
insert into public.online_orders(id,branch_id,status,payment_status,payment_method,total,items,checkout_version,customer_snapshot,shipping_snapshot,stock_deductions)
select modern,branch,'shipped','pending','wallet',10,'[]',1,'{}','{}','[]' from order_ops_fixture;
insert into public.online_orders(id,branch_id,status,payment_status,payment_method,total,items)
select o.oversell,o.branch,'shipped','paid','cash',10000,jsonb_build_array(jsonb_build_object('product_id',f.product,'quantity',1000)) from order_ops_fixture o cross join checkout_fixture f;
insert into public.online_orders(id,branch_id,status,payment_status,payment_method,total,items)
select late_payment,branch,'delivered','pending','cash',10,'[]' from order_ops_fixture;
insert into public.online_orders(id,branch_id,status,payment_status,payment_method,total,items,checkout_version,stock_deductions)
select o.cancellation,o.branch,'pending','pending','cash',20,'[]',1,jsonb_build_array(jsonb_build_object('product_id',f.product,'quantity',2)) from order_ops_fixture o cross join checkout_fixture f;
select set_config('request.jwt.claim.sub',(select admin_id::text from checkout_fixture),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare o record; f record; initial_cash bigint; r jsonb; begin
 select * into o from order_ops_fixture; select * into f from checkout_fixture;
 select count(*) into initial_cash from public.cash_transactions where branch_id=o.branch;
 perform public.process_online_order(o.legacy,'payment',null,null,'cash','fixture-reference');
 perform public.process_online_order(o.legacy,'payment',null,null,'cash','fixture-reference');
 if (select count(*) from public.cash_transactions where branch_id=o.branch)<>initial_cash then raise exception 'Cash before delivery';end if;
 perform public.process_online_order(o.legacy,'status','shipped','delivered');
 perform public.process_online_order(o.legacy,'status','shipped','delivered');
 if (select quantity from public.inventory where branch_id=o.branch and product_id=f.product)<>12 then raise exception 'Bulk/unit deduction mismatch';end if;
 if (select quantity from public.inventory where branch_id=o.branch and product_id=f.weight_product)<>19.75 then raise exception 'Fractional deduction mismatch';end if;
 if (select count(*) from public.cash_transactions where branch_id=o.branch)<>initial_cash+1 then raise exception 'Receipt mismatch';end if;
 r:=public.process_online_order(o.modern,'payment',null,null,'cash','wallet-reference');
 if r->>'payment_method'<>'wallet' then raise exception 'Immutable method changed';end if;
 perform public.process_online_order(o.modern,'status','shipped','delivered');
 if (select quantity from public.inventory where branch_id=o.branch and product_id=f.product)<>12 then raise exception 'Modern stock deducted again';end if;
 if (select count(*) from public.cash_transactions where branch_id=o.branch)<>initial_cash+1 then raise exception 'Wallet counted as cash';end if;
 perform public.process_online_order(o.late_payment,'payment',null,null,'cash');
 perform public.process_online_order(o.late_payment,'payment',null,null,'cash');
 if (select count(*) from public.cash_transactions where branch_id=o.branch)<>initial_cash+2 then raise exception 'Late payment duplicate';end if;
 begin perform public.process_online_order(o.oversell,'status','shipped','delivered');raise exception 'Oversold';exception when invalid_parameter_value then null;end;
 if (select status from public.online_orders where id=o.oversell)<>'shipped' then raise exception 'Failure did not roll back status';end if;
 begin perform public.process_online_order(o.cancellation,'status','pending','delivered');raise exception 'Skipped stages';exception when invalid_parameter_value then null;end;
 begin perform public.process_online_order(o.cancellation,'status','ready','shipped');raise exception 'Stale state accepted';exception when serialization_failure then null;end;
 perform public.process_online_order(o.cancellation,'status','pending','cancelled');
 perform public.process_online_order(o.cancellation,'status','pending','cancelled');
 if (select quantity from public.inventory where branch_id=o.branch and product_id=f.product)<>14 then raise exception 'Cancellation stock duplicate';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select u1::text from checkout_fixture),true);
set local role authenticated;
do $$ begin
 begin perform public.process_online_order((select legacy from order_ops_fixture),'payment');raise exception 'Customer authorized';exception when insufficient_privilege then null;end;
end $$;
reset role;
set constraints all immediate;
select 'PASS: legacy bulk/weight, no double stock for modern checkout, immutable wallet, payment before/after delivery, retry deduplication, oversell rollback, stale transitions, cancellation once, customer denial' as result;
