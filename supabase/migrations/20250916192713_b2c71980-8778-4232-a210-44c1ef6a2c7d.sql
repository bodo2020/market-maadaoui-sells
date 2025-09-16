-- Add index on barcode column for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products (barcode);

-- Add composite index for faster scale product lookups
CREATE INDEX IF NOT EXISTS idx_products_barcode_type ON public.products (barcode_type, barcode);

-- Add index for bulk products
CREATE INDEX IF NOT EXISTS idx_products_bulk_barcode ON public.products (bulk_barcode) WHERE bulk_barcode IS NOT NULL;