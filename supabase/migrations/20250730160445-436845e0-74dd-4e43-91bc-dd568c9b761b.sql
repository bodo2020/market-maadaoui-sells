-- Add new columns to return_items table for profit calculation
ALTER TABLE public.return_items 
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit_loss NUMERIC DEFAULT 0;

-- Update sales table to include cashier_name
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS cashier_name TEXT;