-- Add 'cancelled' status to the order_status enum
ALTER TYPE order_status ADD VALUE 'cancelled';

-- Update the default value to include cancelled option
ALTER TABLE online_orders ALTER COLUMN status SET DEFAULT 'waiting';