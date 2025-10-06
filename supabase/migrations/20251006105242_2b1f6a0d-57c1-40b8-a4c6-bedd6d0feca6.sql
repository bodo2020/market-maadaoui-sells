-- Update old sales without branch_id to link them to the main branch
-- First, get the main branch ID (MMG1)
DO $$
DECLARE
  main_branch_id uuid;
BEGIN
  -- Get the main branch (MMG1)
  SELECT id INTO main_branch_id
  FROM branches
  WHERE code = 'MMG1'
  LIMIT 1;
  
  -- If main branch exists, update sales without branch_id
  IF main_branch_id IS NOT NULL THEN
    UPDATE sales
    SET branch_id = main_branch_id
    WHERE branch_id IS NULL;
  END IF;
END $$;