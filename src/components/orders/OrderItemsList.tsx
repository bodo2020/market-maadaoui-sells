
import { useState } from "react";
import { OrderItem } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Box, Scale, Trash2, Check, Barcode, Edit, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProductConfirmationDialog } from "./ProductConfirmationDialog";
import { AddBarcodeDialog } from "./AddBarcodeDialog";
import { EditProductInOrderDialog } from "./EditProductInOrderDialog";

interface OrderItemsListProps {
  items: OrderItem[];
  orderId?: string;
  onItemDeleted?: () => void;
  onItemUpdated?: () => void;
  readOnly?: boolean;
}

export function OrderItemsList({ 
  items, 
  orderId,
  onItemDeleted,
  onItemUpdated,
  readOnly = false 
}: OrderItemsListProps) {
  const [confirmedProducts, setConfirmedProducts] = useState<Set<string>>(new Set());
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [barcodeDialogOpen, setBarcodeDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<OrderItem | null>(null);
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
      let orderItems: OrderItem[] = [];
      
      if (order.items) {
        try {
          if (typeof order.items === 'string') {
            orderItems = JSON.parse(order.items) as OrderItem[];
          } else if (Array.isArray(order.items)) {
            orderItems = (order.items as unknown) as OrderItem[];
          } else {
            console.error('Unexpected items format:', order.items);
            throw new Error('Invalid items format');
          }
        } catch (parseError) {
          console.error('Error parsing items:', parseError);
          throw new Error('Failed to parse order items');
        }
      }

      // Filter out the deleted item and calculate new total
      const updatedItems = orderItems.filter((item: OrderItem) => 
        !(item.product_id === deletedItem.product_id && 
          item.price === deletedItem.price && 
          item.quantity === deletedItem.quantity)
      );

      // Calculate new total by subtracting the deleted item's total
      const newTotal = order.total - deletedItem.total;

      // Update the order with new items and total
      const { error: updateError } = await supabase
        .from('online_orders')
        .update({ 
          items: updatedItems as any,
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

  const handleConfirmProduct = (productId: string) => {
    setConfirmedProducts(prev => new Set([...prev, productId]));
  };

  const handleOpenConfirmDialog = (product: OrderItem) => {
    setSelectedProduct(product);
    setConfirmDialogOpen(true);
  };

  const handleOpenBarcodeDialog = (product: OrderItem) => {
    setSelectedProduct(product);
    setBarcodeDialogOpen(true);
  };

  const handleOpenEditDialog = (product: OrderItem) => {
    setSelectedProduct(product);
    setEditDialogOpen(true);
  };

  const handleProductUpdated = async (productId: string, updates: Partial<OrderItem>) => {
    if (!orderId) return;

    try {
      // Get current order
      const { data: order, error: fetchError } = await supabase
        .from('online_orders')
        .select('items, total')
        .eq('id', orderId)
        .single();

      if (fetchError) throw fetchError;

      // Parse items
      let orderItems: OrderItem[] = [];
      if (order.items) {
        if (typeof order.items === 'string') {
          orderItems = JSON.parse(order.items) as OrderItem[];
        } else if (Array.isArray(order.items)) {
          orderItems = (order.items as unknown) as OrderItem[];
        }
      }

      // Update the specific item
      const updatedItems = orderItems.map(item => 
        item.product_id === productId ? { ...item, ...updates } : item
      );

      // Recalculate total
      const newTotal = updatedItems.reduce((sum, item) => sum + (item.total || (item.price * item.quantity)), 0);

      // Update the order
      const { error: updateError } = await supabase
        .from('online_orders')
        .update({ 
          items: updatedItems as any,
          total: newTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      if (onItemUpdated) onItemUpdated();
    } catch (error) {
      console.error('Error updating product in order:', error);
      toast.error("حدث خطأ أثناء تحديث المنتج");
    }
  };

  return (
    <>
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
              <TableHead className="text-center">الحالة</TableHead>
              {!readOnly && <TableHead className="text-center">إجراءات</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const isConfirmed = confirmedProducts.has(item.product_id);
              return (
                <TableRow key={index} className={isConfirmed ? "bg-green-50" : ""}>
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
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span>{item.barcode || 'غير محدد'}</span>
                      {!readOnly && !item.barcode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenBarcodeDialog(item)}
                          className="h-6 px-2 text-blue-600 hover:text-blue-700"
                        >
                          <Barcode className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
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
                    {item.is_weight_based && <span className="text-xs text-muted-foreground"> كجم</span>}
                  </TableCell>
                  <TableCell className="text-center">{item.price} ج.م</TableCell>
                  <TableCell className="text-center">{item.total || (item.price * item.quantity)} ج.م</TableCell>
                  <TableCell className="text-center">
                    {isConfirmed ? (
                      <div className="flex items-center justify-center gap-1 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        <span className="text-xs">مؤكد</span>
                      </div>
                    ) : (
                      !readOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenConfirmDialog(item)}
                          className="h-6 px-2 text-green-600 hover:text-green-700"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )
                    )}
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEditDialog(item)}
                          className="h-6 px-2 text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteItem(item)}
                          className="h-6 px-2 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Dialogs */}
      <ProductConfirmationDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        product={selectedProduct}
        onConfirm={handleConfirmProduct}
      />

      <AddBarcodeDialog
        open={barcodeDialogOpen}
        onOpenChange={setBarcodeDialogOpen}
        product={selectedProduct}
        onBarcodeAdded={() => {
          if (onItemUpdated) onItemUpdated();
        }}
      />

      <EditProductInOrderDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        product={selectedProduct}
        onProductUpdated={handleProductUpdated}
      />
    </>
  );
}
