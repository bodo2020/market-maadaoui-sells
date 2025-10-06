-- Update existing cash transactions and tracking records with null branch_id
-- Set them to the main branch
UPDATE cash_transactions
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL
  AND DATE(transaction_date) = CURRENT_DATE;

UPDATE cash_tracking
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL
  AND date = CURRENT_DATE;