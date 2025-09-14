-- Add purchase_price column to product_batches table
ALTER TABLE public.product_batches 
ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT 0;

-- Update the trigger function to not include purchase_price in insert
DROP TRIGGER IF EXISTS create_product_batch_from_purchase_trigger ON public.purchase_items;

CREATE OR REPLACE FUNCTION public.create_product_batch_from_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only create batch if expiry_date is provided
  IF NEW.expiry_date IS NOT NULL THEN
    INSERT INTO public.product_batches (
      product_id,
      batch_number,
      quantity,
      expiry_date,
      shelf_location,
      notes,
      purchase_item_id,
      created_at,
      updated_at
    ) VALUES (
      NEW.product_id,
      COALESCE(NEW.batch_number, 'BATCH-' || NEW.id::text),
      NEW.quantity,
      NEW.expiry_date,
      NEW.shelf_location,
      NEW.notes,
      NEW.id,
      now(),
      now()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER create_product_batch_from_purchase_trigger
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_product_batch_from_purchase();