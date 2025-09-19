
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { fetchCustomerCarts, clearCustomerCart, removeCartItem, CustomerCart } from "@/services/supabase/customerCartService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ShoppingCart, Calendar, User, Phone, Tag, Trash2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export default function CustomerCartsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCart, setSelectedCart] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch customer carts
  const { data: customerCarts = [], isLoading, error } = useQuery({
    queryKey: ['customer-carts'],
    queryFn: fetchCustomerCarts,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Clear cart mutation
  const clearCartMutation = useMutation({
    mutationFn: clearCustomerCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-carts'] });
      setSelectedCart(null);
      toast.success("تم حذف السلة بنجاح");
    },
    onError: (error) => {
      console.error("Error clearing cart:", error);
      toast.error("حدث خطأ في حذف السلة");
    },
  });

  // Remove item mutation
  const removeItemMutation = useMutation({
    mutationFn: removeCartItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-carts'] });
      toast.success("تم حذف المنتج من السلة");
    },
    onError: (error) => {
      console.error("Error removing item:", error);
      toast.error("حدث خطأ في حذف المنتج");
    },
  });

  // Filter carts based on search term
  const filteredCarts = customerCarts.filter(cart => 
    cart.customer_name.includes(searchTerm) || 
    (cart.customer_phone && cart.customer_phone.includes(searchTerm))
  );

  // Get the selected cart details
  const selectedCartDetails = selectedCart 
    ? customerCarts.find(cart => cart.customer_id === selectedCart) 
    : null;

  const handleClearCart = (customerId: string) => {
    if (window.confirm("هل أنت متأكد من حذف السلة بالكامل؟")) {
      clearCartMutation.mutate(customerId);
    }
  };

  const handleRemoveItem = (itemId: string) => {
    if (window.confirm("هل أنت متأكد من حذف هذا المنتج من السلة؟")) {
      removeItemMutation.mutate(itemId);
    }
  };

  return (
    <MainLayout>
      <div className="container py-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">سلات المتسوقين النشطة</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left side - Carts List */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  <span>سلات التسوق</span>
                </CardTitle>
                <CardDescription>
                  سلات العملاء التي لم يتم إكمال الشراء منها بعد
                </CardDescription>
                <div className="flex w-full items-center space-x-2 pt-2">
                  <Input
                    placeholder="بحث بالاسم أو الهاتف..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <Button variant="ghost" size="icon">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <div className="animate-spin mx-auto h-8 w-8 border-2 border-primary border-t-transparent rounded-full mb-2" />
                      <p>جاري تحميل السلات...</p>
                    </div>
                  ) : error ? (
                    <div className="text-center py-8 text-red-500">
                      <p>حدث خطأ في تحميل السلات</p>
                    </div>
                  ) : filteredCarts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="mx-auto h-12 w-12 opacity-20 mb-2" />
                      <p>لا توجد سلات تسوق نشطة</p>
                    </div>
                  ) : (
                    filteredCarts.map(cart => (
                      <div 
                        key={cart.customer_id} 
                        className={`p-3 border rounded-lg cursor-pointer transition-colors flex justify-between items-center ${
                          selectedCart === cart.customer_id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedCart(cart.customer_id)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{cart.customer_name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{cart.customer_name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {cart.customer_phone || 'غير محدد'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="mb-1">{cart.total_items} منتج</Badge>
                          <div className="text-sm font-medium">{cart.total_value.toFixed(2)} ج.م</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Right side - Cart Details */}
          <div className="md:col-span-2">
            {selectedCartDetails ? (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        تفاصيل السلة
                      </CardTitle>
                      <CardDescription>
                        تفاصيل سلة {selectedCartDetails.customer_name}
                      </CardDescription>
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          آخر تحديث: {new Date(selectedCartDetails.last_updated).toLocaleString('ar-EG')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span>{selectedCartDetails.customer_name}</span>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleClearCart(selectedCartDetails.customer_id)}
                        className="mt-2"
                        disabled={clearCartMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 ml-1" />
                        حذف السلة
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المنتج</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">السعر</TableHead>
                        <TableHead className="text-center">المجموع</TableHead>
                        <TableHead className="text-center">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCartDetails.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product?.name || 'منتج غير معروف'}
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                           <TableCell className="text-center">
                             {(() => {
                               if (!item.product) return '0.00 ج.م';
                               
                               let effectivePrice = item.product.price;
                               
                               // Check for bulk pricing
                               if (item.metadata && typeof item.metadata === 'object') {
                                 const metadata = item.metadata as any;
                                 if (metadata.isBulk && item.product.bulk_price && item.product.bulk_quantity) {
                                   effectivePrice = item.product.bulk_price / item.product.bulk_quantity;
                                 }
                                 // Check for scale/weight pricing
                                 else if (metadata.weight && metadata.price_per_kg) {
                                   effectivePrice = metadata.price_per_kg;
                                 }
                               }
                               // Check for offer pricing
                               if (item.product.is_offer && item.product.offer_price) {
                                 effectivePrice = item.product.offer_price;
                               }
                               
                               return `${effectivePrice.toFixed(2)} ج.م`;
                             })()}
                           </TableCell>
                           <TableCell className="text-center">
                             {(() => {
                               if (!item.product) return '0.00 ج.م';
                               
                               let effectivePrice = item.product.price;
                               let totalPrice = 0;
                               
                               // Check for bulk pricing
                               if (item.metadata && typeof item.metadata === 'object') {
                                 const metadata = item.metadata as any;
                                 if (metadata.isBulk && item.product.bulk_price) {
                                   totalPrice = item.product.bulk_price;
                                 }
                                 // Check for scale/weight pricing
                                 else if (metadata.weight && metadata.price_per_kg) {
                                   totalPrice = metadata.price_per_kg * metadata.weight;
                                 }
                                 else {
                                   totalPrice = item.product.price * item.quantity;
                                 }
                               }
                               // Check for offer pricing
                               else if (item.product.is_offer && item.product.offer_price) {
                                 totalPrice = item.product.offer_price * item.quantity;
                               }
                               else {
                                 totalPrice = item.product.price * item.quantity;
                               }
                               
                               return `${totalPrice.toFixed(2)} ج.م`;
                             })()}
                           </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={removeItemMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="mt-6 border-t pt-4">
                    <div className="flex justify-between text-lg font-medium">
                      <span>إجمالي السلة:</span>
                      <span>{selectedCartDetails.total_value.toFixed(2)} ج.م</span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground mt-1">
                      <span>عدد المنتجات:</span>
                      <span>{selectedCartDetails.total_items} منتج</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                    <Button variant="outline">
                      <Tag className="ml-2 h-4 w-4" />
                      إرسال تخفيض خاص
                    </Button>
                    {selectedCartDetails.customer_phone && (
                      <Button>
                        <MessageCircle className="ml-2 h-4 w-4" />
                        إرسال رسالة للعميل
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                  <ShoppingCart className="h-16 w-16 opacity-20 mb-4" />
                  <h3 className="text-lg font-medium mb-2">لم يتم اختيار سلة</h3>
                  <p>اختر سلة من القائمة على اليمين لعرض تفاصيلها</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
