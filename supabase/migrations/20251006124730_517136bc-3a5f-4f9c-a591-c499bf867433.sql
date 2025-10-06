-- Update all cash_transactions with null branch_id to main branch
UPDATE cash_transactions
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Update all cash_tracking records with null branch_id to main branch
UPDATE cash_tracking
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;