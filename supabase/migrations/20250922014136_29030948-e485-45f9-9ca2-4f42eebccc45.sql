-- Add position column to main_categories table
ALTER TABLE public.main_categories 
ADD COLUMN position INTEGER DEFAULT 0;

-- Add position column to subcategories table  
ALTER TABLE public.subcategories 
ADD COLUMN position INTEGER DEFAULT 0;

-- Update existing main_categories with incremental positions using subquery
WITH position_update AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at) - 1) as new_position
  FROM public.main_categories
)
UPDATE public.main_categories 
SET position = position_update.new_position
FROM position_update 
WHERE main_categories.id = position_update.id;

-- Update existing subcategories with incremental positions per category using subquery
WITH position_update AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY category_id ORDER BY created_at) - 1) as new_position
  FROM public.subcategories
)
UPDATE public.subcategories 
SET position = position_update.new_position
FROM position_update 
WHERE subcategories.id = position_update.id;

-- Add indexes for better performance
CREATE INDEX idx_main_categories_position ON public.main_categories(position);
CREATE INDEX idx_subcategories_position ON public.subcategories(category_id, position);