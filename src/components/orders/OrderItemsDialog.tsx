
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrderItemsDialogProps {
  items: any[];
  open: boolean;
  onClose: () => void;
}

export function OrderItemsDialog({ items, open, onClose }: OrderItemsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md dir-rtl">
        <div className="py-4">
          <h3 className="text-lg font-medium mb-4">تفاصيل المنتجات</h3>
          <ScrollArea className="h-[300px]">
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-3 border-b pb-3">
                  {item.image_url && (
                    <div className="w-16 h-16 rounded-md overflow-hidden">
                      <img 
                        src={item.image_url} 
                        alt={item.product_name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium">{item.product_name}</h4>
                    <p className="text-sm text-muted-foreground">
                      باركود: {item.barcode || 'N/A'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} × {item.price} ج.م
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{item.total || (item.price * item.quantity)} ج.م</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
