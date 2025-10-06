-- Fix cash tracking system to work with branches
-- 1. Link all existing records without branch_id to the main branch (MMG1)

-- Update cash_tracking records
UPDATE cash_tracking
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Update cash_transactions records
UPDATE cash_transactions
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Update cash_transfers records
UPDATE cash_transfers
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- 2. Drop temporary/insecure RLS policies
DROP POLICY IF EXISTS "Temporary public view cash_tracking" ON cash_tracking;
DROP POLICY IF EXISTS "Allow all insert cash tracking" ON cash_tracking;
DROP POLICY IF EXISTS "Allow all update cash tracking" ON cash_tracking;
DROP POLICY IF EXISTS "Temporary public view cash_transactions" ON cash_transactions;

-- 3. Add secure RLS policies based on branch access

-- Cash tracking policies
CREATE POLICY "Branch users can insert cash_tracking"
ON cash_tracking
FOR INSERT
WITH CHECK (
  is_super_admin() OR is_admin() OR has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Branch users can update cash_tracking"
ON cash_tracking
FOR UPDATE
USING (
  is_super_admin() OR is_admin() OR has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  is_super_admin() OR is_admin() OR has_branch_access(auth.uid(), branch_id)
);

-- Cash transactions policies
CREATE POLICY "Branch users can insert cash_transactions"
ON cash_transactions
FOR INSERT
WITH CHECK (
  is_super_admin() OR is_admin() OR has_branch_access(auth.uid(), branch_id)
);