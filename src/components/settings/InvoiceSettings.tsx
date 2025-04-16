
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
import { File, Eye } from "lucide-react";
import { Sale } from "@/types";
import InvoiceDialog from "@/components/POS/InvoiceDialog";

export default function InvoiceSettings() {
  const { toast } = useToast();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [settings, setSettings] = useState({
    footer: siteConfig.invoice?.footer || "شكراً لزيارتكم!",
    website: siteConfig.invoice?.website || "",
    fontSize: siteConfig.invoice?.fontSize || "normal",
    showVat: siteConfig.invoice?.showVat || true,
    template: siteConfig.invoice?.template || "default",
    notes: siteConfig.invoice?.notes || "",
    paymentInstructions: siteConfig.invoice?.paymentInstructions || "",
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
      </Tabs>

      <Button onClick={handleSaveSettings}>حفظ إعدادات الفواتير</Button>

      {/* Invoice Preview Dialog */}
      <InvoiceDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        sale={sampleSale}
        previewMode={true}
        settings={settings}
      />
    </div>
  );
}
