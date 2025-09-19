-- Add sale_price column to purchase_items table
ALTER TABLE public.purchase_items 
ADD COLUMN sale_price NUMERIC DEFAULT NULL;

-- Add comment to the column
COMMENT ON COLUMN public.purchase_items.sale_price IS 'Sale price that will be updated for the product';