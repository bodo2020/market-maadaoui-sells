-- Add expiry date tracking and shelf location to products table
ALTER TABLE public.products 
ADD COLUMN expiry_date DATE,
ADD COLUMN shelf_location TEXT,
ADD COLUMN track_expiry BOOLEAN DEFAULT false;

-- Create product_batches table for tracking multiple batches with different expiry dates
CREATE TABLE public.product_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  expiry_date DATE NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  shelf_location TEXT,
  purchase_date DATE DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES public.suppliers(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on product_batches
ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;

-- Create policies for product_batches
CREATE POLICY "Allow all users to view product batches"
ON public.product_batches FOR SELECT
USING (true);

CREATE POLICY "Allow all users to manage product batches"
ON public.product_batches FOR ALL
USING (true)
WITH CHECK (true);

-- Add trigger for updating updated_at on product_batches
CREATE TRIGGER update_product_batches_updated_at
BEFORE UPDATE ON public.product_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_product_batches_product_id ON public.product_batches(product_id);
CREATE INDEX idx_product_batches_expiry_date ON public.product_batches(expiry_date);
CREATE INDEX idx_products_shelf_location ON public.products(shelf_location);
CREATE INDEX idx_products_expiry_date ON public.products(expiry_date);