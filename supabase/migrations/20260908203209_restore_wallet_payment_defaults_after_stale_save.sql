-- Re-assert the intended wallet defaults after an already-open settings form
-- saved stale values over the previous migration.

update public.pos_payment_methods
set fee_type = 'percent',
    fee_value = 1,
    fee_bearer = 'business',
    require_reference = false,
    updated_at = now()
where code = 'vodafone_cash'
  and coalesce(metadata->>'archived','false') <> 'true';

update public.pos_payment_methods
set fee_type = 'none',
    fee_value = 0,
    fee_bearer = 'business',
    require_reference = false,
    updated_at = now()
where code = 'instapay'
  and coalesce(metadata->>'archived','false') <> 'true';
