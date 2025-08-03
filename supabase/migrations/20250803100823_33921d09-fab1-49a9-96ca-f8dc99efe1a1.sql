-- Add verification status to customers table
ALTER TABLE public.customers 
ADD COLUMN verified BOOLEAN DEFAULT false NOT NULL;