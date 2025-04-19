
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Plus, Tag, Gift, Trash2, Edit, PackageCheck } from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function OffersPage() {
  const [activeTab, setActiveTab] = useState("free-delivery");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Dummy data for free delivery offers
  const freeDeliveryOffers = [
    { id: '1', name: 'شحن مجاني للطلبات أكثر من 200 جنيه', minOrderAmount: 200, active: true },
    { id: '2', name: 'شحن مجاني للطلبات أكثر من 500 جنيه', minOrderAmount: 500, active: false },
  ];

  // Dummy data for coupons
  const coupons = [
    { id: '1', code: 'WELCOME20', name: 'خصم 20% للعملاء الجدد', discountType: 'percentage', discountValue: 20, minOrderAmount: 100, maxDiscount: 50, usageLimit: 1, expiryDate: '2025-12-31', active: true },
    { id: '2', code: 'SUMMER30', name: 'خصم صيفي 30%', discountType: 'percentage', discountValue: 30, minOrderAmount: 200, maxDiscount: 100, usageLimit: null, expiryDate: '2025-09-30', active: true },
    { id: '3', code: 'FLAT50', name: 'خصم 50 جنيه', discountType: 'fixed', discountValue: 50, minOrderAmount: 300, maxDiscount: null, usageLimit: 5, expiryDate: '2025-06-30', active: false },
  ];

  return (
    <MainLayout>
      <div className="container py-6" dir="rtl">
        <h1 className="text-2xl font-bold mb-6">إدارة العروض والكوبونات</h1>
        
        <Tabs defaultValue="free-delivery" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="free-delivery" className="flex items-center gap-2">
              <PackageCheck className="h-4 w-4" />
              التوصيل المجاني
            </TabsTrigger>
            <TabsTrigger value="coupons" className="flex items-center gap-2">
              <Gift className="h-4 w-4" />
              كوبونات الخصم
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="free-delivery">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>عروض التوصيل المجاني</CardTitle>
                  <CardDescription>أضف عروض للتوصيل المجاني عند وصول الطلب لمبلغ معين</CardDescription>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="ml-2 h-4 w-4" />
                  إضافة عرض جديد
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم العرض</TableHead>
                      <TableHead>الحد الأدنى للطلب</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {freeDeliveryOffers.map((offer) => (
                      <TableRow key={offer.id}>
                        <TableCell className="font-medium">{offer.name}</TableCell>
                        <TableCell>{offer.minOrderAmount} جنيه</TableCell>
                        <TableCell>
                          <Switch checked={offer.active} />
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {freeDeliveryOffers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                          لا توجد عروض توصيل مجاني. قم بإضافة عرض جديد.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="coupons">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>كوبونات الخصم</CardTitle>
                  <CardDescription>أضف كوبونات خصم يمكن للعملاء استخدامها عند الطلب</CardDescription>
                </div>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="ml-2 h-4 w-4" />
                  إضافة كوبون جديد
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>كود الكوبون</TableHead>
                      <TableHead>الاسم</TableHead>
                      <TableHead>قيمة الخصم</TableHead>
                      <TableHead>الحد الأدنى للطلب</TableHead>
                      <TableHead>تاريخ الانتهاء</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-mono font-medium">{coupon.code}</TableCell>
                        <TableCell>{coupon.name}</TableCell>
                        <TableCell>
                          {coupon.discountType === 'percentage' 
                            ? `${coupon.discountValue}%` 
                            : `${coupon.discountValue} جنيه`}
                        </TableCell>
                        <TableCell>{coupon.minOrderAmount} جنيه</TableCell>
                        <TableCell>{new Date(coupon.expiryDate).toLocaleDateString('ar-EG')}</TableCell>
                        <TableCell>
                          <Switch checked={coupon.active} />
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="ghost" size="icon">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {coupons.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                          لا توجد كوبونات خصم. قم بإضافة كوبون جديد.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        {/* Add Dialog - Changes based on active tab */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {activeTab === 'free-delivery' 
                  ? 'إضافة عرض توصيل مجاني جديد' 
                  : 'إضافة كوبون خصم جديد'}
              </DialogTitle>
              <DialogDescription>
                {activeTab === 'free-delivery' 
                  ? 'أضف عرض للتوصيل المجاني عند وصول الطلب لمبلغ معين' 
                  : 'أضف كوبون خصم يمكن للعملاء استخدامه عند الطلب'}
              </DialogDescription>
            </DialogHeader>
            
            {activeTab === 'free-delivery' ? (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="offer-name" className="text-right">
                    اسم العرض
                  </Label>
                  <Input id="offer-name" className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input id="min-order-amount" type="number" min="0" step="1" />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="offer-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch id="offer-active" defaultChecked />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-code" className="text-right">
                    كود الكوبون
                  </Label>
                  <Input id="coupon-code" className="col-span-3" placeholder="مثال: SUMMER30" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-name" className="text-right">
                    اسم الكوبون
                  </Label>
                  <Input id="coupon-name" className="col-span-3" placeholder="خصم 30% لفصل الصيف" />
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="discount-type" className="text-right">
                    نوع الخصم
                  </Label>
                  <div className="col-span-3 flex gap-4">
                    <div className="flex items-center">
                      <input type="radio" id="percentage" name="discount-type" value="percentage" className="ml-2" defaultChecked />
                      <Label htmlFor="percentage">نسبة مئوية (%)</Label>
                    </div>
                    <div className="flex items-center">
                      <input type="radio" id="fixed" name="discount-type" value="fixed" className="ml-2" />
                      <Label htmlFor="fixed">مبلغ ثابت</Label>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="discount-value" className="text-right">
                    قيمة الخصم
                  </Label>
                  <Input id="discount-value" type="number" min="0" className="col-span-3" />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input id="min-order-amount" type="number" min="0" />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="max-discount" className="text-right">
                    أقصى خصم
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input id="max-discount" type="number" min="0" placeholder="اختياري" />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="usage-limit" className="text-right">
                    عدد مرات الاستخدام
                  </Label>
                  <Input id="usage-limit" type="number" min="1" placeholder="اختياري - غير محدود" className="col-span-3" />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="expiry-date" className="text-right">
                    تاريخ الانتهاء
                  </Label>
                  <Input id="expiry-date" type="date" className="col-span-3" />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch id="coupon-active" defaultChecked />
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit">
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
