
import { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { siteConfig } from "@/config/site";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings as SettingsIcon, 
  Save,
  Store,
  Printer,
  Receipt,
  BellRing,
  Lock,
  Users,
  Truck
} from "lucide-react";

export default function Settings() {
  const [storeSettings, setStoreSettings] = useState({
    storeName: siteConfig.name,
    storePhone: "01012345678",
    storeAddress: "شارع المعداوي، القاهرة، مصر",
    taxNumber: "123456789",
    showLogo: true,
    currency: siteConfig.currency,
    emailReceipts: false,
    lowStockThreshold: 10,
    showOffers: true
  });
  
  const [printerSettings, setPrinterSettings] = useState({
    printerName: "طابعة الإيصالات",
    printAutomatically: true,
    paperWidth: 80,
    includeLogo: true,
    includeBarcode: true,
    includeDate: true,
    includeTime: true,
    includeOperator: true,
    includeCustomerInfo: false,
    footerText: `شكراً لتسوقك في ${siteConfig.name}`,
  });
  
  const [notificationSettings, setNotificationSettings] = useState({
    lowStockNotifications: true,
    salesNotifications: true,
    newProductNotifications: false,
    dailyReportNotifications: true,
    emailNotifications: false,
    pushNotifications: true
  });
  
  const handleSaveSettings = () => {
    // In a real app, this would save settings to the database
    alert("تم حفظ الإعدادات بنجاح");
  };
  
  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">الإعدادات</h1>
      </div>
      
      <Tabs defaultValue="store" className="space-y-6">
        <TabsList className="grid w-full md:w-fit grid-cols-4 md:grid-cols-4 mb-4">
          <TabsTrigger value="store" className="flex gap-2">
            <Store className="h-4 w-4" />
            <span>المتجر</span>
          </TabsTrigger>
          <TabsTrigger value="printer" className="flex gap-2">
            <Printer className="h-4 w-4" />
            <span>الطباعة</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex gap-2">
            <BellRing className="h-4 w-4" />
            <span>الإشعارات</span>
          </TabsTrigger>
          <TabsTrigger value="users" className="flex gap-2">
            <Users className="h-4 w-4" />
            <span>المستخدمين</span>
          </TabsTrigger>
        </TabsList>
        
        {/* Store Settings */}
        <TabsContent value="store">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                <CardTitle>إعدادات المتجر</CardTitle>
              </div>
              <CardDescription>
                إدارة إعدادات المتجر الأساسية
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Store Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">معلومات المتجر</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="storeName">اسم المتجر</Label>
                    <Input 
                      id="storeName" 
                      value={storeSettings.storeName}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        storeName: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="storePhone">رقم الهاتف</Label>
                    <Input 
                      id="storePhone" 
                      value={storeSettings.storePhone}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        storePhone: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="storeAddress">العنوان</Label>
                    <Input 
                      id="storeAddress" 
                      value={storeSettings.storeAddress}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        storeAddress: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="taxNumber">الرقم الضريبي</Label>
                    <Input 
                      id="taxNumber" 
                      value={storeSettings.taxNumber}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        taxNumber: e.target.value
                      })}
                    />
                  </div>
                </div>
                
                {/* Store Preferences */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">تفضيلات المتجر</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="currency">العملة</Label>
                    <Input 
                      id="currency" 
                      value={storeSettings.currency}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        currency: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lowStockThreshold">حد المخزون المنخفض</Label>
                    <Input 
                      id="lowStockThreshold" 
                      type="number"
                      value={storeSettings.lowStockThreshold}
                      onChange={(e) => setStoreSettings({
                        ...storeSettings,
                        lowStockThreshold: parseInt(e.target.value)
                      })}
                    />
                    <p className="text-xs text-muted-foreground">
                      عند وصول كمية المنتج إلى هذا الحد، سيظهر تنبيه المخزون المنخفض
                    </p>
                  </div>
                  
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="showLogo">عرض شعار المتجر</Label>
                        <p className="text-xs text-muted-foreground">
                          عرض شعار المتجر على الإيصالات والفواتير
                        </p>
                      </div>
                      <Switch 
                        id="showLogo" 
                        checked={storeSettings.showLogo}
                        onCheckedChange={(checked) => setStoreSettings({
                          ...storeSettings,
                          showLogo: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="emailReceipts">إرسال الإيصالات بالبريد الإلكتروني</Label>
                        <p className="text-xs text-muted-foreground">
                          إرسال الإيصالات للعملاء بالبريد الإلكتروني تلقائياً
                        </p>
                      </div>
                      <Switch 
                        id="emailReceipts" 
                        checked={storeSettings.emailReceipts}
                        onCheckedChange={(checked) => setStoreSettings({
                          ...storeSettings,
                          emailReceipts: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="showOffers">عرض العروض</Label>
                        <p className="text-xs text-muted-foreground">
                          عرض العروض والخصومات في شاشة نقطة البيع
                        </p>
                      </div>
                      <Switch 
                        id="showOffers" 
                        checked={storeSettings.showOffers}
                        onCheckedChange={(checked) => setStoreSettings({
                          ...storeSettings,
                          showOffers: checked
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button onClick={handleSaveSettings} className="mr-auto">
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Printer Settings */}
        <TabsContent value="printer">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Printer className="h-5 w-5" />
                <CardTitle>إعدادات الطباعة</CardTitle>
              </div>
              <CardDescription>
                إدارة إعدادات طباعة الإيصالات والفواتير
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Printer Settings */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">إعدادات الطابعة</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="printerName">اسم الطابعة</Label>
                    <Input 
                      id="printerName" 
                      value={printerSettings.printerName}
                      onChange={(e) => setPrinterSettings({
                        ...printerSettings,
                        printerName: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="paperWidth">عرض الورق (مم)</Label>
                    <Input 
                      id="paperWidth" 
                      type="number"
                      value={printerSettings.paperWidth}
                      onChange={(e) => setPrinterSettings({
                        ...printerSettings,
                        paperWidth: parseInt(e.target.value)
                      })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="footerText">نص التذييل</Label>
                    <Input 
                      id="footerText" 
                      value={printerSettings.footerText}
                      onChange={(e) => setPrinterSettings({
                        ...printerSettings,
                        footerText: e.target.value
                      })}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <Label htmlFor="printAutomatically">طباعة تلقائية</Label>
                      <p className="text-xs text-muted-foreground">
                        طباعة الإيصال تلقائياً بعد كل عملية بيع
                      </p>
                    </div>
                    <Switch 
                      id="printAutomatically" 
                      checked={printerSettings.printAutomatically}
                      onCheckedChange={(checked) => setPrinterSettings({
                        ...printerSettings,
                        printAutomatically: checked
                      })}
                    />
                  </div>
                </div>
                
                {/* Receipt Content */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">محتوى الإيصال</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeLogo">إظهار الشعار</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة شعار المتجر في أعلى الإيصال
                        </p>
                      </div>
                      <Switch 
                        id="includeLogo" 
                        checked={printerSettings.includeLogo}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeLogo: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeBarcode">إظهار الباركود</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة باركود رقم الفاتورة
                        </p>
                      </div>
                      <Switch 
                        id="includeBarcode" 
                        checked={printerSettings.includeBarcode}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeBarcode: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeDate">إظهار التاريخ</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة تاريخ الفاتورة
                        </p>
                      </div>
                      <Switch 
                        id="includeDate" 
                        checked={printerSettings.includeDate}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeDate: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeTime">إظهار الوقت</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة وقت الفاتورة
                        </p>
                      </div>
                      <Switch 
                        id="includeTime" 
                        checked={printerSettings.includeTime}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeTime: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeOperator">إظهار اسم الكاشير</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة اسم الكاشير الذي أتم المعاملة
                        </p>
                      </div>
                      <Switch 
                        id="includeOperator" 
                        checked={printerSettings.includeOperator}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeOperator: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeCustomerInfo">إظهار معلومات العميل</Label>
                        <p className="text-xs text-muted-foreground">
                          طباعة معلومات العميل إذا كانت متوفرة
                        </p>
                      </div>
                      <Switch 
                        id="includeCustomerInfo" 
                        checked={printerSettings.includeCustomerInfo}
                        onCheckedChange={(checked) => setPrinterSettings({
                          ...printerSettings,
                          includeCustomerInfo: checked
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-4 border rounded-md mt-4">
                <h3 className="font-medium mb-2">معاينة الإيصال</h3>
                <div className="bg-gray-50 p-4 rounded-md text-center space-y-2">
                  {printerSettings.includeLogo && (
                    <div className="flex justify-center mb-2">
                      <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
                        <Store className="h-8 w-8 text-primary" />
                      </div>
                    </div>
                  )}
                  
                  <h3 className="font-bold">{storeSettings.storeName}</h3>
                  <p className="text-sm">{storeSettings.storeAddress}</p>
                  <p className="text-sm">هاتف: {storeSettings.storePhone}</p>
                  
                  {printerSettings.includeDate && (
                    <p className="text-sm">
                      {new Date().toLocaleDateString('ar-EG')}
                      {printerSettings.includeTime && ` - ${new Date().toLocaleTimeString('ar-EG')}`}
                    </p>
                  )}
                  
                  <div className="border-t border-b my-2 py-2">
                    <div className="flex justify-between text-sm">
                      <span>رقم الفاتورة:</span>
                      <span>#1001</span>
                    </div>
                    {printerSettings.includeOperator && (
                      <div className="flex justify-between text-sm">
                        <span>الكاشير:</span>
                        <span>أحمد المعداوي</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="text-left space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>سكر 1 كيلو x2</span>
                      <span>90.00 {storeSettings.currency}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>زيت عباد الشمس 1 لتر x1</span>
                      <span>55.00 {storeSettings.currency}</span>
                    </div>
                  </div>
                  
                  <div className="border-t mt-2 pt-2">
                    <div className="flex justify-between">
                      <span>الإجمالي:</span>
                      <span className="font-bold">145.00 {storeSettings.currency}</span>
                    </div>
                  </div>
                  
                  {printerSettings.includeBarcode && (
                    <div className="flex justify-center mt-2">
                      <div className="h-8 bg-gray-800 w-32"></div>
                    </div>
                  )}
                  
                  <p className="text-xs mt-2">{printerSettings.footerText}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button onClick={handleSaveSettings} className="mr-auto">
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <BellRing className="h-5 w-5" />
                <CardTitle>إعدادات الإشعارات</CardTitle>
              </div>
              <CardDescription>
                إدارة الإشعارات والتنبيهات
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">إشعارات النظام</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="lowStockNotifications">إشعارات المخزون المنخفض</Label>
                        <p className="text-xs text-muted-foreground">
                          تنبيه عند انخفاض مخزون أي منتج
                        </p>
                      </div>
                      <Switch 
                        id="lowStockNotifications" 
                        checked={notificationSettings.lowStockNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          lowStockNotifications: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="salesNotifications">إشعارات المبيعات</Label>
                        <p className="text-xs text-muted-foreground">
                          تنبيه عند إتمام عملية بيع
                        </p>
                      </div>
                      <Switch 
                        id="salesNotifications" 
                        checked={notificationSettings.salesNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          salesNotifications: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="newProductNotifications">إشعارات المنتجات الجديدة</Label>
                        <p className="text-xs text-muted-foreground">
                          تنبيه عند إضافة منتج جديد
                        </p>
                      </div>
                      <Switch 
                        id="newProductNotifications" 
                        checked={notificationSettings.newProductNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          newProductNotifications: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="dailyReportNotifications">تقارير يومية</Label>
                        <p className="text-xs text-muted-foreground">
                          إرسال ملخص يومي للمبيعات والمخزون
                        </p>
                      </div>
                      <Switch 
                        id="dailyReportNotifications" 
                        checked={notificationSettings.dailyReportNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          dailyReportNotifications: checked
                        })}
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">طرق الإشعارات</h3>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="pushNotifications">إشعارات التطبيق</Label>
                        <p className="text-xs text-muted-foreground">
                          استلام الإشعارات داخل التطبيق
                        </p>
                      </div>
                      <Switch 
                        id="pushNotifications" 
                        checked={notificationSettings.pushNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          pushNotifications: checked
                        })}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="emailNotifications">إشعارات البريد الإلكتروني</Label>
                        <p className="text-xs text-muted-foreground">
                          استلام الإشعارات عبر البريد الإلكتروني
                        </p>
                      </div>
                      <Switch 
                        id="emailNotifications" 
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={(checked) => setNotificationSettings({
                          ...notificationSettings,
                          emailNotifications: checked
                        })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button onClick={handleSaveSettings} className="mr-auto">
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        {/* User Management */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <CardTitle>إدارة المستخدمين</CardTitle>
              </div>
              <CardDescription>
                إدارة صلاحيات المستخدمين
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">صلاحيات الأدوار</h3>
                  
                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">مدير النظام</CardTitle>
                          <Lock className="h-4 w-4 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          يمتلك وصولاً كاملاً إلى جميع وظائف النظام
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المنتجات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المستخدمين</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المبيعات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة التقارير</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة الإعدادات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المصروفات</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">كاشير</CardTitle>
                          <Receipt className="h-4 w-4 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          يمكنه استخدام نقطة البيع وإدارة المبيعات
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">استخدام نقطة البيع</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">عرض المنتجات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">طباعة الإيصالات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            <span className="text-xs">عرض التقارير (مقيد)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة المستخدمين</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة الإعدادات</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">موظف</CardTitle>
                          <Store className="h-4 w-4 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          يمكنه إدارة المخزون والمنتجات
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المنتجات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">إدارة المخزون</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            <span className="text-xs">عرض المبيعات (مقيد)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة المستخدمين</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة الإعدادات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة المصروفات</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    <Card>
                      <CardHeader className="py-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">مندوب توصيل</CardTitle>
                          <Truck className="h-4 w-4 text-primary" />
                        </div>
                      </CardHeader>
                      <CardContent className="py-2">
                        <p className="text-sm text-muted-foreground mb-2">
                          يمكنه عرض المعلومات الأساسية للتوصيل
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">عرض طلبات التوصيل</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs">تحديث حالة التوصيل</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                            <span className="text-xs">عرض المنتجات (مقيد)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة المبيعات</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة المخزون</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                            <span className="text-xs">إدارة الإعدادات</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t pt-6">
              <Button onClick={handleSaveSettings} className="mr-auto">
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
