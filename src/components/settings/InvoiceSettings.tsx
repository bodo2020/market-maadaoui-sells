
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { siteConfig } from "@/config/site";
import { File, Eye, Upload, Image as ImageIcon } from "lucide-react";
import { Sale } from "@/types";
import InvoiceDialog from "@/components/POS/InvoiceDialog";
import { supabase } from "@/integrations/supabase/client";

export default function InvoiceSettings() {
  const { toast } = useToast();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState({
    footer: siteConfig.invoice?.footer || "شكراً لزيارتكم!",
    website: siteConfig.invoice?.website || "",
    fontSize: siteConfig.invoice?.fontSize || "normal",
    showVat: siteConfig.invoice?.showVat || true,
    template: siteConfig.invoice?.template || "default",
    notes: siteConfig.invoice?.notes || "",
    paymentInstructions: siteConfig.invoice?.paymentInstructions || "",
    logoChoice: siteConfig.invoice?.logoChoice || "store",
    customLogoUrl: siteConfig.invoice?.customLogoUrl || null,
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings({ ...settings, [name]: value });
  };

  const handleSwitchChange = (name: string, checked: boolean) => {
    setSettings({ ...settings, [name]: checked });
  };

  const handleSelectChange = (name: string, value: string) => {
    setSettings({ ...settings, [name]: value });
  };

  const handleCustomLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      
      if (!e.target.files || e.target.files.length === 0) {
        return;
      }
      
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `invoice_logo_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('store')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
        
      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }
      
      // Get the public URL
      const { data } = supabase.storage.from('store').getPublicUrl(filePath);
      
      if (data) {
        setSettings({ ...settings, customLogoUrl: data.publicUrl });
        
        toast({
          title: "تم",
          description: "تم رفع الشعار بنجاح",
        });
      }
    } catch (error) {
      console.error("Error uploading logo:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء رفع الشعار",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSaveSettings = () => {
    // In a real app, this would save to the database
    toast({
      title: "تم",
      description: "تم حفظ إعدادات الفواتير بنجاح",
    });
  };

  // Sample invoice data for preview with complete Product objects
  const sampleSale: Sale = {
    id: "preview-invoice",
    date: new Date().toISOString(),
    invoice_number: "PREVIEW-001",
    items: [
      {
        product: {
          id: "1",
          name: "منتج تجريبي 1",
          price: 125,
          purchase_price: 100,
          quantity: 50,
          image_urls: [],
          is_offer: false,
          bulk_enabled: false,
          is_bulk: false, // Added the missing property
          created_at: new Date().toISOString(),
        },
        quantity: 2,
        price: 125,
        discount: 0,
        total: 250,
      },
      {
        product: {
          id: "2",
          name: "منتج تجريبي 2",
          price: 75,
          purchase_price: 50,
          quantity: 30,
          image_urls: [],
          is_offer: false,
          bulk_enabled: false,
          is_bulk: false, // Added the missing property
          created_at: new Date().toISOString(),
        },
        quantity: 1,
        price: 75,
        discount: 0,
        total: 75,
      }
    ],
    subtotal: 325,
    discount: 25,
    total: 300,
    payment_method: "cash",
    cash_amount: 300,
    profit: 100,
    customer_name: "عميل تجريبي",
    customer_phone: "01234567890",
    created_at: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">إعدادات الفواتير</h2>
        <Button 
          variant="outline" 
          onClick={() => setIsPreviewOpen(true)}
          className="flex items-center gap-2"
        >
          <Eye className="h-4 w-4" />
          معاينة الفاتورة
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">معلومات عامة</TabsTrigger>
          <TabsTrigger value="design">تصميم الفاتورة</TabsTrigger>
          <TabsTrigger value="content">محتوى إضافي</TabsTrigger>
          <TabsTrigger value="logo">شعار الفاتورة</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>معلومات المتجر</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website">الموقع الإلكتروني</Label>
                  <Input
                    id="website"
                    name="website"
                    value={settings.website}
                    onChange={handleInputChange}
                    placeholder="www.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vatNumber">الرقم الضريبي</Label>
                  <div className="flex space-x-2 items-center">
                    <Input
                      id="vatNumber"
                      placeholder="أدخل الرقم الضريبي"
                      defaultValue={siteConfig.vatNumber}
                    />
                    <div className="ms-2 flex items-center space-x-2">
                      <Switch
                        id="showVat"
                        checked={settings.showVat}
                        onCheckedChange={(checked) => handleSwitchChange("showVat", checked)}
                      />
                      <Label htmlFor="showVat" className="me-2">إظهار في الفاتورة</Label>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>تصميم الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="template">نموذج الفاتورة</Label>
                  <Select 
                    defaultValue={settings.template} 
                    onValueChange={(value) => handleSelectChange("template", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر نموذج الفاتورة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">النموذج الافتراضي</SelectItem>
                      <SelectItem value="compact">نموذج مدمج</SelectItem>
                      <SelectItem value="detailed">نموذج مفصل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fontSize">حجم الخط</Label>
                  <Select 
                    defaultValue={settings.fontSize} 
                    onValueChange={(value) => handleSelectChange("fontSize", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر حجم الخط" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">صغير</SelectItem>
                      <SelectItem value="normal">متوسط</SelectItem>
                      <SelectItem value="large">كبير</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="footer">نص التذييل</Label>
                <Input
                  id="footer"
                  name="footer"
                  value={settings.footer}
                  onChange={handleInputChange}
                  placeholder="نص يظهر في نهاية الفاتورة"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>محتوى إضافي</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">ملاحظات</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  value={settings.notes}
                  onChange={handleInputChange}
                  placeholder="ملاحظات تظهر في الفاتورة"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentInstructions">تعليمات الدفع</Label>
                <Textarea
                  id="paymentInstructions"
                  name="paymentInstructions"
                  value={settings.paymentInstructions}
                  onChange={handleInputChange}
                  placeholder="تعليمات إضافية للدفع"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>شعار الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="logoChoice">اختيار الشعار</Label>
                <Select 
                  defaultValue={settings.logoChoice} 
                  onValueChange={(value) => handleSelectChange("logoChoice", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مصدر الشعار" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">استخدام شعار المتجر</SelectItem>
                    <SelectItem value="custom">استخدام شعار مخصص</SelectItem>
                    <SelectItem value="none">بدون شعار</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {settings.logoChoice === 'custom' && (
                <div className="space-y-2 mt-4">
                  <Label>شعار مخصص للفاتورة</Label>
                  
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 h-48">
                    {settings.customLogoUrl ? (
                      <div className="relative w-full h-full">
                        <img
                          src={settings.customLogoUrl}
                          alt="شعار مخصص للفاتورة"
                          className="w-full h-full object-contain"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="absolute top-0 right-0 m-2"
                          onClick={() => setSettings({ ...settings, customLogoUrl: null })}
                        >
                          إزالة
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <ImageIcon className="w-16 h-16 mb-4" />
                        <p className="text-sm text-center mb-2">اسحب الشعار هنا أو انقر للتحميل</p>
                        <p className="text-xs text-center">PNG, JPG أو WEBP (الحد الأقصى: 5MB)</p>
                      </div>
                    )}
                    
                    <Input
                      id="custom-logo-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCustomLogoUpload}
                      disabled={uploading}
                    />
                  </div>
                  
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => document.getElementById('custom-logo-upload')?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <span className="flex items-center">
                        <span className="animate-spin mr-2">⏳</span> جاري الرفع...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Upload className="ml-2 h-4 w-4" /> تحميل شعار جديد
                      </span>
                    )}
                  </Button>
                </div>
              )}

              {settings.logoChoice === 'store' && siteConfig.logoUrl && (
                <div className="flex justify-center mt-4 border rounded p-4">
                  <div className="text-center">
                    <p className="mb-2 text-sm text-muted-foreground">سيتم استخدام شعار المتجر الحالي:</p>
                    <img
                      src={siteConfig.logoUrl}
                      alt="شعار المتجر"
                      className="h-32 object-contain mx-auto"
                    />
                  </div>
                </div>
              )}

              {settings.logoChoice === 'store' && !siteConfig.logoUrl && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mt-4">
                  <p className="text-amber-800 text-sm">
                    لم يتم تعيين شعار للمتجر. قم بتعيين شعار المتجر من إعدادات المتجر أولاً.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Button onClick={handleSaveSettings}>حفظ إعدادات الفواتير</Button>

      {/* Invoice Preview Dialog */}
      <InvoiceDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        sale={sampleSale}
        previewMode={true}
        settings={{
          ...settings,
          // Determine which logo URL to use based on the logo choice
          logo: settings.logoChoice === 'store' 
            ? siteConfig.logoUrl 
            : settings.logoChoice === 'custom' 
              ? settings.customLogoUrl 
              : null
        }}
      />
    </div>
  );
}
