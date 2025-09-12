-- First, drop the default value for status column
ALTER TABLE online_orders ALTER COLUMN status DROP DEFAULT;

-- Update order status enum to include new statuses
ALTER TYPE order_status RENAME TO order_status_old;

CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled');

-- Update the online_orders table to use the new enum
ALTER TABLE online_orders ALTER COLUMN status TYPE order_status USING 
  CASE 
    WHEN status::text = 'waiting' THEN 'pending'::order_status
    WHEN status::text = 'ready' THEN 'ready'::order_status  
    WHEN status::text = 'shipped' THEN 'shipped'::order_status
    WHEN status::text = 'done' THEN 'delivered'::order_status
    ELSE 'pending'::order_status
  END;

-- Set new default value
ALTER TABLE online_orders ALTER COLUMN status SET DEFAULT 'pending'::order_status;

-- Drop old enum
DROP TYPE order_status_old;

-- Create order status history table for tracking status changes
CREATE TABLE public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.online_orders(id) ON DELETE CASCADE,
  old_status order_status,
  new_status order_status NOT NULL,
  changed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on order_status_history
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Create policies for order_status_history
CREATE POLICY "Allow admins to manage order status history" 
ON public.order_status_history 
FOR ALL 
USING (is_admin() OR is_super_admin());

CREATE POLICY "Allow all users to view order status history" 
ON public.order_status_history 
FOR SELECT 
USING (true);

-- Create function to automatically log status changes
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_status_history (order_id, old_status, new_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for automatic status logging
CREATE TRIGGER log_order_status_change_trigger
  AFTER UPDATE ON public.online_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_change();