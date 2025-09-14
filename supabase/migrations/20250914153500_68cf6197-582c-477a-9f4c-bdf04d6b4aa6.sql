-- Update register_type constraints to allow 'merged' value

-- Check current constraints and update them
DO $$
BEGIN
    -- Drop the existing check constraint if it exists
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'cash_transactions_register_type_check'
        AND table_name = 'cash_transactions'
    ) THEN
        ALTER TABLE public.cash_transactions DROP CONSTRAINT cash_transactions_register_type_check;
    END IF;
    
    -- Drop the existing check constraint if it exists for cash_tracking
    IF EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'cash_tracking_register_type_check'
        AND table_name = 'cash_tracking'
    ) THEN
        ALTER TABLE public.cash_tracking DROP CONSTRAINT cash_tracking_register_type_check;
    END IF;
END
$$;

-- Add new constraints that include 'merged'
ALTER TABLE public.cash_transactions 
ADD CONSTRAINT cash_transactions_register_type_check 
CHECK (register_type IN ('store', 'online', 'merged'));

ALTER TABLE public.cash_tracking 
ADD CONSTRAINT cash_tracking_register_type_check 
CHECK (register_type IN ('store', 'online', 'merged'));