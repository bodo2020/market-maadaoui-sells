import { useState, useEffect } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Package, 
  AlertTriangle, 
  Clock, 
  CheckCircle,
  Search,
  Filter,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, isAfter, differenceInDays, parseISO } from "date-fns";
import { ar } from "date-fns/locale";
import { getExpiringProducts, fetchProductBatches } from "@/services/supabase/productBatchService";
import { fetchProducts } from "@/services/supabase/productService";
import { ProductBatch } from "@/types";
import { ExpiryAlertCard } from "@/components/inventory/ExpiryAlertCard";
import { ExpiredProductActionsDialog } from "@/components/inventory/ExpiredProductActionsDialog";

export default function ExpiryManagement() {
  const [expiringProducts, setExpiringProducts] = useState<ProductBatch[]>([]);
  const [allBatches, setAllBatches] = useState<ProductBatch[]>([]);
  const [filteredBatches, setFilteredBatches] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDays, setFilterDays] = useState(7);
  const [selectedBatch, setSelectedBatch] = useState<ProductBatch | null>(null);
  const [actionsDialogOpen, setActionsDialogOpen] = useState(false);
  const { toast } = useToast();

  // دالة لجلب المنتجات منتهية الصلاحية من جدول products مباشرة
  const getExpiringProductsFromProducts = async (daysAhead: number = 7) => {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      const products = await fetchProducts();
      
      return products
        .filter(product => 
          product.expiry_date && 
          product.track_expiry &&
          new Date(product.expiry_date) <= futureDate &&
          product.quantity > 0
        )
        .map(product => ({
          id: product.id,
          product_id: product.id,
          batch_number: `MAIN-${product.id.slice(-6)}`,
          expiry_date: product.expiry_date!,
          quantity: product.quantity,
          shelf_location: product.shelf_location || null,
          purchase_date: null,
          supplier_id: null,
          notes: 'من المخزون الرئيسي',
          created_at: typeof product.created_at === 'string' ? product.created_at : new Date(product.created_at).toISOString(),
          updated_at: (() => {
            const updateTime = product.updated_at || product.created_at;
            return typeof updateTime === 'string' ? updateTime : new Date(updateTime).toISOString();
          })(),
          // إضافة بيانات المنتج للعرض
          product_name: product.name,
          product_barcode: product.barcode
        } as ProductBatch & { product_name: string; product_barcode?: string }));
    } catch (error) {
      console.error("Error fetching expiring products from products table:", error);
      return [];
    }
  };

  useEffect(() => {
    loadExpiryData();
  }, []);

  useEffect(() => {
    filterBatches();
  }, [searchTerm, filterDays, allBatches]);

  const loadExpiryData = async () => {
    setLoading(true);
    try {
      // جلب المنتجات منتهية الصلاحية من جدول product_batches
      const [expiringBatches, allBatches, expiringProducts] = await Promise.all([
        getExpiringProducts(7),
        fetchProductBatches(),
        getExpiringProductsFromProducts(7) // دالة جديدة لجلب المنتجات من جدول products
      ]);
      
      // دمج النتائج من الجدولين
      const combinedExpiring = [...expiringBatches, ...expiringProducts];
      const combinedAll = [...allBatches, ...expiringProducts];
      
      setExpiringProducts(combinedExpiring);
      setAllBatches(combinedAll);
    } catch (error) {
      console.error("Error loading expiry data:", error);
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل بيانات الصلاحية",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterBatches = () => {
    let filtered = allBatches;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(batch => 
        batch.batch_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        batch.shelf_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (batch as any).product_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by expiry date
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + filterDays);
    
    filtered = filtered.filter(batch => {
      const expiryDate = parseISO(batch.expiry_date);
      return expiryDate <= futureDate && batch.quantity > 0;
    });

    // Sort by expiry date (nearest first)
    filtered.sort((a, b) => {
      const dateA = parseISO(a.expiry_date);
      const dateB = parseISO(b.expiry_date);
      return dateA.getTime() - dateB.getTime();
    });

    setFilteredBatches(filtered);
  };

  const getExpiryStatus = (expiryDate: string) => {
    const expiry = parseISO(expiryDate);
    const today = new Date();
    const daysUntilExpiry = differenceInDays(expiry, today);

    if (daysUntilExpiry < 0) {
      return { status: 'expired', text: 'منتهي الصلاحية', color: 'bg-red-500' };
    } else if (daysUntilExpiry === 0) {
      return { status: 'today', text: 'ينتهي اليوم', color: 'bg-red-400' };
    } else if (daysUntilExpiry <= 3) {
      return { status: 'critical', text: `${daysUntilExpiry} أيام`, color: 'bg-orange-500' };
    } else if (daysUntilExpiry <= 7) {
      return { status: 'warning', text: `${daysUntilExpiry} أيام`, color: 'bg-yellow-500' };
    } else {
      return { status: 'good', text: `${daysUntilExpiry} يوم`, color: 'bg-green-500' };
    }
  };

  const getStatsData = () => {
    const expired = filteredBatches.filter(batch => {
      const expiry = parseISO(batch.expiry_date);
      return expiry < new Date();
    }).length;

    const expiringSoon = filteredBatches.filter(batch => {
      const expiry = parseISO(batch.expiry_date);
      const today = new Date();
      const daysUntilExpiry = differenceInDays(expiry, today);
      return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    }).length;

    const totalValue = filteredBatches.reduce((sum, batch) => {
      const expiry = parseISO(batch.expiry_date);
      const today = new Date();
      if (expiry <= today) {
        // Assume purchase price calculation here
        return sum + (batch.quantity * 10); // placeholder calculation
      }
      return sum;
    }, 0);

    return { expired, expiringSoon, totalValue };
  };

  const handleActionClick = (batch: ProductBatch) => {
    setSelectedBatch(batch);
    setActionsDialogOpen(true);
  };

  const handleActionComplete = () => {
    loadExpiryData(); // Reload data after action
  };

  const stats = getStatsData();

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>جاري تحميل بيانات الصلاحية...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4 space-x-reverse">
            <Calendar className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">إدارة الصلاحيات</h1>
              <p className="text-muted-foreground">
                تتبع ومراقبة تواريخ انتهاء صلاحية المنتجات
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="ml-2 h-4 w-4" />
              طباعة التقرير
            </Button>
            <Button onClick={loadExpiryData}>
              <Package className="ml-2 h-4 w-4" />
              تحديث البيانات
            </Button>
          </div>
        </div>

        {/* Alerts Section */}
        {expiringProducts.length > 0 && (
          <ExpiryAlertCard />
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">منتهية الصلاحية</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
              <p className="text-xs text-muted-foreground">منتج منتهي الصلاحية</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تنتهي قريباً</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.expiringSoon}</div>
              <p className="text-xs text-muted-foreground">منتج ينتهي خلال 7 أيام</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">قيمة الفاقد المحتمل</CardTitle>
              <Package className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.totalValue.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">جنيه مصري</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>البحث والتصفية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">البحث</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="اسم المنتج، رقم الدفعة، أو موقع الرف..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="filterDays">عرض المنتجات التي تنتهي خلال</Label>
                <select
                  id="filterDays"
                  value={filterDays}
                  onChange={(e) => setFilterDays(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value={3}>3 أيام</option>
                  <option value={7}>7 أيام</option>
                  <option value={14}>14 يوم</option>
                  <option value={30}>30 يوم</option>
                  <option value={90}>90 يوم</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>إجمالي النتائج</Label>
                <div className="text-2xl font-bold">{filteredBatches.length}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>قائمة المنتجات حسب تاريخ الصلاحية</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredBatches.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">لا توجد منتجات منتهية الصلاحية</h3>
                <p className="text-muted-foreground">
                  جميع المنتجات ضمن الفترة المحددة لا تواجه مشاكل في الصلاحية
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم المنتج</TableHead>
                      <TableHead>رقم الدفعة</TableHead>
                      <TableHead>موقع الرف</TableHead>
                      <TableHead>الكمية</TableHead>
                      <TableHead>تاريخ الصلاحية</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>الملاحظات</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.map((batch) => {
                      const status = getExpiryStatus(batch.expiry_date);
                      return (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">
                            {(batch as any).products?.name || (batch as any).product_name || `منتج #${batch.product_id.slice(-6)}`}
                          </TableCell>
                          <TableCell>{batch.batch_number}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {batch.shelf_location || 'غير محدد'}
                            </Badge>
                          </TableCell>
                          <TableCell>{batch.quantity}</TableCell>
                          <TableCell>
                            {format(parseISO(batch.expiry_date), 'dd/MM/yyyy', { locale: ar })}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-white ${status.color}`}>
                              {status.text}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {batch.notes || '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleActionClick(batch)}
                              disabled={batch.quantity === 0}
                            >
                              إجراء
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions Dialog */}
        <ExpiredProductActionsDialog
          open={actionsDialogOpen}
          onClose={() => setActionsDialogOpen(false)}
          batch={selectedBatch}
          onActionComplete={handleActionComplete}
        />
      </div>
    </MainLayout>
  );
}