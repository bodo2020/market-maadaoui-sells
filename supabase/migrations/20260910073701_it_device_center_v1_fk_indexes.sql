create index if not exists idx_it_peripherals_created_by on private.it_peripherals_v1(created_by);
create index if not exists idx_it_peripherals_updated_by on private.it_peripherals_v1(updated_by);
create index if not exists idx_it_session_blocks_blocked_by on private.it_session_blocks_v1(blocked_by);
create index if not exists idx_it_session_blocks_user on private.it_session_blocks_v1(user_id);
