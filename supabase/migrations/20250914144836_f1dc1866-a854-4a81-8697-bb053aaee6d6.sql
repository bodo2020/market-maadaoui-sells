-- Fix the function search path security issue
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
      purchase_price,
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
      NEW.price,
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