create or replace function public.get_reporting_insights_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_overview jsonb;
  v_returns jsonb;
  v_inventory jsonb;
  v_shifts jsonb;
  v_online jsonb;
  v_customers jsonb;
  v_insights jsonb := '[]'::jsonb;
  v_sorted jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_critical bigint := 0;
  v_warning bigint := 0;
  v_opportunity bigint := 0;
  v_info bigint := 0;
  v_payment_coverage numeric := 100;
  v_payment_gap numeric := 0;
  v_cash_variance numeric := 0;
  v_variance_shifts numeric := 0;
  v_net_sales numeric := 0;
  v_return_rate numeric := 0;
  v_pending_refund_amount numeric := 0;
  v_pending_refund_tasks numeric := 0;
  v_inventory_rows numeric := 0;
  v_out_stock numeric := 0;
  v_low_stock numeric := 0;
  v_no_movement numeric := 0;
  v_unlinked_inventory numeric := 0;
  v_identity_coverage numeric := 100;
  v_pos_identity_coverage numeric := 100;
  v_online_pending numeric := 0;
  v_online_active_value numeric := 0;
  v_stale_online_count bigint := 0;
  v_stale_online_value numeric := 0;
  v_online_profit_complete boolean := false;
  v_delivery_duration_available boolean := false;
  v_can_cash_control boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023',message='BRANCH_REQUIRED';
  end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then
    raise exception using errcode='42501',message='REPORTS_VIEW_DENIED';
  end if;
  if p_from is null or p_to is null or p_to<=p_from then
    raise exception using errcode='22023',message='INVALID_REPORT_RANGE';
  end if;
  if p_to-p_from>interval '732 days' then
    raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE';
  end if;

  v_overview := public.get_reporting_overview_v2(p_branch_id,p_from,p_to);
  v_returns := public.get_reporting_returns_v2(p_branch_id,p_from,p_to);
  v_inventory := public.get_reporting_inventory_v2(p_branch_id,p_from,p_to);
  v_shifts := public.get_reporting_shifts_v2(p_branch_id,p_from,p_to,100);
  v_online := public.get_reporting_online_v2(p_branch_id,p_from,p_to,100);
  v_customers := public.get_reporting_customers_v2(p_branch_id,p_from,p_to,100);

  v_net_sales := coalesce((v_overview->'current'->>'net_sales')::numeric,0);
  v_return_rate := coalesce((v_overview->'current'->>'return_rate')::numeric,0);
  v_online_profit_complete := coalesce((v_overview->'data_quality'->>'online_profit_complete')::boolean,false);

  v_payment_coverage := coalesce((v_shifts->'summary'->>'payment_coverage_percent')::numeric,100);
  v_payment_gap := coalesce((v_shifts->'summary'->>'payment_legacy_gap')::numeric,0);
  v_cash_variance := coalesce((v_shifts->'summary'->>'cash_variance_absolute')::numeric,0);
  v_variance_shifts := coalesce((v_shifts->'summary'->>'variance_shifts')::numeric,0);
  v_can_cash_control := coalesce((v_shifts->'permissions'->>'can_view_cash_control')::boolean,false);

  v_pending_refund_amount := coalesce((v_returns->'summary'->>'pending_refund_amount')::numeric,0);
  v_pending_refund_tasks := coalesce((v_returns->'summary'->>'pending_refund_tasks')::numeric,0);

  v_inventory_rows := coalesce((v_inventory->'summary'->>'inventory_rows')::numeric,0);
  v_out_stock := coalesce((v_inventory->'summary'->>'out_of_stock_rows')::numeric,0);
  v_low_stock := coalesce((v_inventory->'summary'->>'low_stock_rows')::numeric,0);
  v_no_movement := coalesce((v_inventory->'summary'->>'no_movement_rows')::numeric,0);
  v_unlinked_inventory := coalesce((v_inventory->'summary'->>'unlinked_inventory_rows')::numeric,0);

  v_identity_coverage := coalesce((v_customers->'summary'->>'overall_identity_coverage_percent')::numeric,100);
  v_pos_identity_coverage := coalesce((v_customers->'summary'->>'pos_identity_coverage_percent')::numeric,100);

  v_online_pending := coalesce((v_online->'summary'->>'pending_orders')::numeric,0);
  v_online_active_value := coalesce((v_online->'summary'->>'active_order_value')::numeric,0);
  v_delivery_duration_available := coalesce((v_online->'data_quality'->>'delivery_duration_available')::boolean,false);

  select count(*),coalesce(sum(total),0)
  into v_stale_online_count,v_stale_online_value
  from public.online_orders
  where branch_id=p_branch_id
    and created_at>=p_from and created_at<p_to
    and status not in ('delivered','cancelled')
    and created_at<now()-interval '2 hours';

  if v_inventory_rows>0 and v_out_stock>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','inventory_out_of_stock',
      'severity',case when v_out_stock/v_inventory_rows>=0.20 then 'critical' else 'warning' end,
      'category','inventory','priority',case when v_out_stock/v_inventory_rows>=0.20 then 100 else 82 end,
      'title','أصناف نافدة تحتاج مراجعة',
      'message',format('%s من %s صف مخزون ظاهر كنافد حاليًا.',trim(to_char(v_out_stock,'FM999999990')),trim(to_char(v_inventory_rows,'FM999999990'))),
      'metric_label','نسبة الصفوف النافدة','metric_value',round(v_out_stock/v_inventory_rows*100,2),'metric_unit','percent',
      'action','راجع الأصناف النافدة والأعلى طلبًا وحدد إعادة الطلب أو مشكلة بيانات المخزون.',
      'href','/reports/inventory',
      'evidence',jsonb_build_object('out_of_stock_rows',v_out_stock,'inventory_rows',v_inventory_rows)
    ));
  end if;

  if v_low_stock>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','inventory_low_stock','severity','warning','category','inventory','priority',78,
      'title','مخزون منخفض يحتاج تخطيط توريد',
      'message',format('%s صنف/صف مخزون تحت حد إعادة الطلب.',trim(to_char(v_low_stock,'FM999999990'))),
      'metric_label','Low Stock','metric_value',v_low_stock,'metric_unit','rows',
      'action','ابدأ بالأصناف ذات الحركة الأعلى ثم راجع حدود إعادة الطلب.',
      'href','/reports/inventory','evidence',jsonb_build_object('low_stock_rows',v_low_stock)
    ));
  end if;

  if v_no_movement>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','inventory_no_movement','severity','opportunity','category','inventory','priority',62,
      'title','مخزون بلا حركة داخل الفترة',
      'message',format('%s صف مخزون موجب لم يظهر له بيع POS داخل الفترة المختارة.',trim(to_char(v_no_movement,'FM999999990'))),
      'metric_label','بدون حركة','metric_value',v_no_movement,'metric_unit','rows',
      'action','راجع أعلى الأصناف الساكنة بالقيمة قبل شراء كميات إضافية، وفكر في عرض أو نقل مخزون.',
      'href','/reports/inventory','evidence',jsonb_build_object('no_movement_rows',v_no_movement)
    ));
  end if;

  if v_unlinked_inventory>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','inventory_unlinked_catalog','severity','warning','category','data_quality','priority',84,
      'title','صفوف مخزون غير مرتبطة بكتالوج صالح',
      'message',format('%s صف مخزون لا يملك ربطًا صالحًا بمنتج في الكتالوج.',trim(to_char(v_unlinked_inventory,'FM999999990'))),
      'metric_label','Unlinked Inventory','metric_value',v_unlinked_inventory,'metric_unit','rows',
      'action','نظف روابط product_id قبل الاعتماد الكامل على قيمة المخزون والتغطية.',
      'href','/reports/inventory','evidence',jsonb_build_object('unlinked_inventory_rows',v_unlinked_inventory)
    ));
  end if;

  if v_pending_refund_tasks>0 or v_pending_refund_amount>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','pending_refunds','severity','critical','category','returns','priority',98,
      'title','مبالغ مرتجعات مازالت بانتظار التحويل',
      'message',format('%s مهمة رد معلقة بقيمة %s جنيه.',trim(to_char(v_pending_refund_tasks,'FM999999990')),trim(to_char(v_pending_refund_amount,'FM999999990.00'))),
      'metric_label','مبلغ معلق','metric_value',round(v_pending_refund_amount,2),'metric_unit','EGP',
      'action','افتح مهام المرتجعات واستلم التحويلات المعلقة حتى لا تتجاوز زمن الخدمة.',
      'href','/reports/returns','evidence',jsonb_build_object('pending_tasks',v_pending_refund_tasks,'pending_amount',v_pending_refund_amount)
    ));
  end if;

  if v_return_rate>=5 and v_net_sales>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','return_rate_watch','severity',case when v_return_rate>=10 then 'critical' else 'warning' end,'category','returns',
      'priority',case when v_return_rate>=10 then 92 else 72 end,
      'title','نسبة المرتجعات تستحق المراجعة',
      'message',format('قيمة المرتجعات تعادل %s%% من مبيعات POS المعترف بها في الفترة.',trim(to_char(v_return_rate,'FM999999990.00'))),
      'metric_label','Return Rate','metric_value',round(v_return_rate,2),'metric_unit','percent',
      'action','راجع أسباب المرتجعات والأصناف والكاشير المرتبطين بها قبل اعتبارها نمطًا دائمًا.',
      'href','/reports/returns','evidence',jsonb_build_object('return_rate',v_return_rate,'net_sales',v_net_sales)
    ));
  end if;

  if v_can_cash_control and v_variance_shifts>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','cash_shift_variance',
      'severity',case when v_cash_variance>=greatest(100,v_net_sales*0.02) then 'critical' else 'warning' end,
      'category','shifts','priority',case when v_cash_variance>=greatest(100,v_net_sales*0.02) then 96 else 80 end,
      'title','فروق نقدية مسجلة في إغلاقات الورديات',
      'message',format('%s وردية بها فرق، وإجمالي الفرق المطلق %s جنيه.',trim(to_char(v_variance_shifts,'FM999999990')),trim(to_char(v_cash_variance,'FM999999990.00'))),
      'metric_label','إجمالي الفرق المطلق','metric_value',round(v_cash_variance,2),'metric_unit','EGP',
      'action','راجع الورديات ذات الفرق وأسباب التسوية قبل إغلاق الفترة المالية.',
      'href','/reports/shifts','evidence',jsonb_build_object('variance_shifts',v_variance_shifts,'absolute_variance',v_cash_variance)
    ));
  end if;

  if v_payment_gap>0.005 and v_payment_coverage<99.99 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','payment_ledger_coverage','severity','info','category','data_quality','priority',48,
      'title','جزء من تاريخ الدفع أقدم من Payment Ledger الحديث',
      'message',format('تغطية سجل الدفع %s%%، والفجوة التاريخية %s جنيه. هذا لا يقلل رقم المبيعات المعتمد من Invoice V2.',trim(to_char(v_payment_coverage,'FM999999990.00')),trim(to_char(v_payment_gap,'FM999999990.00'))),
      'metric_label','Payment Coverage','metric_value',round(v_payment_coverage,2),'metric_unit','percent',
      'action','استخدم Invoice V2 للمبيعات، واعتبر الفجوة مؤشر جودة تاريخية فقط عند تحليل وسائل الدفع القديمة.',
      'href','/reports/shifts','evidence',jsonb_build_object('coverage_percent',v_payment_coverage,'legacy_gap',v_payment_gap)
    ));
  end if;

  if v_identity_coverage<50 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','customer_identity_coverage','severity','opportunity','category','customers','priority',74,
      'title','معظم التجارة غير مرتبطة بهوية عميل موثوقة',
      'message',format('تغطية هوية العميل %s%% فقط، وتغطية POS %s%%.',trim(to_char(v_identity_coverage,'FM999999990.00')),trim(to_char(v_pos_identity_coverage,'FM999999990.00'))),
      'metric_label','Identity Coverage','metric_value',round(v_identity_coverage,2),'metric_unit','percent',
      'action','اربط customer_id لحظة بيع POS بدل الاعتماد على الاسم أو الهاتف بعد البيع؛ بعدها يصبح LTV والتكرار قابلين للثقة.',
      'href','/reports/customers','evidence',jsonb_build_object('overall_coverage',v_identity_coverage,'pos_coverage',v_pos_identity_coverage)
    ));
  end if;

  if v_stale_online_count>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','stale_online_orders','severity','warning','category','online','priority',86,
      'title','طلبات أونلاين نشطة منذ أكثر من ساعتين',
      'message',format('%s طلب نشط بقيمة %s جنيه تجاوز ساعتين بدون وصول لحالة نهائية.',v_stale_online_count,trim(to_char(v_stale_online_value,'FM999999990.00'))),
      'metric_label','طلبات متأخرة','metric_value',v_stale_online_count,'metric_unit','orders',
      'action','راجع الطلبات الأقدم وحدد هل تحتاج تأكيدًا، تجهيزًا، توصيلًا أو إلغاءً.',
      'href','/reports/online','evidence',jsonb_build_object('stale_order_count',v_stale_online_count,'stale_order_value',v_stale_online_value)
    ));
  elsif v_online_pending>0 then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','active_online_orders','severity','info','category','online','priority',42,
      'title','طلبات أونلاين بانتظار المعالجة',
      'message',format('%s طلب جديد/معلق بقيمة نشطة %s جنيه.',trim(to_char(v_online_pending,'FM999999990')),trim(to_char(v_online_active_value,'FM999999990.00'))),
      'metric_label','طلبات معلقة','metric_value',v_online_pending,'metric_unit','orders',
      'action','تابع الطلبات من شاشة الأونلاين حسب وقت الإنشاء.',
      'href','/reports/online','evidence',jsonb_build_object('pending_orders',v_online_pending,'active_value',v_online_active_value)
    ));
  end if;

  if not v_online_profit_complete then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','online_profit_data_gap','severity','info','category','data_quality','priority',35,
      'title','ربحية الأونلاين غير مكتملة بعد',
      'message','طلبات الأونلاين لا تملك Cost Snapshot موحدًا لكل صنف، لذلك Reporting V2 لا يعرض ربحًا تقديريًا.',
      'metric_label','Online Profit Coverage','metric_value',0,'metric_unit','not_available',
      'action','ثبّت تكلفة الصنف داخل order item snapshot وقت الطلب حتى يدخل الأونلاين في الربحية الكاملة.',
      'href','/reports/online','evidence',jsonb_build_object('profit_complete',false)
    ));
  end if;

  if not v_delivery_duration_available then
    v_insights := v_insights || jsonb_build_array(jsonb_build_object(
      'id','delivery_sla_data_gap','severity','info','category','data_quality','priority',30,
      'title','SLA التوصيل التاريخي غير موثوق',
      'message','تاريخ الحالات القديم يحتوي على تعديلات جماعية، لذلك لم يتم اختلاق متوسط زمن توصيل.',
      'metric_label','Delivery SLA History','metric_value',0,'metric_unit','not_available',
      'action','اعتمد Timeline نظيف للحالات الجديدة ثم ابدأ قياس زمن التأكيد والتجهيز والتوصيل.',
      'href','/reports/online','evidence',jsonb_build_object('delivery_duration_available',false)
    ));
  end if;

  select coalesce(jsonb_agg(value order by (value->>'priority')::int desc,value->>'id'),'[]'::jsonb)
  into v_sorted
  from jsonb_array_elements(v_insights);

  select
    count(*) filter(where value->>'severity'='critical'),
    count(*) filter(where value->>'severity'='warning'),
    count(*) filter(where value->>'severity'='opportunity'),
    count(*) filter(where value->>'severity'='info')
  into v_critical,v_warning,v_opportunity,v_info
  from jsonb_array_elements(v_sorted);

  v_summary := jsonb_build_object(
    'total',v_critical+v_warning+v_opportunity+v_info,
    'critical',v_critical,'warning',v_warning,'opportunity',v_opportunity,'info',v_info,
    'highest_severity',case when v_critical>0 then 'critical' when v_warning>0 then 'warning' when v_opportunity>0 then 'opportunity' else 'info' end
  );

  return jsonb_build_object(
    'version',2,'rule_version',1,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',v_summary,'insights',v_sorted,
    'data_quality',jsonb_build_object(
      'mode','deterministic_verified_metric_rules',
      'generative_ai_used',false,
      'raw_customer_matching_used',false,
      'rules_note','Business-target judgments such as desired margin are not emitted until explicit targets exist.'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_insights_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_insights_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
