
import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  FileDown, 
  RefreshCw, 
  Package, 
  Calendar,
  CheckCircle,
  AlertCircle
} from "lucide-react";
import { fetchProducts } from "@/services/supabase/productService";
import { Product } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface InventoryItem extends Product {
  actualQuantity?: number;
  difference?: number;
  status?: 'pending' | 'checked' | 'discrepancy';
}

export default function DailyInventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadRandomProducts();
  }, []);

  const loadRandomProducts = async () => {
    setLoading(true);
    try {
      const allProducts = await fetchProducts();
      // اختيار 10-15 منتج عشوائي للجرد اليومي
      const randomCount = Math.floor(Math.random() * 6) + 10; // 10 إلى 15 منتج
      const shuffled = allProducts.sort(() => 0.5 - Math.random());
      const selectedProducts = shuffled.slice(0, randomCount);
      
      const inventoryData = selectedProducts.map(product => ({
        ...product,
        status: 'pending' as const
      }));
      
      setProducts(allProducts);
      setInventoryItems(inventoryData);
    } catch (error) {
      console.error("Error loading products:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل المنتجات",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleQuantityChange = (productId: string, actualQuantity: number) => {
    setInventoryItems(prev => prev.map(item => {
      if (item.id === productId) {
        const expectedQuantity = item.quantity || 0;
        const difference = actualQuantity - expectedQuantity;
        const status = difference === 0 ? 'checked' : 'discrepancy';
        
        return {
          ...item,
          actualQuantity,
          difference,
          status
        };
      }
      return item;
    }));
  };

  const exportToWord = async () => {
    setExporting(true);
    try {
      // إنشاء محتوى HTML للتصدير
      const currentDate = format(new Date(), 'yyyy-MM-dd', { locale: ar });
      const completedItems = inventoryItems.filter(item => item.status !== 'pending');
      
      let htmlContent = `
        <html dir="rtl">
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, Unicode MS; direction: rtl; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #000; padding: 8px; text-align: right; }
            th { background-color: #f0f0f0; font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; }
            .status-checked { color: green; }
            .status-discrepancy { color: red; }
            .summary { margin-top: 30px; padding: 15px; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>تقرير الجرد اليومي</h1>
            <h3>تاريخ: ${currentDate}</h3>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>اسم المنتج</th>
                <th>الباركود</th>
                <th>الكمية المتوقعة</th>
                <th>الكمية الفعلية</th>
                <th>الفرق</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
      `;

      completedItems.forEach(item => {
        const statusText = item.status === 'checked' ? 'مطابق' : 'يوجد اختلاف';
        const statusClass = item.status === 'checked' ? 'status-checked' : 'status-discrepancy';
        
        htmlContent += `
          <tr>
            <td>${item.name}</td>
            <td>${item.barcode || '-'}</td>
            <td>${item.quantity || 0}</td>
            <td>${item.actualQuantity || 0}</td>
            <td>${item.difference || 0}</td>
            <td class="${statusClass}">${statusText}</td>
          </tr>
        `;
      });

      const totalItems = completedItems.length;
      const checkedItems = completedItems.filter(item => item.status === 'checked').length;
      const discrepancyItems = completedItems.filter(item => item.status === 'discrepancy').length;

      htmlContent += `
            </tbody>
          </table>
          
          <div class="summary">
            <h3>ملخص الجرد:</h3>
            <p>إجمالي المنتجات المجردة: ${totalItems}</p>
            <p>المنتجات المطابقة: ${checkedItems}</p>
            <p>المنتجات بها اختلاف: ${discrepancyItems}</p>
            <p>تاريخ ووقت التصدير: ${format(new Date(), 'yyyy-MM-dd HH:mm', { locale: ar })}</p>
          </div>
        </body>
        </html>
      `;

      // إنشاء ملف Word
      const blob = new Blob([htmlContent], { 
        type: 'application/msword;charset=utf-8' 
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `تقرير_الجرد_${currentDate}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تصدير تقرير الجرد إلى ملف Word",
      });
    } catch (error) {
      console.error("Error exporting to Word:", error);
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير التقرير",
        variant: "destructive"
      });
    } finally {
      setExporting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'checked': return 'text-green-600';
      case 'discrepancy': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'checked': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'discrepancy': return <AlertCircle className="h-4 w-4 text-red-600" />;
      default: return null;
    }
  };

  const completedItems = inventoryItems.filter(item => item.status !== 'pending').length;
  const totalItems = inventoryItems.length;

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">الجرد اليومي</h1>
              <p className="text-muted-foreground">
                {format(new Date(), 'eeee، d MMMM yyyy', { locale: ar })}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={loadRandomProducts}
              disabled={loading}
            >
              <RefreshCw className={`ml-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              جرد جديد
            </Button>
            
            <Button 
              onClick={exportToWord}
              disabled={exporting || completedItems === 0}
            >
              <FileDown className="ml-2 h-4 w-4" />
              {exporting ? 'جاري التصدير...' : 'تصدير لملف Word'}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalItems}</div>
              <p className="text-xs text-muted-foreground">منتج للجرد اليوم</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">تم الجرد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{completedItems}</div>
              <p className="text-xs text-muted-foreground">من {totalItems} منتج</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">مطابق</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {inventoryItems.filter(item => item.status === 'checked').length}
              </div>
              <p className="text-xs text-muted-foreground">منتج مطابق للنظام</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">يحتاج مراجعة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {inventoryItems.filter(item => item.status === 'discrepancy').length}
              </div>
              <p className="text-xs text-muted-foreground">منتج به اختلاف</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="ml-2 h-5 w-5" />
              منتجات الجرد اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center items-center p-12">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الباركود</TableHead>
                      <TableHead>الكمية المتوقعة</TableHead>
                      <TableHead>الكمية الفعلية</TableHead>
                      <TableHead>الفرق</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center space-x-3 space-x-reverse">
                            <div className="h-10 w-10 rounded bg-gray-100 flex items-center justify-center">
                              <img 
                                src={item.image_urls?.[0] || "/placeholder.svg"} 
                                alt={item.name}
                                className="h-6 w-6 object-contain"
                              />
                            </div>
                            <div>
                              <div className="font-medium">{item.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {item.unit_of_measure || 'قطعة'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{item.barcode || '-'}</TableCell>
                        <TableCell>
                          <span className="font-medium">{item.quantity || 0}</span>
                        </TableCell>
                        <TableCell>
                          <div className="w-20">
                            <Input
                              type="number"
                              min="0"
                              placeholder="الكمية"
                              value={item.actualQuantity || ''}
                              onChange={(e) => 
                                handleQuantityChange(item.id, parseInt(e.target.value) || 0)
                              }
                              className="text-center"
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.difference !== undefined && (
                            <span className={`font-medium ${
                              item.difference === 0 
                                ? 'text-green-600' 
                                : item.difference > 0 
                                  ? 'text-blue-600' 
                                  : 'text-red-600'
                            }`}>
                              {item.difference > 0 ? '+' : ''}{item.difference}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 space-x-reverse">
                            {getStatusIcon(item.status || 'pending')}
                            <span className={`text-sm ${getStatusColor(item.status || 'pending')}`}>
                              {item.status === 'checked' && 'مطابق'}
                              {item.status === 'discrepancy' && 'اختلاف'}
                              {item.status === 'pending' && 'في الانتظار'}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
