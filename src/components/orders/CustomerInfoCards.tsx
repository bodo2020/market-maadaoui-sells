
import { Card, CardContent } from "@/components/ui/card";
import { ReactNode } from "react";

interface CustomerInfoCardsProps {
  customerName?: ReactNode;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  locationDetails?: string | null;
  notes?: string;
}

export function CustomerInfoCards({
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  locationDetails,
  notes
}: CustomerInfoCardsProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-medium mb-2">بيانات العميل</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الاسم</span>
              <span className="font-semibold">{customerName || "غير محدد"}</span>
            </div>
            
            {customerPhone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">رقم الهاتف</span>
                <span className="font-semibold">{customerPhone}</span>
              </div>
            )}
            
            {customerEmail && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">البريد الإلكتروني</span>
                <span className="font-semibold">{customerEmail}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="text-lg font-medium mb-2">عنوان الشحن</h3>
          <div className="space-y-3">
            {locationDetails && (
              <div>
                <span className="block text-muted-foreground mb-1">المنطقة</span>
                <span className="block">{locationDetails}</span>
              </div>
            )}
            
            {shippingAddress && (
              <div>
                <span className="block text-muted-foreground mb-1">العنوان التفصيلي</span>
                <span className="block">{shippingAddress}</span>
              </div>
            )}

            {!locationDetails && !shippingAddress && (
              <span className="text-muted-foreground">لا يوجد عنوان شحن</span>
            )}
          </div>
        </CardContent>
      </Card>

      {notes && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-medium mb-2">ملاحظات</h3>
            <p className="whitespace-pre-line">{notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
