
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
import { 
  OfferType, 
  DiscountType, 
  SpecialOffer, 
  fetchSpecialOffers,
  createSpecialOffer,
  updateSpecialOffer,
  deleteSpecialOffer
} from "@/services/supabase/offerService";

export default function OffersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("free-delivery");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<SpecialOffer | null>(null);
  
  // Form state
  const [offerFormData, setOfferFormData] = useState({
    name: '',
    minOrderAmount: '',
    active: true,
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    discountValue: '',
    maxDiscount: '',
    usageLimit: '',
    expiryDate: '',
    description: ''
  });

  // Fetch free delivery offers
  const { data: freeDeliveryOffers = [], isLoading: isFreeDeliveryLoading } = useQuery({
    queryKey: ['specialOffers', OfferType.FREE_DELIVERY],
    queryFn: () => fetchSpecialOffers(OfferType.FREE_DELIVERY)
  });

  // Fetch coupons
  const { data: coupons = [], isLoading: isCouponsLoading } = useQuery({
    queryKey: ['specialOffers', OfferType.COUPON],
    queryFn: () => fetchSpecialOffers(OfferType.COUPON)
  });

  // Create special offer mutation
  const createOfferMutation = useMutation({
    mutationFn: (offer: Omit<SpecialOffer, 'id' | 'created_at' | 'updated_at'>) => 
      createSpecialOffer(offer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialOffers'] });
      setIsAddDialogOpen(false);
      clearFormData();
      toast.success('تمت إضافة العرض بنجاح');
    },
    onError: (error) => {
      console.error('Error creating offer:', error);
      toast.error('حدث خطأ أثناء إضافة العرض');
    }
  });

  // Update special offer mutation
  const updateOfferMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: Partial<SpecialOffer> }) => 
      updateSpecialOffer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialOffers'] });
      setIsEditDialogOpen(false);
      setSelectedOffer(null);
      clearFormData();
      toast.success('تم تحديث العرض بنجاح');
    },
    onError: (error) => {
      console.error('Error updating offer:', error);
      toast.error('حدث خطأ أثناء تحديث العرض');
    }
  });

  // Delete special offer mutation
  const deleteOfferMutation = useMutation({
    mutationFn: (id: string) => deleteSpecialOffer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['specialOffers'] });
      toast.success('تم حذف العرض بنجاح');
    },
    onError: (error) => {
      console.error('Error deleting offer:', error);
      toast.error('حدث خطأ أثناء حذف العرض');
    }
  });

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    setOfferFormData({
      ...offerFormData,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    });
  };

  // Handle radio input change
  const handleRadioChange = (name: string, value: string) => {
    setOfferFormData({
      ...offerFormData,
      [name]: value
    });
  };

  // Handle switch change
  const handleSwitchChange = (name: string, checked: boolean) => {
    setOfferFormData({
      ...offerFormData,
      [name]: checked
    });
  };

  // Clear form data
  const clearFormData = () => {
    setOfferFormData({
      name: '',
      minOrderAmount: '',
      active: true,
      code: '',
      discountType: 'percentage',
      discountValue: '',
      maxDiscount: '',
      usageLimit: '',
      expiryDate: '',
      description: ''
    });
  };

  // Open add dialog
  const handleOpenAddDialog = () => {
    clearFormData();
    setIsAddDialogOpen(true);
  };

  // Open edit dialog
  const handleOpenEditDialog = (offer: SpecialOffer) => {
    setSelectedOffer(offer);
    setOfferFormData({
      name: offer.name,
      minOrderAmount: offer.min_order_amount?.toString() || '',
      active: offer.active,
      code: offer.code || '',
      discountType: offer.discount_type || 'percentage',
      discountValue: offer.discount_value?.toString() || '',
      maxDiscount: offer.max_discount?.toString() || '',
      usageLimit: offer.usage_limit?.toString() || '',
      expiryDate: offer.expiry_date ? new Date(offer.expiry_date).toISOString().split('T')[0] : '',
      description: offer.description || ''
    });
    setIsEditDialogOpen(true);
  };

  // Handle form submission for adding
  const handleAddOffer = () => {
    const offerType = activeTab === 'free-delivery' ? OfferType.FREE_DELIVERY : OfferType.COUPON;
    
    // Validate form
    if (!offerFormData.name) {
      toast.error('يرجى إدخال اسم العرض');
      return;
    }

    if (offerType === OfferType.COUPON && !offerFormData.code) {
      toast.error('يرجى إدخال كود الكوبون');
      return;
    }

    // Prepare offer data
    const offerData: Omit<SpecialOffer, 'id' | 'created_at' | 'updated_at'> = {
      offer_type: offerType,
      name: offerFormData.name,
      active: offerFormData.active,
      description: offerFormData.description || undefined,
      min_order_amount: offerFormData.minOrderAmount ? parseFloat(offerFormData.minOrderAmount) : undefined,
    };

    // Add coupon-specific fields
    if (offerType === OfferType.COUPON) {
      offerData.code = offerFormData.code;
      offerData.discount_type = offerFormData.discountType as DiscountType;
      offerData.discount_value = offerFormData.discountValue ? parseFloat(offerFormData.discountValue) : undefined;
      offerData.max_discount = offerFormData.maxDiscount ? parseFloat(offerFormData.maxDiscount) : undefined;
      offerData.usage_limit = offerFormData.usageLimit ? parseInt(offerFormData.usageLimit) : undefined;
      offerData.expiry_date = offerFormData.expiryDate || undefined;
    }

    createOfferMutation.mutate(offerData);
  };

  // Handle form submission for editing
  const handleUpdateOffer = () => {
    if (!selectedOffer) return;

    const updates: Partial<SpecialOffer> = {
      name: offerFormData.name,
      active: offerFormData.active,
      description: offerFormData.description || undefined,
      min_order_amount: offerFormData.minOrderAmount ? parseFloat(offerFormData.minOrderAmount) : undefined,
    };

    // Add coupon-specific fields
    if (selectedOffer.offer_type === OfferType.COUPON) {
      updates.code = offerFormData.code;
      updates.discount_type = offerFormData.discountType as DiscountType;
      updates.discount_value = offerFormData.discountValue ? parseFloat(offerFormData.discountValue) : undefined;
      updates.max_discount = offerFormData.maxDiscount ? parseFloat(offerFormData.maxDiscount) : undefined;
      updates.usage_limit = offerFormData.usageLimit ? parseInt(offerFormData.usageLimit) : undefined;
      updates.expiry_date = offerFormData.expiryDate || undefined;
    }

    updateOfferMutation.mutate({ id: selectedOffer.id, data: updates });
  };

  // Toggle offer active status
  const toggleOfferStatus = (offer: SpecialOffer) => {
    updateOfferMutation.mutate({
      id: offer.id,
      data: { active: !offer.active }
    });
  };

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
                <Button onClick={handleOpenAddDialog}>
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
                    {isFreeDeliveryLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center">جاري التحميل...</TableCell>
                      </TableRow>
                    ) : freeDeliveryOffers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                          لا توجد عروض توصيل مجاني. قم بإضافة عرض جديد.
                        </TableCell>
                      </TableRow>
                    ) : (
                      freeDeliveryOffers.map((offer) => (
                        <TableRow key={offer.id}>
                          <TableCell className="font-medium">{offer.name}</TableCell>
                          <TableCell>{offer.min_order_amount ? `${offer.min_order_amount} جنيه` : 'غير محدد'}</TableCell>
                          <TableCell>
                            <Switch 
                              checked={offer.active} 
                              onCheckedChange={() => toggleOfferStatus(offer)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditDialog(offer)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive"
                                onClick={() => deleteOfferMutation.mutate(offer.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
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
                <Button onClick={handleOpenAddDialog}>
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
                    {isCouponsLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">جاري التحميل...</TableCell>
                      </TableRow>
                    ) : coupons.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                          لا توجد كوبونات خصم. قم بإضافة كوبون جديد.
                        </TableCell>
                      </TableRow>
                    ) : (
                      coupons.map((coupon) => (
                        <TableRow key={coupon.id}>
                          <TableCell className="font-mono font-medium">{coupon.code}</TableCell>
                          <TableCell>{coupon.name}</TableCell>
                          <TableCell>
                            {coupon.discount_type === 'percentage' 
                              ? `${coupon.discount_value}%` 
                              : `${coupon.discount_value} جنيه`}
                          </TableCell>
                          <TableCell>{coupon.min_order_amount ? `${coupon.min_order_amount} جنيه` : 'غير محدد'}</TableCell>
                          <TableCell>
                            {coupon.expiry_date 
                              ? new Date(coupon.expiry_date).toLocaleDateString('ar-EG') 
                              : 'غير محدد'}
                          </TableCell>
                          <TableCell>
                            <Switch 
                              checked={coupon.active} 
                              onCheckedChange={() => toggleOfferStatus(coupon)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleOpenEditDialog(coupon)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="text-destructive"
                                onClick={() => deleteOfferMutation.mutate(coupon.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
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
                  <Input 
                    id="offer-name" 
                    name="name"
                    value={offerFormData.name}
                    onChange={handleInputChange}
                    className="col-span-3" 
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="min-order-amount" 
                      name="minOrderAmount"
                      value={offerFormData.minOrderAmount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                      step="1" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">
                    وصف العرض
                  </Label>
                  <Input
                    id="description"
                    name="description"
                    value={offerFormData.description}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="اختياري"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="offer-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch 
                      id="offer-active" 
                      checked={offerFormData.active} 
                      onCheckedChange={(checked) => handleSwitchChange('active', checked)} 
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-code" className="text-right">
                    كود الكوبون
                  </Label>
                  <Input 
                    id="coupon-code" 
                    name="code"
                    value={offerFormData.code}
                    onChange={handleInputChange}
                    className="col-span-3" 
                    placeholder="مثال: SUMMER30" 
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-name" className="text-right">
                    اسم الكوبون
                  </Label>
                  <Input 
                    id="coupon-name" 
                    name="name"
                    value={offerFormData.name}
                    onChange={handleInputChange}
                    className="col-span-3" 
                    placeholder="خصم 30% لفصل الصيف" 
                  />
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="discount-type" className="text-right">
                    نوع الخصم
                  </Label>
                  <div className="col-span-3 flex gap-4">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="percentage" 
                        name="discountType" 
                        value="percentage" 
                        className="ml-2" 
                        checked={offerFormData.discountType === 'percentage'}
                        onChange={() => handleRadioChange('discountType', 'percentage')}
                      />
                      <Label htmlFor="percentage">نسبة مئوية (%)</Label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="fixed" 
                        name="discountType" 
                        value="fixed" 
                        className="ml-2"
                        checked={offerFormData.discountType === 'fixed'}
                        onChange={() => handleRadioChange('discountType', 'fixed')}
                      />
                      <Label htmlFor="fixed">مبلغ ثابت</Label>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="discount-value" className="text-right">
                    قيمة الخصم
                  </Label>
                  <Input 
                    id="discount-value" 
                    name="discountValue"
                    value={offerFormData.discountValue}
                    onChange={handleInputChange}
                    type="number" 
                    min="0" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="min-order-amount" 
                      name="minOrderAmount"
                      value={offerFormData.minOrderAmount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="max-discount" className="text-right">
                    أقصى خصم
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="max-discount" 
                      name="maxDiscount"
                      value={offerFormData.maxDiscount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                      placeholder="اختياري" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="usage-limit" className="text-right">
                    عدد مرات الاستخدام
                  </Label>
                  <Input 
                    id="usage-limit" 
                    name="usageLimit"
                    value={offerFormData.usageLimit}
                    onChange={handleInputChange}
                    type="number" 
                    min="1" 
                    placeholder="اختياري - غير محدود" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="expiry-date" className="text-right">
                    تاريخ الانتهاء
                  </Label>
                  <Input 
                    id="expiry-date" 
                    name="expiryDate"
                    value={offerFormData.expiryDate}
                    onChange={handleInputChange}
                    type="date" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="coupon-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch 
                      id="coupon-active" 
                      checked={offerFormData.active}
                      onCheckedChange={(checked) => handleSwitchChange('active', checked)}
                    />
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleAddOffer}>
                إضافة
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {selectedOffer?.offer_type === OfferType.FREE_DELIVERY 
                  ? 'تعديل عرض التوصيل المجاني' 
                  : 'تعديل كوبون الخصم'}
              </DialogTitle>
            </DialogHeader>
            
            {selectedOffer?.offer_type === OfferType.FREE_DELIVERY ? (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-offer-name" className="text-right">
                    اسم العرض
                  </Label>
                  <Input 
                    id="edit-offer-name" 
                    name="name"
                    value={offerFormData.name}
                    onChange={handleInputChange}
                    className="col-span-3" 
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="edit-min-order-amount" 
                      name="minOrderAmount"
                      value={offerFormData.minOrderAmount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                      step="1" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-description" className="text-right">
                    وصف العرض
                  </Label>
                  <Input
                    id="edit-description"
                    name="description"
                    value={offerFormData.description}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="اختياري"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-offer-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch 
                      id="edit-offer-active" 
                      checked={offerFormData.active} 
                      onCheckedChange={(checked) => handleSwitchChange('active', checked)} 
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-coupon-code" className="text-right">
                    كود الكوبون
                  </Label>
                  <Input 
                    id="edit-coupon-code" 
                    name="code"
                    value={offerFormData.code}
                    onChange={handleInputChange}
                    className="col-span-3" 
                    placeholder="مثال: SUMMER30" 
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-coupon-name" className="text-right">
                    اسم الكوبون
                  </Label>
                  <Input 
                    id="edit-coupon-name" 
                    name="name"
                    value={offerFormData.name}
                    onChange={handleInputChange}
                    className="col-span-3" 
                    placeholder="خصم 30% لفصل الصيف" 
                  />
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-discount-type" className="text-right">
                    نوع الخصم
                  </Label>
                  <div className="col-span-3 flex gap-4">
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="edit-percentage" 
                        name="discountType" 
                        value="percentage" 
                        className="ml-2" 
                        checked={offerFormData.discountType === 'percentage'}
                        onChange={() => handleRadioChange('discountType', 'percentage')}
                      />
                      <Label htmlFor="edit-percentage">نسبة مئوية (%)</Label>
                    </div>
                    <div className="flex items-center">
                      <input 
                        type="radio" 
                        id="edit-fixed" 
                        name="discountType" 
                        value="fixed" 
                        className="ml-2"
                        checked={offerFormData.discountType === 'fixed'}
                        onChange={() => handleRadioChange('discountType', 'fixed')}
                      />
                      <Label htmlFor="edit-fixed">مبلغ ثابت</Label>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-discount-value" className="text-right">
                    قيمة الخصم
                  </Label>
                  <Input 
                    id="edit-discount-value" 
                    name="discountValue"
                    value={offerFormData.discountValue}
                    onChange={handleInputChange}
                    type="number" 
                    min="0" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-min-order-amount" className="text-right">
                    الحد الأدنى للطلب
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="edit-min-order-amount" 
                      name="minOrderAmount"
                      value={offerFormData.minOrderAmount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-max-discount" className="text-right">
                    أقصى خصم
                  </Label>
                  <div className="flex items-center col-span-3">
                    <Input 
                      id="edit-max-discount" 
                      name="maxDiscount"
                      value={offerFormData.maxDiscount}
                      onChange={handleInputChange}
                      type="number" 
                      min="0" 
                      placeholder="اختياري" 
                    />
                    <span className="mr-2">جنيه</span>
                  </div>
                </div>
                
                <Separator className="my-2" />
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-usage-limit" className="text-right">
                    عدد مرات الاستخدام
                  </Label>
                  <Input 
                    id="edit-usage-limit" 
                    name="usageLimit"
                    value={offerFormData.usageLimit}
                    onChange={handleInputChange}
                    type="number" 
                    min="1" 
                    placeholder="اختياري - غير محدود" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-expiry-date" className="text-right">
                    تاريخ الانتهاء
                  </Label>
                  <Input 
                    id="edit-expiry-date" 
                    name="expiryDate"
                    value={offerFormData.expiryDate}
                    onChange={handleInputChange}
                    type="date" 
                    className="col-span-3" 
                  />
                </div>
                
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-coupon-active" className="text-right">
                    نشط
                  </Label>
                  <div className="col-span-3">
                    <Switch 
                      id="edit-coupon-active" 
                      checked={offerFormData.active}
                      onCheckedChange={(checked) => handleSwitchChange('active', checked)}
                    />
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter className="sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" onClick={handleUpdateOffer}>
                تحديث
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
