-- Add branch_id to inventory_sessions table
ALTER TABLE public.inventory_sessions 
ADD COLUMN branch_id UUID REFERENCES public.branches(id);

-- Update existing sessions to use the first active branch (migration data)
UPDATE public.inventory_sessions 
SET branch_id = (
  SELECT id FROM public.branches 
  WHERE active = true 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE branch_id IS NULL;

-- Make branch_id NOT NULL after migrating existing data
ALTER TABLE public.inventory_sessions 
ALTER COLUMN branch_id SET NOT NULL;

-- Create index for better performance
CREATE INDEX idx_inventory_sessions_branch ON public.inventory_sessions(branch_id);

-- Update unique constraint to include branch_id
ALTER TABLE public.inventory_sessions 
DROP CONSTRAINT IF EXISTS inventory_sessions_session_date_key;

ALTER TABLE public.inventory_sessions 
ADD CONSTRAINT inventory_sessions_session_date_branch_key 
UNIQUE (session_date, branch_id);