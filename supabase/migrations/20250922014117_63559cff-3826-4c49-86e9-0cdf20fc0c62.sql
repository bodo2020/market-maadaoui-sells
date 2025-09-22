-- Add position column to main_categories table
ALTER TABLE public.main_categories 
ADD COLUMN position INTEGER DEFAULT 0;

-- Add position column to subcategories table  
ALTER TABLE public.subcategories 
ADD COLUMN position INTEGER DEFAULT 0;

-- Update existing main_categories with incremental positions
UPDATE public.main_categories 
SET position = row_number() OVER (ORDER BY created_at) - 1;

-- Update existing subcategories with incremental positions per category
UPDATE public.subcategories 
SET position = row_number() OVER (PARTITION BY category_id ORDER BY created_at) - 1;

-- Add indexes for better performance
CREATE INDEX idx_main_categories_position ON public.main_categories(position);
CREATE INDEX idx_subcategories_position ON public.subcategories(category_id, position);