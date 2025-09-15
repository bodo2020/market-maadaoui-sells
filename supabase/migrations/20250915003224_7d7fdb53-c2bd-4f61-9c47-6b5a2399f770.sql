-- Create table for damage tracking
CREATE TABLE IF NOT EXISTS public.damaged_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL,
  batch_number TEXT NOT NULL,
  damaged_quantity INTEGER NOT NULL,
  damage_cost NUMERIC NOT NULL,
  damage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.damaged_products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations on damaged_products" 
ON public.damaged_products 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create function to update updated_at
CREATE OR REPLACE FUNCTION public.update_damaged_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_damaged_products_updated_at
BEFORE UPDATE ON public.damaged_products
FOR EACH ROW
EXECUTE FUNCTION public.update_damaged_products_updated_at();