-- Create cash_transfers table to track transfers between registers
CREATE TABLE IF NOT EXISTS public.cash_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  from_register TEXT NOT NULL CHECK (from_register IN ('store', 'online')),
  to_register TEXT NOT NULL CHECK (to_register IN ('store', 'online')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  branch_id UUID,
  from_transaction_id UUID,
  to_transaction_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add constraint to prevent transferring to the same register
ALTER TABLE public.cash_transfers 
ADD CONSTRAINT check_different_registers 
CHECK (from_register != to_register);

-- Enable RLS
ALTER TABLE public.cash_transfers ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage cash transfers"
ON public.cash_transfers
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'admin')
  )
);

CREATE POLICY "Branch users can view transfers"
ON public.cash_transfers
FOR SELECT
USING (
  branch_id IS NULL 
  OR EXISTS (
    SELECT 1 FROM public.user_branch_roles 
    WHERE user_id = auth.uid() 
    AND branch_id = cash_transfers.branch_id
  )
  OR EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND role IN ('super_admin', 'admin')
  )
);

-- Create index for better performance
CREATE INDEX idx_cash_transfers_date ON public.cash_transfers(transfer_date DESC);
CREATE INDEX idx_cash_transfers_registers ON public.cash_transfers(from_register, to_register);

-- Add trigger to update updated_at
CREATE TRIGGER update_cash_transfers_updated_at
BEFORE UPDATE ON public.cash_transfers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();