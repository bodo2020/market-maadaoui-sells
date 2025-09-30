-- Add indexes to improve invoice loading performance

-- Index for sales table to speed up date-based queries
CREATE INDEX IF NOT EXISTS idx_sales_date_desc ON public.sales (date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON public.sales (invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON public.sales (customer_name);

-- Index for purchases table to speed up date-based queries  
CREATE INDEX IF NOT EXISTS idx_purchases_date_desc ON public.purchases (date DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_invoice_number ON public.purchases (invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id ON public.purchases (supplier_id);

-- Index for purchase_items to speed up join queries
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON public.purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id ON public.purchase_items (product_id);