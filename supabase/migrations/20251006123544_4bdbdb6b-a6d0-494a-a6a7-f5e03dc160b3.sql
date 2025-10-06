-- Fix the specific null branch_id transaction from today at 12:30:31
-- Update it to the main branch
UPDATE cash_transactions
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL
  AND transaction_date >= '2025-10-06 12:30:00'
  AND transaction_date <= '2025-10-06 12:31:00';

UPDATE cash_tracking
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL
  AND date = '2025-10-06'
  AND created_at >= '2025-10-06 12:30:00'
  AND created_at <= '2025-10-06 12:31:00';