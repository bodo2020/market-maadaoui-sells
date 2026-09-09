create index if not exists inventory_audit_counts_v2_assigned_to_fk_idx
  on private.inventory_audit_counts_v2(assigned_to);
create index if not exists inventory_audit_counts_v2_product_id_fk_idx
  on private.inventory_audit_counts_v2(product_id);
create index if not exists inventory_audit_counts_v2_session_id_fk_idx
  on private.inventory_audit_counts_v2(session_id);

create index if not exists inventory_audit_recounts_v2_assigned_to_fk_idx
  on private.inventory_audit_recounts_v2(assigned_to);
create index if not exists inventory_audit_recounts_v2_inventory_branch_id_fk_idx
  on private.inventory_audit_recounts_v2(inventory_branch_id);
create index if not exists inventory_audit_recounts_v2_product_id_fk_idx
  on private.inventory_audit_recounts_v2(product_id);

create index if not exists inventory_audit_sessions_v2_inventory_branch_id_fk_idx
  on private.inventory_audit_sessions_v2(inventory_branch_id);
create index if not exists inventory_movements_v2_product_id_fk_idx
  on private.inventory_movements_v2(product_id);
