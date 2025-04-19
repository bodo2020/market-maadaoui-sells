
import { OrderItem } from "@/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface OrderItemsListProps {
  items: OrderItem[];
}

export function OrderItemsList({ items }: OrderItemsListProps) {
  return (
    <ScrollArea className="h-[350px] rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">المنتج</TableHead>
            <TableHead className="text-center">الكمية</TableHead>
            <TableHead className="text-center">السعر</TableHead>
            <TableHead className="text-center">المجموع</TableHead>
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
              <TableCell className="text-center">{item.quantity}</TableCell>
              <TableCell className="text-center">{item.price} ج.م</TableCell>
              <TableCell className="text-center">{item.total || (item.price * item.quantity)} ج.م</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
