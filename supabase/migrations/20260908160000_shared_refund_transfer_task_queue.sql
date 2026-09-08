-- Shared operations task engine for electronic refund transfers.
-- Pending POS/online refunds become shared tasks until one eligible staff member claims them.

create table if not exists public.operations_tasks (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  task_type text not null,
  source_kind text not null,
  source_id uuid not null,
  return_id uuid null references public.returns(id),
  sale_id uuid null references public.sales(id),
  order_id uuid null references public.online_orders(id),
  payment_method_id uuid null references public.pos_payment_methods(id),
  payment_method_code text null,
  payment_method_name text null,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','claimed','in_progress','completed','failed','cancelled')),
  title text not null,
  description text null,
  claimed_by uuid null references public.users(id),
  claimed_at timestamptz null,
  started_at timestamptz null,
  completed_by uuid null references public.users(id),
  completed_at timestamptz null,
  due_at timestamptz null,
  provider_reference text null,
  failure_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_type, source_kind, source_id)
);

create index if not exists operations_tasks_branch_status_idx on public.operations_tasks(branch_id,status,created_at desc);
create index if not exists operations_tasks_claimed_by_idx on public.operations_tasks(claimed_by,status,updated_at desc);
create index if not exists operations_tasks_due_at_idx on public.operations_tasks(branch_id,due_at) where status not in ('completed','cancelled');

alter table public.operations_tasks enable row level security;
revoke all on public.operations_tasks from public, anon, authenticated;

create table if not exists public.operations_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.operations_tasks(id) on delete cascade,
  event_type text not null,
  actor_id uuid null references public.users(id),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operations_task_events_task_idx on public.operations_task_events(task_id,created_at desc);
alter table public.operations_task_events enable row level security;
revoke all on public.operations_task_events from public, anon, authenticated;

create or replace function private.sync_pos_refund_transfer_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sale public.sales%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_task_id uuid;
begin
  select * into v_sale from public.sales where id=new.sale_id;
  if v_sale.payment_method_id is not null then
    select * into v_method from public.pos_payment_methods where id=v_sale.payment_method_id;
  end if;

  if new.status='pending' then
    insert into public.operations_tasks(
      branch_id,task_type,source_kind,source_id,return_id,sale_id,payment_method_id,
      payment_method_code,payment_method_name,amount,priority,status,title,description,
      due_at,metadata,created_by,created_at,updated_at
    ) values(
      new.branch_id,'refund_transfer','pos_refund',new.id,new.return_id,new.sale_id,v_sale.payment_method_id,
      coalesce(v_sale.payment_method_code,v_method.code,v_sale.payment_method),
      coalesce(v_sale.payment_method_name,v_method.name,'وسيلة دفع إلكترونية'),
      new.amount,'normal','open','تحويل مبلغ مرتجع','رد مبلغ فاتورة '||coalesce(v_sale.invoice_number,new.sale_id::text),
      coalesce(new.created_at,now())+interval '4 hours',
      jsonb_build_object('invoice_number',v_sale.invoice_number,'original_payment_reference',v_sale.payment_reference,'sla_minutes',240),
      new.created_by,coalesce(new.created_at,now()),now()
    )
    on conflict(task_type,source_kind,source_id) do update set
      amount=excluded.amount,
      payment_method_id=excluded.payment_method_id,
      payment_method_code=excluded.payment_method_code,
      payment_method_name=excluded.payment_method_name,
      updated_at=now()
    returning id into v_task_id;

    if not exists(select 1 from public.operations_task_events e where e.task_id=v_task_id and e.event_type='created') then
      insert into public.operations_task_events(task_id,event_type,actor_id,note)
      values(v_task_id,'created',new.created_by,'تم إنشاء مهمة رد المبلغ تلقائيًا');
    end if;
  elsif new.status='confirmed' then
    update public.operations_tasks
    set status='completed',
        claimed_by=coalesce(claimed_by,new.confirmed_by),
        claimed_at=coalesce(claimed_at,new.confirmed_at,now()),
        completed_by=coalesce(new.confirmed_by,completed_by),
        completed_at=coalesce(new.confirmed_at,now()),
        provider_reference=coalesce(new.provider_reference,provider_reference),
        failure_reason=null,
        updated_at=now()
    where task_type='refund_transfer' and source_kind='pos_refund' and source_id=new.id and status<>'completed'
    returning id into v_task_id;
    if v_task_id is not null then
      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_task_id,'completed',new.confirmed_by,'تم تأكيد تحويل المرتجع',jsonb_build_object('provider_reference',new.provider_reference));
    end if;
  elsif new.status='failed' then
    update public.operations_tasks
    set status='failed',failure_reason=new.failure_reason,updated_at=now()
    where task_type='refund_transfer' and source_kind='pos_refund' and source_id=new.id and status not in ('completed','cancelled')
    returning id into v_task_id;
    if v_task_id is not null then
      insert into public.operations_task_events(task_id,event_type,actor_id,note)
      values(v_task_id,'failed',auth.uid(),coalesce(new.failure_reason,'تعذر تنفيذ التحويل'));
    end if;
  end if;
  return new;
end;
$function$;

create or replace function private.sync_online_refund_transfer_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_task_id uuid;
begin
  if new.status='pending' then
    insert into public.operations_tasks(
      branch_id,task_type,source_kind,source_id,return_id,order_id,payment_method_code,payment_method_name,
      amount,priority,status,title,description,due_at,metadata,created_by,created_at,updated_at
    ) values(
      new.branch_id,'refund_transfer','online_refund',new.id,new.return_id,new.order_id,new.payment_method,new.payment_method,
      new.amount,'normal','open','تحويل مبلغ مرتجع','رد مبلغ طلب أونلاين '||coalesce(new.order_id::text,''),
      coalesce(new.created_at,now())+interval '4 hours',jsonb_build_object('sla_minutes',240),
      new.created_by,coalesce(new.created_at,now()),now()
    )
    on conflict(task_type,source_kind,source_id) do update set
      amount=excluded.amount,payment_method_code=excluded.payment_method_code,payment_method_name=excluded.payment_method_name,updated_at=now()
    returning id into v_task_id;
    if not exists(select 1 from public.operations_task_events e where e.task_id=v_task_id and e.event_type='created') then
      insert into public.operations_task_events(task_id,event_type,actor_id,note)
      values(v_task_id,'created',new.created_by,'تم إنشاء مهمة رد المبلغ تلقائيًا');
    end if;
  elsif new.status='confirmed' then
    update public.operations_tasks
    set status='completed',claimed_by=coalesce(claimed_by,new.confirmed_by),claimed_at=coalesce(claimed_at,new.confirmed_at,now()),
        completed_by=coalesce(new.confirmed_by,completed_by),completed_at=coalesce(new.confirmed_at,now()),
        provider_reference=coalesce(new.provider_reference,provider_reference),failure_reason=null,updated_at=now()
    where task_type='refund_transfer' and source_kind='online_refund' and source_id=new.id and status<>'completed'
    returning id into v_task_id;
    if v_task_id is not null then
      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_task_id,'completed',new.confirmed_by,'تم تأكيد تحويل المرتجع',jsonb_build_object('provider_reference',new.provider_reference));
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_pos_refund_transfer_task on public.pos_card_refunds;
create trigger trg_sync_pos_refund_transfer_task
after insert or update of status,provider_reference,confirmed_by,confirmed_at,failure_reason on public.pos_card_refunds
for each row execute function private.sync_pos_refund_transfer_task();

drop trigger if exists trg_sync_online_refund_transfer_task on public.payment_refunds;
create trigger trg_sync_online_refund_transfer_task
after insert or update of status,provider_reference,confirmed_by,confirmed_at on public.payment_refunds
for each row execute function private.sync_online_refund_transfer_task();

insert into public.operations_tasks(
  branch_id,task_type,source_kind,source_id,return_id,sale_id,payment_method_id,payment_method_code,payment_method_name,
  amount,priority,status,title,description,due_at,metadata,created_by,created_at,updated_at
)
select r.branch_id,'refund_transfer','pos_refund',r.id,r.return_id,r.sale_id,s.payment_method_id,
  coalesce(s.payment_method_code,m.code,s.payment_method),coalesce(s.payment_method_name,m.name,'وسيلة دفع إلكترونية'),
  r.amount,'normal','open','تحويل مبلغ مرتجع','رد مبلغ فاتورة '||coalesce(s.invoice_number,r.sale_id::text),
  r.created_at+interval '4 hours',jsonb_build_object('invoice_number',s.invoice_number,'original_payment_reference',s.payment_reference,'sla_minutes',240),
  r.created_by,r.created_at,now()
from public.pos_card_refunds r
join public.sales s on s.id=r.sale_id
left join public.pos_payment_methods m on m.id=s.payment_method_id
where r.status='pending'
on conflict(task_type,source_kind,source_id) do nothing;

insert into public.operations_tasks(
  branch_id,task_type,source_kind,source_id,return_id,order_id,payment_method_code,payment_method_name,
  amount,priority,status,title,description,due_at,metadata,created_by,created_at,updated_at
)
select r.branch_id,'refund_transfer','online_refund',r.id,r.return_id,r.order_id,r.payment_method,r.payment_method,
  r.amount,'normal','open','تحويل مبلغ مرتجع','رد مبلغ طلب أونلاين '||r.order_id::text,
  r.created_at+interval '4 hours',jsonb_build_object('sla_minutes',240),r.created_by,r.created_at,now()
from public.payment_refunds r
where r.status='pending'
on conflict(task_type,source_kind,source_id) do nothing;

insert into public.operations_task_events(task_id,event_type,actor_id,note)
select t.id,'created',t.created_by,'تم إدراج مهمة رد المبلغ في قائمة المهام المشتركة'
from public.operations_tasks t
where t.task_type='refund_transfer'
  and not exists(select 1 from public.operations_task_events e where e.task_id=t.id and e.event_type='created');

create or replace function public.list_operations_tasks(p_branch_id uuid,p_scope text default 'active',p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_rows jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_scope text:=lower(coalesce(nullif(trim(p_scope),''),'active'));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;
  if v_scope not in ('available','mine','active','overdue','completed','all') then raise exception using errcode='22023',message='INVALID_TASK_SCOPE'; end if;

  select coalesce(jsonb_agg(row_data order by sort_created desc),'[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',t.id,'branch_id',t.branch_id,'task_type',t.task_type,'source_kind',t.source_kind,'source_id',t.source_id,
      'return_id',t.return_id,'sale_id',t.sale_id,'order_id',t.order_id,'payment_method_id',t.payment_method_id,
      'payment_method_code',t.payment_method_code,'payment_method_name',t.payment_method_name,'amount',t.amount,
      'priority',t.priority,'status',t.status,'title',t.title,'description',t.description,
      'claimed_by',t.claimed_by,'claimed_by_name',cu.name,'claimed_at',t.claimed_at,'started_at',t.started_at,
      'completed_by',t.completed_by,'completed_by_name',du.name,'completed_at',t.completed_at,
      'due_at',t.due_at,'provider_reference',t.provider_reference,'failure_reason',t.failure_reason,
      'created_at',t.created_at,'updated_at',t.updated_at,'metadata',t.metadata,'invoice_number',s.invoice_number,
      'reference_number',coalesce(s.invoice_number,t.order_id::text,t.return_id::text),
      'customer_name',coalesce(s.customer_name,c.name),'customer_phone',coalesce(s.customer_phone,c.phone),
      'is_mine',t.claimed_by=auth.uid(),
      'is_overdue',t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now(),
      'can_claim',case when t.source_kind='pos_refund' then (public.staff_has_permission('sales.refund',t.branch_id) or public.staff_has_permission('finance.manage',t.branch_id)) when t.source_kind='online_refund' then public.staff_has_permission('online_money.settle_digital',t.branch_id) else false end,
      'can_release',t.claimed_by=auth.uid() or public.staff_has_permission('finance.manage',t.branch_id)
    ) as row_data,t.created_at as sort_created
    from public.operations_tasks t
    left join public.sales s on s.id=t.sale_id
    left join public.online_orders o on o.id=t.order_id
    left join public.customers c on c.id=o.customer_id
    left join public.users cu on cu.id=t.claimed_by
    left join public.users du on du.id=t.completed_by
    where t.branch_id=p_branch_id and t.task_type='refund_transfer'
      and (v_scope='all' or (v_scope='available' and t.status='open') or (v_scope='mine' and t.claimed_by=auth.uid() and t.status in ('claimed','in_progress','failed')) or (v_scope='active' and t.status in ('open','claimed','in_progress','failed')) or (v_scope='overdue' and t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now()) or (v_scope='completed' and t.status='completed'))
    order by case when t.status='open' then 0 when t.status='claimed' then 1 when t.status='in_progress' then 2 else 3 end,t.created_at desc
    limit v_limit
  ) q;
  return v_rows;
end;
$function$;

create or replace function public.get_operations_task_events(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype; v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if not public.has_branch_access(auth.uid(),v_task.branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'event_type',e.event_type,'actor_id',e.actor_id,'actor_name',u.name,'note',e.note,'metadata',e.metadata,'created_at',e.created_at) order by e.created_at desc),'[]'::jsonb)
  into v_rows from public.operations_task_events e left join public.users u on u.id=e.actor_id where e.task_id=p_task_id;
  return v_rows;
end;
$function$;

create or replace function public.claim_operations_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype; v_allowed boolean;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  v_allowed:=case when v_task.source_kind='pos_refund' then (public.staff_has_permission('sales.refund',v_task.branch_id) or public.staff_has_permission('finance.manage',v_task.branch_id)) when v_task.source_kind='online_refund' then public.staff_has_permission('online_money.settle_digital',v_task.branch_id) else false end;
  if not v_allowed then raise exception using errcode='42501',message='TASK_CLAIM_DENIED'; end if;
  if v_task.status in ('claimed','in_progress','failed') and v_task.claimed_by=auth.uid() then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.status<>'open' then raise exception using errcode='55000',message='TASK_ALREADY_CLAIMED'; end if;
  update public.operations_tasks set status='claimed',claimed_by=auth.uid(),claimed_at=now(),failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'claimed',auth.uid(),'تم استلام المهمة');
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

create or replace function public.start_operations_task(p_task_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status='in_progress' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.status not in ('claimed','failed') then raise exception using errcode='55000',message='TASK_NOT_STARTABLE'; end if;
  update public.operations_tasks set status='in_progress',started_at=coalesce(started_at,now()),failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'started',auth.uid(),'بدأ تنفيذ التحويل');
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

create or replace function public.release_operations_task(p_task_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.status not in ('claimed','in_progress','failed') then raise exception using errcode='55000',message='TASK_NOT_RELEASABLE'; end if;
  if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('finance.manage',v_task.branch_id) then raise exception using errcode='42501',message='TASK_RELEASE_DENIED'; end if;
  update public.operations_tasks set status='open',claimed_by=null,claimed_at=null,started_at=null,failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'released',auth.uid(),nullif(trim(coalesce(p_note,'')),''));
  return to_jsonb(v_task);
end;
$function$;

create or replace function public.fail_operations_task(p_task_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype; v_reason text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_reason:=nullif(trim(coalesce(p_reason,'')),'');
  if v_reason is null or length(v_reason)<3 then raise exception using errcode='22023',message='TASK_FAILURE_REASON_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_FAILABLE'; end if;
  update public.operations_tasks set status='failed',failure_reason=v_reason,updated_at=now() where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'failed',auth.uid(),v_reason);
  return to_jsonb(v_task);
end;
$function$;

create or replace function public.complete_refund_transfer_task(p_task_id uuid,p_provider_reference text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_task public.operations_tasks%rowtype; v_reference text; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_reference:=nullif(trim(coalesce(p_provider_reference,'')),'');
  if v_reference is null or length(v_reference)<3 then raise exception using errcode='22023',message='PROVIDER_REFERENCE_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
  if v_task.source_kind='pos_refund' then
    select public.confirm_pos_card_refund(v_task.source_id,v_reference) into v_result;
  elsif v_task.source_kind='online_refund' then
    select public.confirm_online_refund(v_task.source_id,v_reference) into v_result;
  else
    raise exception using errcode='22023',message='TASK_SOURCE_UNSUPPORTED';
  end if;
  select * into v_task from public.operations_tasks where id=p_task_id;
  return to_jsonb(v_task)||jsonb_build_object('refund_result',v_result,'idempotent',false);
end;
$function$;

revoke all on function public.list_operations_tasks(uuid,text,integer) from public,anon;
revoke all on function public.get_operations_task_events(uuid) from public,anon;
revoke all on function public.claim_operations_task(uuid) from public,anon;
revoke all on function public.start_operations_task(uuid) from public,anon;
revoke all on function public.release_operations_task(uuid,text) from public,anon;
revoke all on function public.fail_operations_task(uuid,text) from public,anon;
revoke all on function public.complete_refund_transfer_task(uuid,text) from public,anon;
grant execute on function public.list_operations_tasks(uuid,text,integer) to authenticated;
grant execute on function public.get_operations_task_events(uuid) to authenticated;
grant execute on function public.claim_operations_task(uuid) to authenticated;
grant execute on function public.start_operations_task(uuid) to authenticated;
grant execute on function public.release_operations_task(uuid,text) to authenticated;
grant execute on function public.fail_operations_task(uuid,text) to authenticated;
grant execute on function public.complete_refund_transfer_task(uuid,text) to authenticated;
