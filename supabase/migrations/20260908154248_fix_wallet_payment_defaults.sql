update public.pos_payment_methods
set fee_bearer = 'business',
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
