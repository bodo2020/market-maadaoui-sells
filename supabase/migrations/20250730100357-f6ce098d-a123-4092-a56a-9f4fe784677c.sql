-- إنشاء جدول نقل المخزون بين الفروع
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_branch_id UUID NOT NULL,
  to_branch_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  requested_by UUID REFERENCES public.users(id),
  confirmed_by UUID REFERENCES public.users(id),
  completed_by UUID REFERENCES public.users(id),
  request_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  confirmed_date TIMESTAMP WITH TIME ZONE,
  completed_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  FOREIGN KEY (from_branch_id) REFERENCES public.branches(id),
  FOREIGN KEY (to_branch_id) REFERENCES public.branches(id),
  FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT different_branches CHECK (from_branch_id != to_branch_id)
);

-- تفعيل RLS
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;

-- إنشاء سياسات الأمان
CREATE POLICY "Users can view transfers for their branch" 
ON public.inventory_transfers 
FOR SELECT 
USING (
  from_branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
  to_branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Users can create transfers from their branch" 
ON public.inventory_transfers 
FOR INSERT 
WITH CHECK (
  from_branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);

CREATE POLICY "Users can update transfers for their branch" 
ON public.inventory_transfers 
FOR UPDATE 
USING (
  from_branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
  to_branch_id IN (SELECT branch_id FROM users WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);

-- إنشاء وظيفة لمعالجة النقل
CREATE OR REPLACE FUNCTION public.process_inventory_transfer(
  transfer_id UUID,
  action TEXT -- 'confirm', 'complete', 'cancel'
)
RETURNS BOOLEAN AS $$
DECLARE
  transfer_record inventory_transfers%ROWTYPE;
  current_quantity INTEGER;
BEGIN
  -- جلب تفاصيل النقل
  SELECT * INTO transfer_record FROM inventory_transfers WHERE id = transfer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  
  -- معالجة حسب النوع
  CASE action
    WHEN 'confirm' THEN
      IF transfer_record.status != 'pending' THEN
        RAISE EXCEPTION 'Transfer is not in pending status';
      END IF;
      
      -- تحقق من توفر الكمية في الفرع المرسل
      SELECT quantity INTO current_quantity 
      FROM branch_inventory 
      WHERE product_id = transfer_record.product_id AND branch_id = transfer_record.from_branch_id;
      
      IF current_quantity < transfer_record.quantity THEN
        RAISE EXCEPTION 'Insufficient quantity in source branch. Available: %, Required: %', current_quantity, transfer_record.quantity;
      END IF;
      
      -- تحديث حالة النقل
      UPDATE inventory_transfers 
      SET status = 'confirmed', 
          confirmed_by = auth.uid(), 
          confirmed_date = now(),
          updated_at = now()
      WHERE id = transfer_id;
      
    WHEN 'complete' THEN
      IF transfer_record.status != 'confirmed' THEN
        RAISE EXCEPTION 'Transfer must be confirmed before completion';
      END IF;
      
      -- تحقق مرة أخرى من توفر الكمية
      SELECT quantity INTO current_quantity 
      FROM branch_inventory 
      WHERE product_id = transfer_record.product_id AND branch_id = transfer_record.from_branch_id;
      
      IF current_quantity < transfer_record.quantity THEN
        RAISE EXCEPTION 'Insufficient quantity in source branch. Available: %, Required: %', current_quantity, transfer_record.quantity;
      END IF;
      
      -- تحديث المخزون - خصم من الفرع المرسل
      UPDATE branch_inventory 
      SET quantity = quantity - transfer_record.quantity,
          updated_at = now()
      WHERE product_id = transfer_record.product_id AND branch_id = transfer_record.from_branch_id;
      
      -- تحديث المخزون - إضافة للفرع المستقبل
      UPDATE branch_inventory 
      SET quantity = quantity + transfer_record.quantity,
          updated_at = now()
      WHERE product_id = transfer_record.product_id AND branch_id = transfer_record.to_branch_id;
      
      -- تحديث حالة النقل
      UPDATE inventory_transfers 
      SET status = 'completed', 
          completed_by = auth.uid(), 
          completed_date = now(),
          updated_at = now()
      WHERE id = transfer_id;
      
    WHEN 'cancel' THEN
      IF transfer_record.status IN ('completed') THEN
        RAISE EXCEPTION 'Cannot cancel completed transfer';
      END IF;
      
      UPDATE inventory_transfers 
      SET status = 'cancelled',
          updated_at = now()
      WHERE id = transfer_id;
      
    ELSE
      RAISE EXCEPTION 'Invalid action. Use: confirm, complete, or cancel';
  END CASE;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- إنشاء trigger لتحديث updated_at
CREATE OR REPLACE FUNCTION update_inventory_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_inventory_transfers_updated_at
  BEFORE UPDATE ON inventory_transfers
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_transfers_updated_at();

-- إنشاء فهارس لتحسين الأداء
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from_branch ON inventory_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to_branch ON inventory_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_product ON inventory_transfers(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_date ON inventory_transfers(request_date);

-- تحديث جدول المبيعات لإضافة branch_id إذا لم يكن موجود
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- تحديث جدول الطلبات الإلكترونية لإضافة branch_id إذا لم يكن موجود  
ALTER TABLE public.online_orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);