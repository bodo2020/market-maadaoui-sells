
import { OrderItem } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Box, Scale, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrderItemsListProps {
  items: OrderItem[];
  orderId?: string;
  onItemDeleted?: () => void;
  readOnly?: boolean;
}

export function OrderItemsList({ 
  items, 
  orderId,
  onItemDeleted,
  readOnly = false 
}: OrderItemsListProps) {
  const handleDeleteItem = async (deletedItem: OrderItem) => {
    if (!orderId) return;

    try {
      // First get the current order
      const { data: order, error: fetchError } = await supabase
        .from('online_orders')
        .select('items, total')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      // Ensure items is an array
      let orderItems = order.items;
      if (typeof orderItems === 'string') {
        orderItems = JSON.parse(orderItems);
      }

      // Filter out the deleted item and calculate new total
      const updatedItems = Array.isArray(orderItems) ? 
        orderItems.filter((item: OrderItem) => 
          !(item.product_id === deletedItem.product_id && 
            item.price === deletedItem.price && 
            item.quantity === deletedItem.quantity)
        ) : [];

      // Calculate new total by subtracting the deleted item's total
      const newTotal = order.total - deletedItem.total;

      // Update the order with new items and total
      const { error: updateError } = await supabase
        .from('online_orders')
        .update({ 
          items: updatedItems,
          total: newTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      toast.success("تم حذف المنتج من الطلب");
      if (onItemDeleted) onItemDeleted();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error("حدث خطأ أثناء حذف المنتج");
    }
  };

  return (
    <ScrollArea className="h-[350px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">المنتج</TableHead>
            <TableHead className="text-center">الباركود</TableHead>
            <TableHead className="text-center">النوع</TableHead>
            <TableHead className="text-center">الكمية</TableHead>
            <TableHead className="text-center">السعر</TableHead>
            <TableHead className="text-center">المجموع</TableHead>
            {!readOnly && <TableHead className="text-center">إجراءات</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-3">
                  {item.image_url && (
                    <div className="w-10 h-10 rounded-md overflow-hidden">
                      <img 
                        src={item.image_url} 
                        alt={item.product_name} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <span>{item.product_name}</span>
                </div>
              </TableCell>
              <TableCell className="text-center">{item.barcode || 'N/A'}</TableCell>
              <TableCell className="text-center">
                <div className="flex justify-center gap-2">
                  {item.is_bulk && (
                    <span className="bg-amber-100 text-amber-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                      <Box className="h-3 w-3 ml-1" />
                      جملة
                    </span>
                  )}
                  {item.is_weight_based && (
                    <span className="bg-blue-100 text-blue-800 text-xs rounded px-1.5 py-0.5 flex items-center">
                      <Scale className="h-3 w-3 ml-1" />
                      وزن
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                {item.quantity}
                {item.is_bulk && item.bulk_quantity && ` × ${item.bulk_quantity}`}
              </TableCell>
              <TableCell className="text-center">{item.price} ج.م</TableCell>
              <TableCell className="text-center">{item.total || (item.price * item.quantity)} ج.م</TableCell>
              {!readOnly && (
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteItem(item)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
