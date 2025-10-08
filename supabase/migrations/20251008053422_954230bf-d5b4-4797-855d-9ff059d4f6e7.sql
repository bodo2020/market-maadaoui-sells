-- Create branch_product_pricing table
CREATE TABLE IF NOT EXISTS public.branch_product_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  sale_price NUMERIC NOT NULL,
  purchase_price NUMERIC NOT NULL,
  offer_price NUMERIC,
  is_offer BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, branch_id)
);

-- Enable RLS
ALTER TABLE public.branch_product_pricing ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branch_product_pricing_product ON public.branch_product_pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_branch_product_pricing_branch ON public.branch_product_pricing(branch_id);