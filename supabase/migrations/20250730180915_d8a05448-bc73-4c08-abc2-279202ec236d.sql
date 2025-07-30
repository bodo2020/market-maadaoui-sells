-- خطوة 1: إزالة جميع الـ policies التي تعتمد على branch_id أولاً

-- إزالة policies من جدول purchase_items
DROP POLICY IF EXISTS "Users can view purchase items in their branch" ON public.purchase_items;
DROP POLICY IF EXISTS "Users can manage purchase items" ON public.purchase_items;

-- إزالة policies من جدول purchases
DROP POLICY IF EXISTS "Users can view purchases in their branch" ON public.purchases;
DROP POLICY IF EXISTS "Users can manage purchases in their branch" ON public.purchases;

-- إزالة policies من جدول governorates
DROP POLICY IF EXISTS "Users can view governorates for their branch" ON public.governorates;

-- إزالة policies من جدول inventory_transfers
DROP POLICY IF EXISTS "Users can view transfers for their branch" ON public.inventory_transfers;
DROP POLICY IF EXISTS "Users can create transfers from their branch" ON public.inventory_transfers;
DROP POLICY IF EXISTS "Users can update transfers for their branch" ON public.inventory_transfers;

-- إزالة policies من جدول branch_inventory
DROP POLICY IF EXISTS "Users can view inventory for their branch" ON public.branch_inventory;
DROP POLICY IF EXISTS "Users can manage inventory for their branch" ON public.branch_inventory;

-- إزالة جدول register_transfers إذا كان موجود
DROP TABLE IF EXISTS public.register_transfers CASCADE;