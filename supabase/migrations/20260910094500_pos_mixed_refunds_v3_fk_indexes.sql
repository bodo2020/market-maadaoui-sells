create index if not exists pos_return_payment_parts_v3_branch_idx
  on private.pos_return_payment_parts_v3(branch_id);

create index if not exists pos_return_payment_parts_v3_sale_payment_part_idx
  on private.pos_return_payment_parts_v3(sale_payment_part_id);
