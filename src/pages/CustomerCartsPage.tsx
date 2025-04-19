
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
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
import { Search, ShoppingCart, Calendar, User, Phone, Tag } from "lucide-react";

// Mock data for customer carts
const mockCustomerCarts = [
  {
    id: '1',
    user_id: 'u1',
    user_name: 'أحمد محمد',
    user_phone: '0123456789',
    items: [
      { id: 'p1', name: 'منتج 1', price: 150, quantity: 2, total: 300 },
      { id: 'p2', name: 'منتج 2', price: 75, quantity: 1, total: 75 },
    ],
    total: 375,
    last_updated: '2023-05-15T14:30:00',
    items_count: 2
  },
  {
    id: '2',
    user_id: 'u2',
    user_name: 'سارة أحمد',
    user_phone: '0123456790',
    items: [
      { id: 'p3', name: 'منتج 3', price: 200, quantity: 1, total: 200 },
      { id: 'p4', name: 'منتج 4', price: 50, quantity: 3, total: 150 },
      { id: 'p5', name: 'منتج 5', price: 120, quantity: 1, total: 120 },
    ],
    total: 470,
    last_updated: '2023-05-16T09:15:00',
    items_count: 3
  },
  {
    id: '3',
    user_id: 'u3',
    user_name: 'محمد علي',
    user_phone: '0123456791',
    items: [
      { id: 'p1', name: 'منتج 1', price: 150, quantity: 1, total: 150 },
    ],
    total: 150,
    last_updated: '2023-05-16T10:45:00',
    items_count: 1
  },
];

export default function CustomerCartsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCart, setSelectedCart] = useState<string | null>(null);

  // Filter carts based on search term
  const filteredCarts = mockCustomerCarts.filter(cart => 
    cart.user_name.includes(searchTerm) || 
    cart.user_phone.includes(searchTerm)
  );

  // Get the selected cart details
  const selectedCartDetails = selectedCart 
    ? mockCustomerCarts.find(cart => cart.id === selectedCart) 
    : null;

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
                  {filteredCarts.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <ShoppingCart className="mx-auto h-12 w-12 opacity-20 mb-2" />
                      <p>لا توجد سلات تسوق نشطة</p>
                    </div>
                  ) : (
                    filteredCarts.map(cart => (
                      <div 
                        key={cart.id} 
                        className={`p-3 border rounded-lg cursor-pointer transition-colors flex justify-between items-center ${
                          selectedCart === cart.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedCart(cart.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>{cart.user_name.slice(0, 2)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{cart.user_name}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {cart.user_phone}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge className="mb-1">{cart.items_count} منتج</Badge>
                          <div className="text-sm font-medium">{cart.total} ج.م</div>
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
                        تفاصيل سلة {selectedCartDetails.user_name}
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
                        <span>{selectedCartDetails.user_name}</span>
                      </div>
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
                        <TableHead className="text-left">المجموع</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedCartDetails.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.price} ج.م</TableCell>
                          <TableCell className="text-left">{item.total} ج.م</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  <div className="mt-6 border-t pt-4">
                    <div className="flex justify-between text-lg font-medium">
                      <span>إجمالي السلة:</span>
                      <span>{selectedCartDetails.total} ج.م</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
                    <Button variant="outline">
                      <Tag className="ml-2 h-4 w-4" />
                      إرسال تخفيض خاص
                    </Button>
                    <Button>
                      <Phone className="ml-2 h-4 w-4" />
                      الاتصال بالعميل
                    </Button>
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
