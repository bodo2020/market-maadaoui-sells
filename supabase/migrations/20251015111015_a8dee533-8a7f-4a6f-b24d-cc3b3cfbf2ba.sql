-- Add branch_id column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_companies_branch_id ON public.companies(branch_id);

COMMENT ON COLUMN public.companies.branch_id IS 'الفرع المالك للشركة (null للفروع الداخلية المشتركة، uuid للفروع الخارجية)';