import { useState, useEffect } from "react";
import { AlertTriangle, Calendar, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getExpiringProducts } from "@/services/supabase/productBatchService";
import { ProductBatch } from "@/types";
import { toast } from "sonner";

export function ExpiryAlertCard() {
  const [expiringProducts, setExpiringProducts] = useState<ProductBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpiringProducts();
  }, []);

  const loadExpiringProducts = async () => {
    try {
      setLoading(true);
      const products = await getExpiringProducts(30); // Get products expiring in 30 days
      setExpiringProducts(products);
    } catch (error) {
      console.error("Error loading expiring products:", error);
      toast.error("فشل في تحميل المنتجات منتهية الصلاحية");
    } finally {
      setLoading(false);
    }
  };

  const getExpiryStatus = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysUntilExpiry = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) {
      return { status: "expired", color: "destructive", text: "منتهي الصلاحية" };
    } else if (daysUntilExpiry <= 7) {
      return { status: "critical", color: "destructive", text: `${daysUntilExpiry} أيام` };
    } else if (daysUntilExpiry <= 30) {
      return { status: "warning", color: "secondary", text: `${daysUntilExpiry} يوم` };
    }
    return { status: "ok", color: "default", text: `${daysUntilExpiry} يوم` };
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            تنبيهات انتهاء الصلاحية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">جاري التحميل...</div>
        </CardContent>
      </Card>
    );
  }

  if (expiringProducts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-green-600" />
            تنبيهات انتهاء الصلاحية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <p>لا توجد منتجات منتهية الصلاحية قريباً</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-yellow-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-700">
          <AlertTriangle className="h-5 w-5" />
          تنبيهات انتهاء الصلاحية ({expiringProducts.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {expiringProducts.slice(0, 5).map((batch) => {
            const expiryInfo = getExpiryStatus(batch.expiry_date);
            return (
              <div key={batch.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex-1">
                  <p className="font-medium text-sm">{(batch as any).products?.name || "منتج غير محدد"}</p>
                  <p className="text-xs text-muted-foreground">
                    دفعة: {batch.batch_number} | كمية: {batch.quantity} وحدة
                    {batch.shelf_location && ` | موقع: ${batch.shelf_location}`}
                  </p>
                </div>
                <Badge variant={expiryInfo.color as any} className="text-xs">
                  {expiryInfo.text}
                </Badge>
              </div>
            );
          })}
          
          {expiringProducts.length > 5 && (
            <Button variant="outline" size="sm" className="w-full mt-3">
              عرض جميع المنتجات ({expiringProducts.length})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}