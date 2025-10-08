-- Add columns to branches table
ALTER TABLE public.branches 
  ADD COLUMN IF NOT EXISTS independent_pricing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS independent_inventory BOOLEAN DEFAULT false;