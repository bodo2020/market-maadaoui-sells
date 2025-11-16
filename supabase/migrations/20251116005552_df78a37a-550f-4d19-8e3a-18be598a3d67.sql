-- Enable realtime for online_orders table
ALTER TABLE public.online_orders REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.online_orders;