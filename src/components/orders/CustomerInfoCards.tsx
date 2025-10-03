
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, MapPin, FileText, User } from "lucide-react";
import { ReactNode } from "react";

interface CustomerInfoCardsProps {
  customerName: ReactNode;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  notes?: string;
  governorate?: string;
  city?: string;
  area?: string;
  neighborhood?: string;
}

export function CustomerInfoCards({
  customerName,
  customerEmail,
  customerPhone,
  shippingAddress,
  notes,
  governorate,
  city,
  area,
  neighborhood,
}: CustomerInfoCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Contact Information Card */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            معلومات الاتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <User className="h-4 w-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-muted-foreground">اسم العميل</p>
              <p className="font-medium">{customerName || "غير محدد"}</p>
            </div>
          </div>

          {customerEmail && (
            <div className="flex items-start gap-3">
              <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                <a href={`mailto:${customerEmail}`} className="font-medium text-primary hover:underline">
                  {customerEmail}
                </a>
              </div>
            </div>
          )}

          {customerPhone && (
            <div className="flex items-start gap-3">
              <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                <a href={`tel:${customerPhone}`} className="font-medium text-primary hover:underline">
                  {customerPhone}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Information Card */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            معلومات الموقع
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {governorate && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">المحافظة</p>
                <p className="font-medium">{governorate}</p>
              </div>
            </div>
          )}

          {city && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">المدينة</p>
                <p className="font-medium">{city}</p>
              </div>
            </div>
          )}

          {area && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">المنطقة</p>
                <p className="font-medium">{area}</p>
              </div>
            </div>
          )}

          {neighborhood && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">الحي</p>
                <p className="font-medium">{neighborhood}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address and Notes Card */}
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            العنوان والملاحظات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shippingAddress && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">عنوان الشحن</p>
                <p className="font-medium">{shippingAddress}</p>
              </div>
            </div>
          )}

          {notes && (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">ملاحظات</p>
                <p className="font-medium">{notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
