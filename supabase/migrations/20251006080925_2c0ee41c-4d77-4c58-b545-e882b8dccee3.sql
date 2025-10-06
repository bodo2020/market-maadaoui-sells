-- Migration: Improve Multi-Branch System
-- Phase 1: Data Cleanup and Assignment to MMG1 Branch

-- Step 1: Assign branch_id to old cash_tracking records
UPDATE cash_tracking 
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Step 2: Assign branch_id to old cash_transactions records
UPDATE cash_transactions 
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Step 3: Assign branch_id to old sales records
UPDATE sales 
SET branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
WHERE branch_id IS NULL;

-- Step 4: Migrate product quantities to inventory for MMG1 branch
-- Update existing inventory records with product quantities
UPDATE inventory i
SET quantity = p.quantity
FROM products p
WHERE i.product_id = p.id 
  AND i.branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
  AND p.quantity > 0;

-- Step 5: Create inventory records for products that don't have one for MMG1
INSERT INTO inventory (product_id, quantity, branch_id)
SELECT p.id, p.quantity, '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
FROM products p
WHERE p.quantity > 0
  AND NOT EXISTS (
    SELECT 1 FROM inventory i 
    WHERE i.product_id = p.id 
      AND i.branch_id = '7b1b9f30-fe0f-44a9-9179-2a2cc49dc92a'
  );

-- Step 6: Create a function to get branch-specific invoice number
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_code TEXT;
  v_date_prefix TEXT;
  v_count INTEGER;
  v_invoice_number TEXT;
BEGIN
  -- Get branch code
  SELECT code INTO v_branch_code FROM branches WHERE id = p_branch_id;
  
  -- Generate date prefix (YYMMDD)
  v_date_prefix := TO_CHAR(CURRENT_DATE, 'YYMMDD');
  
  -- Count invoices for this branch today
  SELECT COUNT(*) INTO v_count
  FROM sales
  WHERE branch_id = p_branch_id
    AND DATE(created_at) = CURRENT_DATE;
  
  -- Generate invoice number
  v_invoice_number := v_branch_code || '-' || v_date_prefix || '-' || LPAD((v_count + 1)::TEXT, 4, '0');
  
  RETURN v_invoice_number;
END;
$$;

-- Step 7: Add comment to products.quantity to mark it as deprecated
COMMENT ON COLUMN products.quantity IS 'DEPRECATED: Use inventory table with branch_id instead';