-- Add branch_id to salaries table
ALTER TABLE public.salaries 
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_salaries_branch_id ON public.salaries(branch_id);

-- Update existing salaries to link to main branch (MMG1)
UPDATE public.salaries 
SET branch_id = (
  SELECT id FROM public.branches 
  WHERE code = 'MMG1' 
  LIMIT 1
)
WHERE branch_id IS NULL;

-- Update RLS policies for salaries table
DROP POLICY IF EXISTS "Allow all users to delete salaries" ON public.salaries;
DROP POLICY IF EXISTS "Allow all users to insert salaries" ON public.salaries;
DROP POLICY IF EXISTS "Allow all users to select salaries" ON public.salaries;
DROP POLICY IF EXISTS "Allow all users to update salaries" ON public.salaries;

-- Create new branch-aware RLS policies
CREATE POLICY "Users can view salaries for their branch"
ON public.salaries
FOR SELECT
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);

CREATE POLICY "Admins can manage salaries for their branch"
ON public.salaries
FOR ALL
USING (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
)
WITH CHECK (
  is_super_admin() OR 
  is_admin() OR 
  has_branch_access(auth.uid(), branch_id)
);