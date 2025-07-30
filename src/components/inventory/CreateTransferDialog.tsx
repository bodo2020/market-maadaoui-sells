import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createInventoryTransfer } from '@/services/supabase/inventoryTransferService';
import { fetchBranchInventory } from '@/services/supabase/branchInventoryService';
import { toast } from 'sonner';

interface Branch {
  id: string;
  name: string;
}

interface CreateTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: Branch[];
  onSuccess: () => void;
}

export function CreateTransferDialog({
  open,
  onOpenChange,
  branches,
  onSuccess,
}: CreateTransferDialogProps) {
  const [formData, setFormData] = useState({
    from_branch_id: '',
    to_branch_id: '',
    product_id: '',
    quantity: 1,
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: inventory = [] } = useQuery({
    queryKey: ['branch-inventory', formData.from_branch_id],
    queryFn: () => fetchBranchInventory(formData.from_branch_id),
    enabled: !!formData.from_branch_id,
  });

  const selectedProduct = inventory.find(item => item.product_id === formData.product_id);
  const maxQuantity = selectedProduct?.quantity || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.from_branch_id || !formData.to_branch_id || !formData.product_id) {
      toast.error('يرجى تعبئة جميع الحقول المطلوبة');
      return;
    }

    if (formData.from_branch_id === formData.to_branch_id) {
      toast.error('لا يمكن النقل من نفس الفرع إلى نفس الفرع');
      return;
    }

    if (formData.quantity > maxQuantity) {
      toast.error(`الكمية المتاحة في المخزون: ${maxQuantity}`);
      return;
    }

    setIsSubmitting(true);
    try {
      await createInventoryTransfer(formData);
      toast.success('تم إنشاء طلب النقل بنجاح');
      onSuccess();
      setFormData({
        from_branch_id: '',
        to_branch_id: '',
        product_id: '',
        quantity: 1,
        notes: '',
      });
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ أثناء إنشاء طلب النقل');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>طلب نقل مخزون جديد</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="from_branch">الفرع المرسل</Label>
            <Select
              value={formData.from_branch_id}
              onValueChange={(value) => setFormData(prev => ({ 
                ...prev, 
                from_branch_id: value,
                product_id: '' // Reset product when branch changes
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الفرع المرسل" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to_branch">الفرع المستقبل</Label>
            <Select
              value={formData.to_branch_id}
              onValueChange={(value) => setFormData(prev => ({ ...prev, to_branch_id: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر الفرع المستقبل" />
              </SelectTrigger>
              <SelectContent>
                {branches
                  .filter(branch => branch.id !== formData.from_branch_id)
                  .map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {formData.from_branch_id && (
            <div className="space-y-2">
              <Label htmlFor="product">المنتج</Label>
              <Select
                value={formData.product_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, product_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المنتج" />
                </SelectTrigger>
                <SelectContent>
                  {inventory.map((item) => (
                    <SelectItem key={item.product_id} value={item.product_id}>
                      {item.products?.name} - متاح: {item.quantity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedProduct && (
            <div className="space-y-2">
              <Label htmlFor="quantity">الكمية</Label>
              <Input
                id="quantity"
                type="number"
                min="1"
                max={maxQuantity}
                value={formData.quantity}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  quantity: Math.min(parseInt(e.target.value) || 1, maxQuantity)
                }))}
              />
              <p className="text-sm text-muted-foreground">
                الكمية المتاحة: {maxQuantity}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="أدخل أي ملاحظات إضافية..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.from_branch_id || !formData.to_branch_id || !formData.product_id}
            >
              {isSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}