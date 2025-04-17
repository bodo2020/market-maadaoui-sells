
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Order {
  id: string;
  created_at: string;
  total: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
  payment_method: string | null;
  shipping_address: string | null;
  items: OrderItem[];
}

// Define a type for database response to handle type differences
type OrderFromDB = {
  id: string;
  created_at: string;
  total: number;
  status: string;
  payment_status: string;
  payment_method: string | null;
  shipping_address: string | null;
  items: any;
  customer_id?: string;
  tracking_number?: string | null;
  shipping_cost?: number | null;
  notes?: string | null;
  updated_at?: string | null;
};

export default function OnlineOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('online_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Transform data to match Order interface
      const transformedOrders: Order[] = (data || []).map((item: OrderFromDB) => ({
        id: item.id,
        created_at: item.created_at,
        total: item.total,
        // Validate that status is one of the allowed values
        status: validateOrderStatus(item.status),
        // Validate that payment_status is one of the allowed values
        payment_status: validatePaymentStatus(item.payment_status),
        payment_method: item.payment_method,
        shipping_address: item.shipping_address,
        items: Array.isArray(item.items) ? item.items : [],
      }));
      
      setOrders(transformedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error("حدث خطأ أثناء تحميل الطلبات");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to validate order status
  const validateOrderStatus = (status: string): Order['status'] => {
    const validStatuses: Order['status'][] = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    return validStatuses.includes(status as Order['status']) 
      ? (status as Order['status']) 
      : 'pending';
  };

  // Helper function to validate payment status
  const validatePaymentStatus = (status: string): Order['payment_status'] => {
    const validStatuses: Order['payment_status'][] = ['pending', 'paid', 'failed', 'refunded'];
    return validStatuses.includes(status as Order['payment_status']) 
      ? (status as Order['payment_status']) 
      : 'pending';
  };

  const getStatusBadge = (status: Order['status']) => {
    const variants: Record<Order['status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      processing: "secondary",
      shipped: "default",
      delivered: "default",
      cancelled: "destructive"
    };
    
    const labels: Record<Order['status'], string> = {
      pending: "قيد الانتظار",
      processing: "قيد المعالجة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي"
    };
    
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  const getPaymentStatusBadge = (status: Order['payment_status']) => {
    const variants: Record<Order['payment_status'], "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      paid: "default",
      failed: "destructive",
      refunded: "secondary"
    };
    
    const labels: Record<Order['payment_status'], string> = {
      pending: "قيد الانتظار",
      paid: "تم الدفع",
      failed: "فشل الدفع",
      refunded: "تم الاسترجاع"
    };
    
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">الطلبات الإلكترونية</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>قائمة الطلبات</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>جاري التحميل...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>رقم الطلب</TableHead>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>حالة الطلب</TableHead>
                    <TableHead>حالة الدفع</TableHead>
                    <TableHead>الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        لا توجد طلبات مسجلة
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id.slice(0, 8)}</TableCell>
                        <TableCell>
                          {new Date(order.created_at).toLocaleDateString('ar')}
                        </TableCell>
                        <TableCell>{order.total}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>{getPaymentStatusBadge(order.payment_status)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">عرض التفاصيل</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
