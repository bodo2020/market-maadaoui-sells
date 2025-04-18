
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin } from "lucide-react";
import { Order } from "@/types/index";

interface CustomerProfileProps {
  customer: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    order: Order;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CustomerProfileDialog({ customer, open, onOpenChange }: CustomerProfileProps) {
  if (!customer) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>معلومات العميل</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col md:flex-row gap-6">
          {/* Customer Profile */}
          <div className="w-full md:w-1/2 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                  {getInitials(customer.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-semibold">{customer.name}</h3>
                <Badge variant="outline">عميل جديد</Badge>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-4">
              <h4 className="text-lg font-medium">بيانات التواصل</h4>
              
              {customer.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${customer.email}`} className="text-primary underline">
                    {customer.email}
                  </a>
                </div>
              )}
              
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${customer.phone}`} className="text-primary underline">
                    {customer.phone}
                  </a>
                </div>
              )}
            </div>
            
            {customer.address && (
              <div className="space-y-4">
                <h4 className="text-lg font-medium">عنوان الشحن</h4>
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                  <p>{customer.address}</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Order Summary */}
          <div className="w-full md:w-1/2 space-y-6">
            <h4 className="text-lg font-medium">طلبات العميل</h4>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h5 className="font-medium">#{customer.order.id.slice(0, 8)}</h5>
                    <p className="text-sm text-muted-foreground">{formatDate(customer.order.created_at)}</p>
                  </div>
                  <Badge variant="outline">{customer.order.total} ج.م</Badge>
                </div>
                
                <Separator className="my-3" />
                
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{customer.order.items.length} منتج</Badge>
                  <Badge variant={customer.order.status === 'pending' ? 'outline' : 'default'}>
                    {customer.order.status === 'pending' ? 'قيد الانتظار' : 'تم الشحن'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            
            <div className="space-y-4">
              <h4 className="text-lg font-medium">إحصائيات</h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted rounded-md p-3 text-center">
                  <p className="text-2xl font-bold">1</p>
                  <p className="text-sm text-muted-foreground">عدد الطلبات</p>
                </div>
                <div className="bg-muted rounded-md p-3 text-center">
                  <p className="text-2xl font-bold">{customer.order.total} ج.م</p>
                  <p className="text-sm text-muted-foreground">المبيعات</p>
                </div>
                <div className="bg-muted rounded-md p-3 text-center">
                  <p className="text-2xl font-bold">أمس</p>
                  <p className="text-sm text-muted-foreground">آخر طلب</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
