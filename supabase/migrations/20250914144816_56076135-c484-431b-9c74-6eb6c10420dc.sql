-- Add new columns to purchase_items table for batch tracking
ALTER TABLE public.purchase_items 
ADD COLUMN batch_number TEXT,
ADD COLUMN expiry_date DATE,
ADD COLUMN shelf_location TEXT,
ADD COLUMN notes TEXT;

-- Add purchase_item_id to product_batches to link batches with purchase items
ALTER TABLE public.product_batches 
ADD COLUMN purchase_item_id UUID REFERENCES public.purchase_items(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_purchase_items_batch ON public.purchase_items(batch_number);
CREATE INDEX idx_product_batches_purchase_item ON public.product_batches(purchase_item_id);

-- Add trigger to automatically create product batch when purchase item has expiry date
CREATE OR REPLACE FUNCTION public.create_product_batch_from_purchase()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_create_product_batch_from_purchase ON public.purchase_items;
CREATE TRIGGER trigger_create_product_batch_from_purchase
  AFTER INSERT ON public.purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_product_batch_from_purchase();