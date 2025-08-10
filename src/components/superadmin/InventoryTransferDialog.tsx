import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBranchStore } from "@/stores/branchStore";
import { fetchBranches } from "@/services/supabase/branchService";
import { fetchProducts } from "@/services/supabase/productService";
import { createTransfer } from "@/services/supabase/transferService";
import { toast } from "@/components/ui/sonner";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }
interface TransferItem { product_id: string; product_name?: string; quantity: number; }

export default function InventoryTransferDialog({ open, onOpenChange }: Props) {
  const { branches, setBranches } = useBranchStore();
  const [fromBranch, setFromBranch] = useState<string | undefined>();
  const [toBranch, setToBranch] = useState<string | undefined>();
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!branches.length) setBranches(await fetchBranches());
    const prods = await fetchProducts();
    setProducts(prods.map((p: any) => ({ id: p.id, name: p.name })));
  };

  useEffect(() => { if (open) load(); }, [open]);

  const addRow = () => setItems((prev) => [...prev, { product_id: '', quantity: 1 }]);
  const updateRow = (idx: number, patch: Partial<TransferItem>) => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeRow = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!fromBranch || !toBranch) { toast.error('اختر الفرعين'); return; }
    if (fromBranch === toBranch) { toast.error('لا يمكن التحويل لنفس الفرع'); return; }
    const validItems = items.filter((it) => it.product_id && it.quantity > 0);
    if (!validItems.length) { toast.error('أضف منتجات'); return; }
    setLoading(true);
    try {
      await createTransfer({ from_branch_id: fromBranch, to_branch_id: toBranch, items: validItems });
      toast.success('تم إنشاء التحويل وتطبيقه');
      setItems([]);
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('حدث خطأ أثناء التحويل');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0">
        <DialogHeader className="px-6 pt-6"><DialogTitle>تحويل مخزون بين الفروع</DialogTitle></DialogHeader>
        <div className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-sm mb-1">من فرع</p>
              <Select value={fromBranch} onValueChange={setFromBranch}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-sm mb-1">إلى فرع</p>
              <Select value={toBranch} onValueChange={setToBranch}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {branches.map((b) => (<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">المنتجات</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                    <div className="md:col-span-8">
                      <Select value={it.product_id} onValueChange={(v) => updateRow(idx, { product_id: v })}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="اختر المنتج" /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {products.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-3">
                      <Input type="number" min={1} value={it.quantity}
                        onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })} />
                    </div>
                    <div className="md:col-span-1">
                      <Button variant="destructive" onClick={() => removeRow(idx)}>حذف</Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={addRow}>إضافة منتج</Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={loading}>تنفيذ التحويل</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
